-- Phase 1 foundation. Apply once in a new Supabase project.
-- Browser roles receive read access through RLS and narrowly scoped RPC writes.
begin;
create type public.app_role as enum ('ADMIN', 'SHEET_MANAGER', 'PICK_LEAD');

create table public.warehouse_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'America/Chicago'
);
insert into public.warehouse_settings default values;

create table public.pick_rows (
  id text primary key,
  building smallint not null,
  sort_order smallint not null unique
);
insert into public.pick_rows select 'B2-R' || n, 2, n from generate_series(1,6) n;
insert into public.pick_rows select 'B3-R' || n, 3, n+6 from generate_series(1,3) n;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  role public.app_role not null default 'PICK_LEAD',
  assigned_row_id text references public.pick_rows,
  active boolean not null default true
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  pick_row_id text not null references public.pick_rows,
  category text,
  active boolean not null default true
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  stand_name text not null,
  scheduled_date date not null,
  status text not null default 'PLANNED' check (status in ('PLANNED','ACTIVE','COMPLETE')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  check (completed_at is null or (started_at is not null and completed_at >= started_at))
);
create unique index one_active_warehouse_order on public.orders ((status)) where status='ACTIVE';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  product_id uuid not null references public.products,
  -- Order-time product/row snapshots preserve historical pick sheets.
  pick_row_id text not null references public.pick_rows,
  sku text not null,
  product_name text not null,
  full_case_qty integer not null check (full_case_qty >= 0),
  loose_qty integer not null default 0 check (loose_qty >= 0),
  completed_case_qty integer not null default 0,
  completed_loose_qty integer not null default 0,
  completed_at timestamptz,
  unique (order_id, product_id),
  check (completed_case_qty between 0 and full_case_qty),
  check (completed_loose_qty between 0 and loose_qty),
  check (completed_at is null or (completed_case_qty=full_case_qty and completed_loose_qty=loose_qty))
);
create function public.snapshot_order_product() returns trigger
language plpgsql set search_path='' as $$
declare p public.products;
begin
  select * into strict p from public.products where id=new.product_id;
  new.pick_row_id := p.pick_row_id;
  new.sku := p.sku;
  new.product_name := p.name;
  return new;
end $$;
create trigger snapshot_order_product before insert on public.order_items
for each row execute function public.snapshot_order_product();

create table public.daily_staffing (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total_workers integer not null check (total_workers >= 0),
  float_workers integer not null default 0 check (float_workers >= 0)
);
create table public.daily_staffing_rows (
  staffing_id uuid references public.daily_staffing,
  pick_row_id text references public.pick_rows,
  worker_count integer not null check (worker_count >= 0),
  primary key (staffing_id, pick_row_id)
);
create table public.order_staffing_snapshots (
  order_id uuid primary key references public.orders,
  staffing_id uuid references public.daily_staffing,
  captured_at timestamptz not null default now(),
  total_workers integer,
  float_workers integer
);
create table public.order_staffing_rows (
  order_id uuid references public.order_staffing_snapshots,
  pick_row_id text references public.pick_rows,
  worker_count integer not null check (worker_count >= 0),
  primary key (order_id,pick_row_id)
);
create table public.pick_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  pick_row_id text not null references public.pick_rows,
  row_started_at timestamptz,
  row_completed_at timestamptz,
  unique (order_id,pick_row_id),
  check (row_completed_at is null or (row_started_at is not null and row_completed_at >= row_started_at))
);
create table public.worker_movements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  occurred_at timestamptz not null default now(),
  source_row_id text not null references public.pick_rows,
  destination_row_id text not null references public.pick_rows,
  worker_count integer not null check (worker_count > 0),
  actor_id uuid not null references public.profiles,
  check (source_row_id <> destination_row_id)
);
create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  pick_row_id text references public.pick_rows,
  occurred_at timestamptz not null default now(),
  type text not null check (type in (
    'PICK_ROW_REPLENISHMENT','MISSING_PRODUCT','PRODUCT_NOT_FOUND',
    'QUANTITY_DISCREPANCY','BREAK_OR_LUNCH','EQUIPMENT_ISSUE','OTHER'
  )),
  note text,
  actor_id uuid not null references public.profiles
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  pick_row_id text references public.pick_rows,
  type text not null check (type in (
    'ORDER_START','PULL_COMPLETE','REPACK_START','PALLETIZE_START',
    'REPACK_COMPLETE','QA_COUNT_COMPLETE','FIRST_PALLET_COMPLETE',
    'FINAL_PALLET_BUILT','FINAL_WRAP_LABEL_COMPLETE','ORDER_COMPLETE',
    'ROW_START','ROW_COMPLETE','ITEM_COMPLETE','ITEM_UNDO','CORRECTION'
  )),
  occurred_at timestamptz not null default now(),
  actor_id uuid not null references public.profiles,
  payload jsonb not null default '{}',
  corrects_event_id uuid references public.events
);
create index events_order_time on public.events (order_id,occurred_at);
create index orders_schedule on public.orders (scheduled_date);
create index items_order_row on public.order_items (order_id,pick_row_id);

create function public.current_role() returns public.app_role
language sql stable security definer set search_path='' as $$
  select role from public.profiles where id=auth.uid() and active
$$;
create function public.can_access_row(row_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.profiles where id=auth.uid() and active
      and (role in ('ADMIN','SHEET_MANAGER') or assigned_row_id=row_id)
  )
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'warehouse_settings','profiles','products','pick_rows','orders','order_items',
    'daily_staffing','daily_staffing_rows','order_staffing_snapshots',
    'order_staffing_rows','pick_sessions','worker_movements','exceptions','events'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy settings_read on public.warehouse_settings for select to authenticated using (public.current_role() is not null);
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.current_role()='ADMIN');
create policy rows_read on public.pick_rows for select to authenticated using (public.current_role() is not null);
create policy orders_read on public.orders for select to authenticated using (public.current_role() is not null);
create policy products_read on public.products for select to authenticated using (public.can_access_row(pick_row_id));
create policy items_read on public.order_items for select to authenticated using (public.can_access_row(pick_row_id));
create policy sessions_read on public.pick_sessions for select to authenticated using (public.can_access_row(pick_row_id));
create policy staffing_read on public.daily_staffing for select to authenticated using (public.current_role() in ('ADMIN','SHEET_MANAGER'));
create policy staffing_rows_read on public.daily_staffing_rows for select to authenticated using (public.current_role() in ('ADMIN','SHEET_MANAGER'));
create policy snapshots_read on public.order_staffing_snapshots for select to authenticated using (public.current_role() in ('ADMIN','SHEET_MANAGER'));
create policy snapshot_rows_read on public.order_staffing_rows for select to authenticated using (public.can_access_row(pick_row_id));
create policy movements_read on public.worker_movements for select to authenticated using (public.current_role() in ('ADMIN','SHEET_MANAGER'));
create policy exceptions_read on public.exceptions for select to authenticated using (public.can_access_row(pick_row_id));
create policy events_read on public.events for select to authenticated using (public.can_access_row(pick_row_id));

-- Shared order lock is taken first by every operational write.
-- This serializes taps across sessions and devices, avoiding completion races.
create function public.start_order(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; s public.daily_staffing; stamp timestamptz; zone text;
begin
  if public.current_role() is null or public.current_role() not in ('ADMIN','SHEET_MANAGER') then
    raise exception 'Manager access required';
  end if;
  select * into o from public.orders where id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status='ACTIVE' then return; end if;
  if o.status<>'PLANNED' then raise exception 'Order must be planned'; end if;
  stamp := clock_timestamp();
  select timezone into zone from public.warehouse_settings where id;
  -- No staffing writer exists yet; lock plans while validating/copying this snapshot.
  lock table public.daily_staffing,public.daily_staffing_rows in share mode;
  select * into s from public.daily_staffing where date=(stamp at time zone zone)::date;
  if found and s.total_workers <> s.float_workers +
    coalesce((select sum(worker_count) from public.daily_staffing_rows where staffing_id=s.id),0)
    then raise exception 'Daily staffing totals do not match'; end if;
  update public.orders set status='ACTIVE',started_at=stamp where id=p_order;
  insert into public.pick_sessions(order_id,pick_row_id) select p_order,id from public.pick_rows;
  insert into public.order_staffing_snapshots(order_id,staffing_id,captured_at,total_workers,float_workers)
    values(p_order,s.id,stamp,s.total_workers,s.float_workers);
  insert into public.order_staffing_rows
    select p_order,pick_row_id,worker_count from public.daily_staffing_rows where staffing_id=s.id;
  insert into public.events(order_id,type,actor_id,occurred_at)
    values(p_order,'ORDER_START',auth.uid(),stamp);
end $$;

create function public.row_action(p_order uuid,p_row text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.pick_sessions; stamp timestamptz;
begin
  if not public.can_access_row(p_row) then raise exception 'Row access denied'; end if;
  perform 1 from public.orders where id=p_order and status='ACTIVE' for update;
  if not found then raise exception 'Order is not active'; end if;
  select * into s from public.pick_sessions where order_id=p_order and pick_row_id=p_row for update;
  if not found then raise exception 'Row session not found'; end if;
  stamp := clock_timestamp();
  if p_action='START' then
    if s.row_started_at is not null then return; end if;
    update public.pick_sessions set row_started_at=stamp where id=s.id;
  elsif p_action='COMPLETE' then
    if s.row_completed_at is not null then return; end if;
    if s.row_started_at is null then raise exception 'Start the row first'; end if;
    if exists(select 1 from public.order_items where order_id=p_order and pick_row_id=p_row and completed_at is null)
      then raise exception 'Pick every product before completing the row'; end if;
    update public.pick_sessions set row_completed_at=stamp where id=s.id;
  else raise exception 'Unknown row action'; end if;
  insert into public.events(order_id,pick_row_id,type,actor_id,occurred_at)
    values(p_order,p_row,'ROW_'||p_action,auth.uid(),stamp);
end $$;

create function public.set_item_complete(p_item uuid,p_complete boolean) returns void
language plpgsql security definer set search_path='' as $$
declare i public.order_items; s public.pick_sessions; stamp timestamptz;
begin
  if p_complete is null then raise exception 'Completion state is required'; end if;
  select * into i from public.order_items where id=p_item;
  if not found or not public.can_access_row(i.pick_row_id) then raise exception 'Item access denied'; end if;
  perform 1 from public.orders where id=i.order_id and status='ACTIVE' for update;
  if not found then raise exception 'Order is not active'; end if;
  select * into s from public.pick_sessions where order_id=i.order_id and pick_row_id=i.pick_row_id for update;
  if s.row_started_at is null or s.row_completed_at is not null then raise exception 'Row must be running'; end if;
  select * into i from public.order_items where id=p_item for update;
  if (i.completed_at is not null)=p_complete then return; end if;
  stamp := clock_timestamp();
  update public.order_items set
    completed_case_qty=case when p_complete then full_case_qty else 0 end,
    completed_loose_qty=case when p_complete then loose_qty else 0 end,
    completed_at=case when p_complete then stamp else null end
    where id=p_item;
  insert into public.events(order_id,pick_row_id,type,actor_id,occurred_at,payload)
    values(i.order_id,i.pick_row_id,case when p_complete then 'ITEM_COMPLETE' else 'ITEM_UNDO' end,
      auth.uid(),stamp,jsonb_build_object('item_id',p_item,'cases',i.full_case_qty,'loose',i.loose_qty));
end $$;

create function public.server_time() returns timestamptz
language sql stable set search_path='' as $$ select now() $$;
revoke all on function public.snapshot_order_product(),public.current_role(),public.can_access_row(text),
  public.start_order(uuid),public.row_action(uuid,text,text),public.set_item_complete(uuid,boolean),public.server_time()
  from public,anon;
grant execute on function public.current_role(),public.can_access_row(text),public.start_order(uuid),
  public.row_action(uuid,text,text),public.set_item_complete(uuid,boolean),public.server_time() to authenticated;
alter publication supabase_realtime add table public.orders,public.order_items,public.pick_sessions;
commit;
