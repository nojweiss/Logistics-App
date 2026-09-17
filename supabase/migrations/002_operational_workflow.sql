-- Additive update to the deployed 001 schema. Run once, as a single transaction.
begin;

create function public.pack_levels(p_text text) returns integer[]
language plpgsql immutable set search_path='' as $$
declare v text; parts integer[]; n integer; total numeric:=1;
begin
  if p_text is null then return null; end if;
  v:=regexp_replace(p_text,'\s','','g');
  if v !~ '^[1-9][0-9]*(/[1-9][0-9]*)*$' then raise exception 'Use positive packaging levels such as 4/1 or 8/20/100'; end if;
  parts:=string_to_array(v,'/')::integer[];
  if cardinality(parts)>8 then raise exception 'Maximum packaging depth is 8'; end if;
  foreach n in array parts loop
    if n>1000000 then raise exception 'Packaging level too large'; end if;
    total:=total*n;
    if total>9007199254740991 then raise exception 'Units per case exceed safe numeric range'; end if;
  end loop;
  return parts;
end $$;
create function public.pack_units(p_text text) returns bigint
language plpgsql immutable set search_path='' as $$
declare n integer; total bigint:=1; levels integer[];
begin
  levels:=public.pack_levels(p_text);
  if levels is null then return null; end if;
  foreach n in array levels loop total:=total*n; end loop;
  return total;
end $$;
alter table public.products
  add column case_pack_display text,
  add column case_pack_levels integer[] generated always as (public.pack_levels(case_pack_display)) stored,
  add column units_per_case bigint generated always as (public.pack_units(case_pack_display)) stored,
  add column version integer not null default 1;
-- Unknown historical packaging is left NULL, never guessed.
alter table public.order_items
  add column case_pack_display text,
  add column case_pack_levels integer[],
  add column units_per_case bigint,
  add column group_id text,
  add column picker_worker_id uuid,
  add column picker_initials text,
  add column original_picker_worker_id uuid,
  add column original_picker_initials text,
  add column original_picked_at timestamptz,
  add column pick_version integer not null default 0;
alter table public.pick_sessions
  add column clearing_started_at timestamptz,
  add column clearing_completed_at timestamptz,
  add constraint clearing_time_order check (
    (clearing_started_at is null or (row_completed_at is not null and clearing_started_at>=row_completed_at))
    and (clearing_completed_at is null or (clearing_started_at is not null and clearing_completed_at>=clearing_started_at))
  );
alter table public.orders add column palletize_started_at timestamptz;
create table public.operation_groups (
  id text primary key,
  name text not null,
  repack_row_id text not null unique references public.pick_rows,
  box_prefix text not null unique check (box_prefix in ('A','B','C','D'))
);
insert into public.operation_groups values
 ('A','Building 2 · Aisle 1','B2-R1','A'),
 ('B','Building 2 · Aisle 2','B2-R3','B'),
 ('C','Building 2 · Aisle 3','B2-R5','C'),
 ('D','Building 3 · Group D','B3-R1','D');
alter table public.pick_rows add column group_id text references public.operation_groups,
  add column verification_role text check (verification_role in ('REPACK','FULL_CASE'));
update public.pick_rows set group_id=case when building=3 then 'D'
 when id in ('B2-R1','B2-R2') then 'A' when id in ('B2-R3','B2-R4') then 'B' else 'C' end;
update public.pick_rows set verification_role=case when id in ('B2-R1','B2-R3','B2-R5','B3-R1') then 'REPACK' else 'FULL_CASE' end;
alter table public.pick_rows alter column group_id set not null, alter column verification_role set not null;
update public.order_items i set group_id=r.group_id from public.pick_rows r where r.id=i.pick_row_id;
alter table public.order_items alter column group_id set not null,
  add foreign key (group_id) references public.operation_groups;

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  initials text not null check (initials ~ '^[A-Z0-9]{1,4}$'),
  active boolean not null default true,
  version integer not null default 1
);
create table public.daily_worker_assignments (
  work_date date not null,
  worker_id uuid not null references public.workers,
  pick_row_id text references public.pick_rows,
  primary key(work_date,worker_id)
);
create table public.order_workers (
  order_id uuid not null references public.orders,
  worker_id uuid not null references public.workers,
  initial_row_id text references public.pick_rows,
  current_row_id text references public.pick_rows,
  name_snapshot text not null,
  initials_snapshot text not null,
  at_start boolean not null default false,
  joined_at timestamptz not null default clock_timestamp(),
  primary key(order_id,worker_id)
);
alter table public.order_items add foreign key(picker_worker_id) references public.workers,
  add foreign key(original_picker_worker_id) references public.workers;
alter table public.worker_movements alter column source_row_id drop not null,
  alter column destination_row_id drop not null,
  add column worker_ids uuid[] not null default '{}';
alter table public.worker_movements drop constraint worker_movements_check;
alter table public.worker_movements add constraint movement_distinct_rows
  check (source_row_id is distinct from destination_row_id);
create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_id uuid not null references public.profiles,
  occurred_at timestamptz not null default clock_timestamp(),
  before_data jsonb,
  after_data jsonb
);
create table public.inventory_attention (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  order_item_id uuid not null references public.order_items,
  pick_row_id text not null references public.pick_rows,
  kind text not null check (kind in ('LOW','ZERO')),
  status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','RESOLVED')),
  available_cases integer check(available_cases>=0),
  available_packs integer check(available_packs>=0),
  note text not null default '',
  reporter_id uuid not null references public.profiles,
  reporter_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  version integer not null default 1
);
create unique index one_open_attention_per_kind on public.inventory_attention(order_item_id,kind) where status<>'RESOLVED';
create table public.repack_boxes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  group_id text not null references public.operation_groups,
  station_row_id text not null references public.pick_rows,
  prefix text not null,
  box_number integer not null check(box_number>0),
  status text not null default 'OPEN' check(status in ('OPEN','CLOSED')),
  request_id uuid not null,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  version integer not null default 1,
  unique(order_id,prefix,box_number),
  unique(order_id,request_id)
);
create table public.repack_box_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  box_id uuid not null references public.repack_boxes,
  order_item_id uuid not null references public.order_items,
  expected_qty integer not null check(expected_qty>0),
  actual_qty integer not null check(actual_qty>=0),
  removed_at timestamptz,
  updated_by uuid not null references public.profiles,
  updated_at timestamptz not null default clock_timestamp(),
  version integer not null default 1,
  unique(box_id,order_item_id)
);
create table public.full_case_verifications (
  order_item_id uuid primary key references public.order_items,
  order_id uuid not null references public.orders,
  expected_qty integer not null check(expected_qty>0),
  actual_qty integer not null check(actual_qty>=0),
  status text not null check(status in ('VERIFIED','DISCREPANCY')),
  verifier_id uuid not null references public.profiles,
  verifier_name text not null,
  verified_at timestamptz not null default clock_timestamp(),
  version integer not null default 1
);
create table public.quantity_discrepancies (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  order_item_id uuid not null references public.order_items,
  box_id uuid references public.repack_boxes,
  kind text not null check(kind in ('REPACK','FULL_CASE')),
  expected_qty integer not null,
  actual_qty integer not null,
  note text not null default '',
  status text not null default 'OPEN' check(status in ('OPEN','RESOLVED','SUPERSEDED')),
  actor_id uuid not null references public.profiles,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles
);
create table public.order_group_status (
  order_id uuid not null references public.orders,
  group_id text not null references public.operation_groups,
  is_ready boolean not null default false,
  ready_at timestamptz,
  palletize_started_at timestamptz,
  primary key(order_id,group_id)
);
insert into public.order_group_status(order_id,group_id) select o.id,g.id from public.orders o cross join public.operation_groups g;

-- Preserve every old event; expand the permitted vocabulary without rewriting history.
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check(type in (
 'ORDER_START','PULL_COMPLETE','REPACK_START','PALLETIZE_START','REPACK_COMPLETE','QA_COUNT_COMPLETE',
 'FIRST_PALLET_COMPLETE','FINAL_PALLET_BUILT','FINAL_WRAP_LABEL_COMPLETE','ORDER_COMPLETE',
 'ROW_START','ROW_COMPLETE','ITEM_COMPLETE','ITEM_UNDO','CORRECTION',
 'ROW_PICK_START','ROW_PICK_COMPLETE','ROW_CLEARING_START','ROW_CLEARING_COMPLETE',
 'ITEM_PICKED','ITEM_PICK_UNDONE','PICKER_CORRECTED','INVENTORY_LOW','INVENTORY_ZERO','INVENTORY_STATUS',
 'TEAM_CHANGED','WORKERS_MOVED','REPACK_BOX_CREATED','REPACK_ITEM_ADDED','REPACK_ITEM_CORRECTED',
 'REPACK_ITEM_REMOVED','REPACK_BOX_COMPLETE','REPACK_BOX_REOPENED','REPACK_DISCREPANCY',
 'FULL_CASE_VERIFIED','FULL_CASE_DISCREPANCY','DISCREPANCY_RESOLVED',
 'AISLE_READY_FOR_PALLETIZATION','AISLE_READINESS_REVOKED','GROUP_PALLETIZE_START'
));
create index attention_order on public.inventory_attention(order_id,status,kind);
create index box_order on public.repack_boxes(order_id);
create index box_items_order on public.repack_box_items(order_id,order_item_id);
create index discrepancy_order on public.quantity_discrepancies(order_id,status);

create function public.is_manager() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.current_role() in ('ADMIN','SHEET_MANAGER'),false)
$$;
create function public.can_group(p_group text,p_mode text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_manager() or exists (
 select 1 from public.profiles p join public.pick_rows r on r.id=p.assigned_row_id
 where p.id=auth.uid() and p.active and r.group_id=p_group and (p_mode is null or r.verification_role=p_mode))
$$;
create function public.can_read_item(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.order_items where id=p_item and public.can_group(group_id))
$$;
create function public.assert_active(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.current_role() is null then raise exception 'Account not authorized'; end if;
 perform 1 from public.orders where id=p_order and status='ACTIVE' for update;
 if not found then raise exception 'Order is not active'; end if;
end $$;
create function public.audit_order(p_order uuid,p_type text,p_row text default null,p_payload jsonb default '{}')
returns void language sql security definer set search_path='' as $$
 insert into public.events(order_id,type,pick_row_id,actor_id,occurred_at,payload)
 values(p_order,p_type,p_row,auth.uid(),clock_timestamp(),p_payload)
$$;
create function public.assert_verifier(p_order uuid,p_group text,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.can_group(p_group,p_mode) then raise exception 'Verification access denied'; end if;
 if not public.is_manager() and not exists (
   select 1 from public.pick_sessions s join public.profiles p on p.assigned_row_id=s.pick_row_id
   where p.id=auth.uid() and s.order_id=p_order and s.clearing_completed_at is not null
 ) then raise exception 'Complete your row clearing first'; end if;
end $$;

create or replace function public.snapshot_order_product() returns trigger
language plpgsql set search_path='' as $$
declare p public.products;
begin
 select * into strict p from public.products where id=new.product_id;
 new.pick_row_id:=p.pick_row_id; new.sku:=p.sku; new.product_name:=p.name;
 new.case_pack_display:=p.case_pack_display; new.case_pack_levels:=p.case_pack_levels; new.units_per_case:=p.units_per_case;
 select group_id into new.group_id from public.pick_rows where id=p.pick_row_id;
 return new;
end $$;

-- Lead reads expand only to their assigned aisle/group for downstream verification.
drop policy items_read on public.order_items;
create policy items_read on public.order_items for select to authenticated using(public.can_group(group_id));
drop policy sessions_read on public.pick_sessions;
create policy sessions_read on public.pick_sessions for select to authenticated using(
 public.can_access_row(pick_row_id) or exists(select 1 from public.pick_rows r where r.id=pick_row_id and public.can_group(r.group_id)));

create function public.group_ready(p_order uuid,p_group text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.order_items where order_id=p_order and group_id=p_group and full_case_qty+loose_qty>0)
 and not exists(
   select 1 from public.order_items i where i.order_id=p_order and i.group_id=p_group and i.full_case_qty+i.loose_qty>0 and (
     i.completed_at is null
     or not exists(select 1 from public.pick_sessions s where s.order_id=p_order and s.pick_row_id=i.pick_row_id and s.clearing_completed_at is not null)
     or (i.full_case_qty>0 and not exists(select 1 from public.full_case_verifications v where v.order_item_id=i.id and v.status='VERIFIED' and v.actual_qty=i.full_case_qty))
     or (i.loose_qty>0 and (
       (select coalesce(sum(l.expected_qty),0) from public.repack_box_items l join public.repack_boxes b on b.id=l.box_id where l.order_item_id=i.id and l.removed_at is null and b.status='CLOSED')<>i.loose_qty
       or (select coalesce(sum(l.actual_qty),0) from public.repack_box_items l join public.repack_boxes b on b.id=l.box_id where l.order_item_id=i.id and l.removed_at is null and b.status='CLOSED')<>i.loose_qty
     ))
     or exists(select 1 from public.quantity_discrepancies d where d.order_item_id=i.id and d.status='OPEN')
     or exists(select 1 from public.inventory_attention a where a.order_item_id=i.id and a.kind='ZERO' and a.status<>'RESOLVED')
   )
 )
$$;
create function public.refresh_group_readiness(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g public.operation_groups; ready boolean; old_ready boolean;
begin
 for g in select * from public.operation_groups loop
   ready:=public.group_ready(p_order,g.id);
   insert into public.order_group_status(order_id,group_id) values(p_order,g.id) on conflict do nothing;
   select is_ready into old_ready from public.order_group_status where order_id=p_order and group_id=g.id for update;
   if ready is distinct from old_ready then
     update public.order_group_status set is_ready=ready,ready_at=case when ready then clock_timestamp() else ready_at end
       where order_id=p_order and group_id=g.id;
     perform public.audit_order(p_order,case when ready then 'AISLE_READY_FOR_PALLETIZATION' else 'AISLE_READINESS_REVOKED' end,null,jsonb_build_object('group_id',g.id));
   end if;
 end loop;
end $$;
create function public.save_product(p_id uuid,p_name text,p_pack text,p_row text,p_active boolean,p_version integer default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare old public.products; result_id uuid:=coalesce(p_id,gen_random_uuid());
begin
 if public.current_role() is distinct from 'ADMIN' then raise exception 'Admin access required'; end if;
 if length(btrim(p_name)) not between 1 and 200 or p_name is null then raise exception 'Product name required'; end if;
 if p_pack is null then raise exception 'Case pack required'; end if;
 perform public.pack_levels(p_pack);
 if not exists(select 1 from public.pick_rows where id=p_row) then raise exception 'Invalid pick location'; end if;
 if p_id is not null then
   select * into old from public.products where id=p_id for update;
   if not found then raise exception 'Product not found'; end if;
   if p_version is null or old.version<>p_version then raise exception 'Product changed. Refresh before editing'; end if;
   update public.products set name=btrim(p_name),case_pack_display=btrim(p_pack),pick_row_id=p_row,active=p_active,version=version+1 where id=p_id;
 else
   insert into public.products(id,sku,name,case_pack_display,pick_row_id,active)
   values(result_id,'AUTO-'||result_id,btrim(p_name),btrim(p_pack),p_row,p_active);
 end if;
 insert into public.admin_audit(entity_type,entity_id,action,actor_id,before_data,after_data)
 select 'PRODUCT',result_id::text,'SAVE',auth.uid(),to_jsonb(old),to_jsonb(p) from public.products p where id=result_id;
 return result_id;
end $$;
-- Keep numeric daily totals consistent with the active named roster.
create function public.sync_daily_counts(p_date date) returns void
language plpgsql security definer set search_path='' as $$
declare staffing uuid;
begin
 insert into public.daily_staffing(date,total_workers,float_workers)
 select p_date,count(*)::integer,count(*) filter(where a.pick_row_id is null)::integer
 from public.daily_worker_assignments a join public.workers w on w.id=a.worker_id and w.active where a.work_date=p_date
 on conflict(date) do update set total_workers=excluded.total_workers,float_workers=excluded.float_workers returning id into staffing;
 insert into public.daily_staffing_rows(staffing_id,pick_row_id,worker_count)
 select staffing,r.id,count(w.id)::integer from public.pick_rows r
 left join public.daily_worker_assignments a on a.pick_row_id=r.id and a.work_date=p_date
 left join public.workers w on w.id=a.worker_id and w.active group by r.id
 on conflict(staffing_id,pick_row_id) do update set worker_count=excluded.worker_count;
end $$;
create function public.remove_daily_worker(p_date date,p_worker uuid) returns void
language plpgsql security definer set search_path='' as $$
declare old public.daily_worker_assignments;
begin
 if public.current_role() is null then raise exception 'Account not authorized'; end if;
 lock table public.daily_staffing,public.daily_staffing_rows in share row exclusive mode;
 lock table public.daily_worker_assignments in share row exclusive mode;
 select * into old from public.daily_worker_assignments where work_date=p_date and worker_id=p_worker;
 if not found then return; end if;
 if not public.is_manager() and (not public.can_access_row(old.pick_row_id)
 or p_date<>(clock_timestamp() at time zone (select timezone from public.warehouse_settings where id))::date)
 then raise exception 'Only your own current-day team can be changed'; end if;
 delete from public.daily_worker_assignments where work_date=p_date and worker_id=p_worker;
 perform public.sync_daily_counts(p_date);
 insert into public.admin_audit(entity_type,entity_id,action,actor_id,before_data)
 values('DAILY_TEAM',p_date||'/'||p_worker,'REMOVE',auth.uid(),to_jsonb(old));
end $$;
create function public.save_worker(p_id uuid,p_name text,p_initials text,p_active boolean,p_version integer default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare old public.workers; result_id uuid:=coalesce(p_id,gen_random_uuid()); day date;
begin
 if not public.is_manager() then raise exception 'Manager access required'; end if;
 lock table public.daily_staffing,public.daily_staffing_rows in share row exclusive mode;
 lock table public.daily_worker_assignments in share row exclusive mode;
 if p_id is not null then
   select * into old from public.workers where id=p_id for update;
   if not found or p_version is null or old.version<>p_version then raise exception 'Worker changed. Refresh before editing'; end if;
   update public.workers set name=btrim(p_name),initials=upper(btrim(p_initials)),active=p_active,version=version+1 where id=p_id;
 else
   insert into public.workers(id,name,initials,active) values(result_id,btrim(p_name),upper(btrim(p_initials)),p_active);
 end if;
 insert into public.admin_audit(entity_type,entity_id,action,actor_id,before_data,after_data)
 select 'WORKER',result_id::text,'SAVE',auth.uid(),to_jsonb(old),to_jsonb(w) from public.workers w where id=result_id;
 for day in select distinct work_date from public.daily_worker_assignments where worker_id=result_id and work_date>=(clock_timestamp() at time zone (select timezone from public.warehouse_settings where id))::date loop
 perform public.sync_daily_counts(day);
 end loop;
 return result_id;
end $$;
create function public.set_daily_worker(p_date date,p_worker uuid,p_row text)
returns void language plpgsql security definer set search_path='' as $$
declare old public.daily_worker_assignments; staffing uuid;
begin
 if public.current_role() is null then raise exception 'Account not authorized'; end if;
 if p_date is null then raise exception 'Date required'; end if;
 -- Fixed lock order matches start_order: staffing before assignments.
 lock table public.daily_staffing,public.daily_staffing_rows in share row exclusive mode;
 lock table public.daily_worker_assignments in share row exclusive mode;
 select * into old from public.daily_worker_assignments where work_date=p_date and worker_id=p_worker;
 if not public.is_manager() and (
   not public.can_access_row(p_row)
   or (old.pick_row_id is not null and not public.can_access_row(old.pick_row_id))
   or p_date<>(clock_timestamp() at time zone (select timezone from public.warehouse_settings where id))::date
 ) then raise exception 'Only your own current-day team can be selected'; end if;
 if not exists(select 1 from public.workers where id=p_worker and active) then raise exception 'Active worker required'; end if;
 insert into public.daily_worker_assignments(work_date,worker_id,pick_row_id) values(p_date,p_worker,p_row)
 on conflict(work_date,worker_id) do update set pick_row_id=excluded.pick_row_id;
 perform public.sync_daily_counts(p_date);
 insert into public.admin_audit(entity_type,entity_id,action,actor_id,before_data,after_data)
 values('DAILY_TEAM',p_date||'/'||p_worker,'ASSIGN',auth.uid(),to_jsonb(old),jsonb_build_object('worker_id',p_worker,'row_id',p_row));
end $$;
-- Add named workers without changing the count snapshot created by the original start transaction.
create function public.capture_named_team() returns trigger language plpgsql security definer set search_path='' as $$
declare day date;
begin
 if new.status='ACTIVE' and old.status is distinct from 'ACTIVE' then
   day:=(new.started_at at time zone (select timezone from public.warehouse_settings where id))::date;
   insert into public.order_workers(order_id,worker_id,initial_row_id,current_row_id,name_snapshot,initials_snapshot,at_start)
   select new.id,w.id,a.pick_row_id,a.pick_row_id,w.name,w.initials,true from public.daily_worker_assignments a
   join public.workers w on w.id=a.worker_id where a.work_date=day and w.active;
   insert into public.order_group_status(order_id,group_id) select new.id,id from public.operation_groups on conflict do nothing;
 end if;
 return new;
end $$;
create trigger capture_named_team after update of status on public.orders for each row execute function public.capture_named_team();
create function public.assign_order_worker(p_order uuid,p_worker uuid,p_row text)
returns void language plpgsql security definer set search_path='' as $$
declare old public.order_workers; w public.workers;
begin
 perform public.assert_active(p_order);
 select * into old from public.order_workers where order_id=p_order and worker_id=p_worker for update;
 if not public.is_manager() and (not public.can_access_row(p_row) or (old.current_row_id is not null and not public.can_access_row(old.current_row_id)))
 then raise exception 'Cannot take a worker from another row'; end if;
 select * into w from public.workers where id=p_worker and active;
 if not found then raise exception 'Active worker required'; end if;
 if old.worker_id is not null and old.current_row_id is not distinct from p_row then return; end if;
 insert into public.order_workers(order_id,worker_id,initial_row_id,current_row_id,name_snapshot,initials_snapshot)
 values(p_order,p_worker,p_row,p_row,w.name,w.initials)
 on conflict(order_id,worker_id) do update set current_row_id=excluded.current_row_id;
 if old.current_row_id is distinct from p_row then
 insert into public.worker_movements(order_id,source_row_id,destination_row_id,worker_count,worker_ids,actor_id)
 values(p_order,old.current_row_id,p_row,1,array[p_worker],auth.uid());
 end if;
 perform public.audit_order(p_order,'TEAM_CHANGED',p_row,jsonb_build_object('worker_id',p_worker,'initials',w.initials,'source',old.current_row_id,'destination',p_row));
end $$;
create function public.move_workers(p_order uuid,p_workers uuid[],p_source text,p_destination text)
returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not public.is_manager() then raise exception 'Manager access required'; end if;
 perform public.assert_active(p_order);
 n:=cardinality(p_workers);
 if n is null or n=0 or n<>(select count(distinct x) from unnest(p_workers) x) or p_source is not distinct from p_destination
 then raise exception 'Select distinct workers and different rows'; end if;
 if (select count(*) from public.order_workers where order_id=p_order and worker_id=any(p_workers) and current_row_id is not distinct from p_source)<>n
 then raise exception 'Assignments changed. Refresh before moving workers'; end if;
 update public.order_workers set current_row_id=p_destination where order_id=p_order and worker_id=any(p_workers);
 insert into public.worker_movements(order_id,source_row_id,destination_row_id,worker_count,worker_ids,actor_id)
 values(p_order,p_source,p_destination,n,p_workers,auth.uid());
 perform public.audit_order(p_order,'WORKERS_MOVED',p_destination,jsonb_build_object('worker_ids',p_workers,'count',n,'source',p_source,'destination',p_destination));
end $$;
create function public.record_pick(p_item uuid,p_worker uuid,p_undo boolean default false,p_version integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare i public.order_items; s public.pick_sessions; w public.order_workers; stamp timestamptz; event_type text;
begin
 select * into i from public.order_items where id=p_item;
 if not found or not public.can_access_row(i.pick_row_id) then raise exception 'Item access denied'; end if;
 perform public.assert_active(i.order_id);
 select * into i from public.order_items where id=p_item for update;
 select * into s from public.pick_sessions where order_id=i.order_id and pick_row_id=i.pick_row_id for update;
 if p_version is null or i.pick_version<>p_version then raise exception 'Pick changed. Refresh before editing'; end if;
 if s.row_started_at is null then raise exception 'Start the row first'; end if;
 if p_undo is null then raise exception 'Undo state required'; end if;
 if p_undo and s.row_completed_at is not null then raise exception 'Picking is complete; undo is locked'; end if;
 if not p_undo and s.row_completed_at is not null and not public.is_manager() then raise exception 'Only managers can correct picker after picking'; end if;
 if p_undo and exists(select 1 from public.full_case_verifications where order_item_id=i.id)
   or p_undo and exists(select 1 from public.repack_box_items where order_item_id=i.id and removed_at is null)
 then raise exception 'Downstream verification exists; cannot undo pick'; end if;
 if not p_undo then
   select * into w from public.order_workers where order_id=i.order_id and worker_id=p_worker;
   if not found or (not public.is_manager() and w.current_row_id is distinct from i.pick_row_id)
      or not exists(select 1 from public.workers where id=p_worker and active)
   then raise exception 'Choose an active worker assigned to this team'; end if;
 end if;
 stamp:=clock_timestamp();
 event_type:=case when p_undo then 'ITEM_PICK_UNDONE' when i.completed_at is not null then 'PICKER_CORRECTED' else 'ITEM_PICKED' end;
 update public.order_items set
   completed_at=case when p_undo then null else coalesce(completed_at,stamp) end,
   completed_case_qty=case when p_undo then 0 else full_case_qty end,
   completed_loose_qty=case when p_undo then 0 else loose_qty end,
   picker_worker_id=case when p_undo then null else p_worker end,
   picker_initials=case when p_undo then null else w.initials_snapshot end,
   original_picker_worker_id=coalesce(original_picker_worker_id,case when not p_undo and i.completed_at is null then p_worker end),
   original_picker_initials=coalesce(original_picker_initials,case when not p_undo and i.completed_at is null then w.initials_snapshot end),
   original_picked_at=coalesce(original_picked_at,case when not p_undo and i.completed_at is null then stamp end),
   pick_version=pick_version+1 where id=i.id;
 perform public.audit_order(i.order_id,event_type,i.pick_row_id,jsonb_build_object('item_id',i.id,'previous_picker',i.picker_initials,'picker_id',p_worker,'picker',w.initials_snapshot,'previous_completed_at',i.completed_at));
 perform public.refresh_group_readiness(i.order_id);
end $$;
-- Retire generic picking so stale PWAs cannot bypass required picker traceability.
create or replace function public.set_item_complete(p_item uuid,p_complete boolean) returns void
language plpgsql security definer set search_path='' as $$
begin raise exception 'Refresh the app. Use worker initials to confirm or undo a pick'; end $$;

create or replace function public.row_action(p_order uuid,p_row text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.pick_sessions; stamp timestamptz;
begin
 if not public.can_access_row(p_row) then raise exception 'Row access denied'; end if;
 perform public.assert_active(p_order);
 select * into s from public.pick_sessions where order_id=p_order and pick_row_id=p_row for update;
 if not found then raise exception 'Row session not found'; end if;
 stamp:=clock_timestamp();
 if p_action='START' then
   if s.row_started_at is not null then return; end if;
   update public.pick_sessions set row_started_at=stamp where id=s.id;
   perform public.audit_order(p_order,'ROW_PICK_START',p_row);
 elsif p_action='COMPLETE' then
   if s.row_completed_at is not null then return; end if;
   if s.row_started_at is null then raise exception 'Start the row first'; end if;
   if exists(select 1 from public.order_items where order_id=p_order and pick_row_id=p_row and completed_at is null)
   then raise exception 'Pick every product before completing the row'; end if;
   update public.pick_sessions set row_completed_at=stamp,clearing_started_at=stamp where id=s.id;
   perform public.audit_order(p_order,'ROW_PICK_COMPLETE',p_row);
   perform public.audit_order(p_order,'ROW_CLEARING_START',p_row);
 elsif p_action='CLEAR_START' then
   if s.row_completed_at is null then raise exception 'Complete picking first'; end if;
   if s.clearing_started_at is not null then return; end if;
   update public.pick_sessions set clearing_started_at=stamp where id=s.id;
   perform public.audit_order(p_order,'ROW_CLEARING_START',p_row);
 elsif p_action='CLEAR_COMPLETE' then
   if s.clearing_started_at is null then raise exception 'Start clearing first'; end if;
   if s.clearing_completed_at is not null then return; end if;
   update public.pick_sessions set clearing_completed_at=stamp where id=s.id;
   perform public.audit_order(p_order,'ROW_CLEARING_COMPLETE',p_row);
 else raise exception 'Unknown row action'; end if;
 perform public.refresh_group_readiness(p_order);
end $$;

create function public.report_inventory(p_item uuid,p_kind text,p_cases integer default null,p_packs integer default null,p_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.order_items; result_id uuid; reporter text;
begin
 select * into i from public.order_items where id=p_item;
 if not found or not public.can_access_row(i.pick_row_id) then raise exception 'Item access denied'; end if;
 perform public.assert_active(i.order_id);
 if p_kind not in ('LOW','ZERO') or p_kind is null then raise exception 'Choose LOW or ZERO'; end if;
 select id into result_id from public.inventory_attention where order_item_id=p_item and kind=p_kind and status<>'RESOLVED';
 if found then return result_id; end if;
 select display_name into reporter from public.profiles where id=auth.uid();
 insert into public.inventory_attention(order_id,order_item_id,pick_row_id,kind,available_cases,available_packs,note,reporter_id,reporter_name)
 values(i.order_id,i.id,i.pick_row_id,p_kind,p_cases,p_packs,coalesce(p_note,''),auth.uid(),reporter) returning id into result_id;
 perform public.audit_order(i.order_id,'INVENTORY_'||p_kind,i.pick_row_id,jsonb_build_object('attention_id',result_id,'item_id',i.id,'available_cases',p_cases,'available_packs',p_packs,'note',p_note));
 perform public.refresh_group_readiness(i.order_id);
 return result_id;
end $$;
create function public.set_inventory_status(p_id uuid,p_status text,p_note text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare a public.inventory_attention;
begin
 if not public.is_manager() then raise exception 'Manager access required'; end if;
 select * into a from public.inventory_attention where id=p_id;
 if not found then raise exception 'Attention record not found'; end if;
 perform public.assert_active(a.order_id);
 select * into a from public.inventory_attention where id=p_id for update;
 if p_version is null or a.version<>p_version then raise exception 'Attention changed. Refresh before editing'; end if;
 update public.inventory_attention set status=p_status,note=coalesce(p_note,''),updated_at=clock_timestamp(),
 resolved_at=case when p_status='RESOLVED' then clock_timestamp() else null end,version=version+1 where id=p_id;
 perform public.audit_order(a.order_id,'INVENTORY_STATUS',a.pick_row_id,jsonb_build_object('attention_id',p_id,'before',to_jsonb(a),'status',p_status,'note',p_note));
 perform public.refresh_group_readiness(a.order_id);
end $$;

create function public.create_repack_box(p_order uuid,p_group text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare g public.operation_groups; result_id uuid; next_number integer;
begin
 perform public.assert_active(p_order);
 perform public.assert_verifier(p_order,p_group,'REPACK');
 select * into strict g from public.operation_groups where id=p_group;
 select id into result_id from public.repack_boxes where order_id=p_order and request_id=p_request;
 if found then return result_id; end if;
 select coalesce(max(box_number),0)+1 into next_number from public.repack_boxes where order_id=p_order and prefix=g.box_prefix;
 insert into public.repack_boxes(order_id,group_id,station_row_id,prefix,box_number,request_id,created_by)
 values(p_order,g.id,g.repack_row_id,g.box_prefix,next_number,p_request,auth.uid()) returning id into result_id;
 perform public.audit_order(p_order,'REPACK_BOX_CREATED',g.repack_row_id,jsonb_build_object('box_id',result_id,'label',g.box_prefix||next_number));
 return result_id;
end $$;

create function public.reconcile_discrepancy(p_order uuid,p_item uuid,p_box uuid,p_kind text,p_expected integer,p_actual integer,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare d public.quantity_discrepancies;
begin
 for d in select * from public.quantity_discrepancies where order_item_id=p_item and box_id is not distinct from p_box and kind=p_kind and status='OPEN' loop
   update public.quantity_discrepancies set status=case when p_expected=p_actual then 'RESOLVED' else 'SUPERSEDED' end,
     resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=d.id;
   if p_expected=p_actual then perform public.audit_order(p_order,'DISCREPANCY_RESOLVED',null,jsonb_build_object('discrepancy_id',d.id)); end if;
 end loop;
 if p_expected<>p_actual then
   insert into public.quantity_discrepancies(order_id,order_item_id,box_id,kind,expected_qty,actual_qty,note,actor_id)
   values(p_order,p_item,p_box,p_kind,p_expected,p_actual,coalesce(p_note,''),auth.uid());
   perform public.audit_order(p_order,case when p_kind='REPACK' then 'REPACK_DISCREPANCY' else 'FULL_CASE_DISCREPANCY' end,null,
     jsonb_build_object('item_id',p_item,'box_id',p_box,'expected',p_expected,'actual',p_actual,'note',p_note));
 end if;
end $$;

create function public.save_repack_item(p_box uuid,p_item uuid,p_expected integer,p_actual integer,p_confirm boolean,p_note text,p_version integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare b public.repack_boxes; i public.order_items; old public.repack_box_items; allocated bigint;
begin
 select * into b from public.repack_boxes where id=p_box;
 if not found then raise exception 'Box not found'; end if;
 perform public.assert_active(b.order_id);
 perform public.assert_verifier(b.order_id,b.group_id,'REPACK');
 select * into b from public.repack_boxes where id=p_box for update;
 if b.status<>'OPEN' then raise exception 'Reopen the box before correcting contents'; end if;
 select * into i from public.order_items where id=p_item and order_id=b.order_id and group_id=b.group_id for update;
 if not found or i.loose_qty<=0 then raise exception 'Only loose products in this group are eligible'; end if;
 if i.completed_at is null or not exists(select 1 from public.pick_sessions where order_id=i.order_id and pick_row_id=i.pick_row_id and clearing_completed_at is not null)
 then raise exception 'Product picking and clearing must be complete'; end if;
 select * into old from public.repack_box_items where box_id=p_box and order_item_id=p_item for update;
 if p_version is null or coalesce(old.version,0)<>p_version then raise exception 'Box item changed. Refresh before editing'; end if;
 if p_expected is null or p_actual is null or p_expected<0 or p_actual<0 or (p_expected=0 and p_actual<>0) then raise exception 'Use nonnegative whole quantities'; end if;
 if p_expected=0 then
   if old.id is null then return; end if;
   update public.repack_box_items set removed_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=auth.uid(),version=version+1 where id=old.id;
   perform public.reconcile_discrepancy(b.order_id,p_item,p_box,'REPACK',0,0,'Allocation removed');
   perform public.audit_order(b.order_id,'REPACK_ITEM_REMOVED',b.station_row_id,jsonb_build_object('before',to_jsonb(old)));
 else
   select coalesce(sum(expected_qty),0) into allocated from public.repack_box_items
    where order_item_id=p_item and removed_at is null and box_id<>p_box;
   if allocated+p_expected>i.loose_qty then raise exception 'Allocation exceeds remaining loose quantity. Refresh all boxes'; end if;
   if p_actual<>p_expected and not coalesce(p_confirm,false) then raise exception 'Confirm discrepancy or correct count'; end if;
   insert into public.repack_box_items(order_id,box_id,order_item_id,expected_qty,actual_qty,updated_by)
    values(b.order_id,p_box,p_item,p_expected,p_actual,auth.uid())
   on conflict(box_id,order_item_id) do update set expected_qty=excluded.expected_qty,actual_qty=excluded.actual_qty,
     removed_at=null,updated_by=auth.uid(),updated_at=clock_timestamp(),version=public.repack_box_items.version+1;
   perform public.reconcile_discrepancy(b.order_id,p_item,p_box,'REPACK',p_expected,p_actual,p_note);
   perform public.audit_order(b.order_id,case when old.id is null then 'REPACK_ITEM_ADDED' else 'REPACK_ITEM_CORRECTED' end,b.station_row_id,
    jsonb_build_object('box_id',p_box,'item_id',p_item,'before',to_jsonb(old),'expected',p_expected,'actual',p_actual,'note',p_note));
 end if;
 update public.repack_boxes set version=version+1 where id=p_box;
 perform public.refresh_group_readiness(b.order_id);
end $$;

create function public.set_repack_box_status(p_box uuid,p_status text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare b public.repack_boxes;
begin
 select * into b from public.repack_boxes where id=p_box;
 if not found then raise exception 'Box not found'; end if;
 perform public.assert_active(b.order_id);
 perform public.assert_verifier(b.order_id,b.group_id,'REPACK');
 select * into b from public.repack_boxes where id=p_box for update;
 if p_status=b.status then return; end if;
 if p_version is null or b.version<>p_version then raise exception 'Box changed. Refresh before editing'; end if;
 if p_status='OPEN' then
   if not public.is_manager() then raise exception 'Only managers may reopen completed boxes'; end if;
 elsif p_status='CLOSED' then
   if not exists(select 1 from public.repack_box_items where box_id=p_box and removed_at is null and actual_qty>0)
   then raise exception 'Cannot complete an empty box'; end if;
   if exists(select 1 from public.quantity_discrepancies where box_id=p_box and status='OPEN')
   then raise exception 'Resolve this box discrepancy before closing; other boxes can continue'; end if;
 else raise exception 'Invalid box status'; end if;
 update public.repack_boxes set status=p_status,completed_at=case when p_status='CLOSED' then clock_timestamp() else null end,version=version+1 where id=p_box;
 perform public.audit_order(b.order_id,case when p_status='CLOSED' then 'REPACK_BOX_COMPLETE' else 'REPACK_BOX_REOPENED' end,b.station_row_id,
 jsonb_build_object('box_id',p_box,'label',b.prefix||b.box_number,'before',to_jsonb(b)));
 perform public.refresh_group_readiness(b.order_id);
end $$;

create function public.verify_full_cases(p_item uuid,p_actual integer,p_confirm boolean,p_note text,p_version integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare i public.order_items; old public.full_case_verifications;
begin
 select * into i from public.order_items where id=p_item;
 if not found or i.full_case_qty<=0 then raise exception 'Only full-case products are eligible'; end if;
 perform public.assert_active(i.order_id);
 perform public.assert_verifier(i.order_id,i.group_id,'FULL_CASE');
 if i.completed_at is null or not exists(select 1 from public.pick_sessions where order_id=i.order_id and pick_row_id=i.pick_row_id and clearing_completed_at is not null)
 then raise exception 'Product picking and clearing must be complete'; end if;
 select * into old from public.full_case_verifications where order_item_id=p_item for update;
 if p_version is null or coalesce(old.version,0)<>p_version then raise exception 'Verification changed. Refresh before editing'; end if;
 if p_actual is null or p_actual<0 then raise exception 'Use a nonnegative whole case quantity'; end if;
 if p_actual<>i.full_case_qty and not coalesce(p_confirm,false) then raise exception 'Confirm discrepancy or correct count'; end if;
 insert into public.full_case_verifications(order_item_id,order_id,expected_qty,actual_qty,status,verifier_id,verifier_name)
 values(p_item,i.order_id,i.full_case_qty,p_actual,case when p_actual=i.full_case_qty then 'VERIFIED' else 'DISCREPANCY' end,auth.uid(),(select display_name from public.profiles where id=auth.uid()))
 on conflict(order_item_id) do update set actual_qty=excluded.actual_qty,status=excluded.status,verifier_id=auth.uid(),verifier_name=excluded.verifier_name,verified_at=clock_timestamp(),version=public.full_case_verifications.version+1;
 perform public.reconcile_discrepancy(i.order_id,p_item,null,'FULL_CASE',i.full_case_qty,p_actual,p_note);
 perform public.audit_order(i.order_id,'FULL_CASE_VERIFIED',i.pick_row_id,jsonb_build_object('item_id',p_item,'before',to_jsonb(old),'expected',i.full_case_qty,'actual',p_actual,'picker',i.original_picker_initials));
 perform public.refresh_group_readiness(i.order_id);
end $$;

create function public.start_palletization(p_order uuid,p_group text) returns void
language plpgsql security definer set search_path='' as $$
declare g public.order_group_status; stamp timestamptz; order_start timestamptz;
begin
 if not public.is_manager() then raise exception 'Manager access required'; end if;
 perform public.assert_active(p_order);
 perform public.refresh_group_readiness(p_order);
 select * into g from public.order_group_status where order_id=p_order and group_id=p_group for update;
 if not found or not g.is_ready then raise exception 'Group is not ready for palletization'; end if;
 if g.palletize_started_at is not null then return; end if;
 stamp:=clock_timestamp();
 select palletize_started_at into order_start from public.orders where id=p_order;
 update public.order_group_status set palletize_started_at=stamp where order_id=p_order and group_id=p_group;
 if order_start is null then
   update public.orders set palletize_started_at=stamp where id=p_order;
   perform public.audit_order(p_order,'PALLETIZE_START',null,jsonb_build_object('group_id',p_group,'started_at',stamp));
 end if;
 perform public.audit_order(p_order,'GROUP_PALLETIZE_START',null,jsonb_build_object('group_id',p_group,'started_at',stamp));
 -- Intentionally no change to repack boxes, clearing, or other groups.
end $$;

create view public.order_case_counts with (security_invoker=true) as
 select o.id as order_id,
 coalesce((select sum(v.actual_qty) from public.full_case_verifications v where v.order_id=o.id and v.status='VERIFIED'),0)::bigint as full_cases,
 (select count(*) from public.repack_boxes b where b.order_id=o.id and b.status='CLOSED')::bigint as repack_boxes,
 (coalesce((select sum(v.actual_qty) from public.full_case_verifications v where v.order_id=o.id and v.status='VERIFIED'),0)
  +(select count(*) from public.repack_boxes b where b.order_id=o.id and b.status='CLOSED'))::bigint as total_cases
 from public.orders o where public.is_manager();
revoke all on public.order_case_counts from public,anon,authenticated;
grant select on public.order_case_counts to authenticated;

do $$ declare t text; begin
 foreach t in array array['operation_groups','workers','daily_worker_assignments','order_workers','admin_audit',
 'inventory_attention','repack_boxes','repack_box_items','full_case_verifications','quantity_discrepancies','order_group_status'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon,authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy groups_read on public.operation_groups for select to authenticated using(public.current_role() is not null);
create policy workers_read on public.workers for select to authenticated using(public.current_role() is not null);
create policy daily_workers_read on public.daily_worker_assignments for select to authenticated using(public.current_role() is not null);
-- Every lead can select unassigned workers; cross-row reassignments remain manager-only.
create policy order_workers_read on public.order_workers for select to authenticated using(public.current_role() is not null);
create policy admin_audit_read on public.admin_audit for select to authenticated using(public.is_manager());
create policy attention_read on public.inventory_attention for select to authenticated using(public.can_access_row(pick_row_id));
create policy boxes_read on public.repack_boxes for select to authenticated using(public.can_group(group_id));
create policy box_items_read on public.repack_box_items for select to authenticated using(public.can_read_item(order_item_id));
create policy full_cases_read on public.full_case_verifications for select to authenticated using(public.can_read_item(order_item_id));
create policy discrepancy_read on public.quantity_discrepancies for select to authenticated using(public.can_read_item(order_item_id));
create policy group_status_read on public.order_group_status for select to authenticated using(public.can_group(group_id));

-- Explicitly revoke default PUBLIC execution on every newly created helper and RPC.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
 'pack_levels','pack_units','is_manager','can_group','can_read_item','assert_active','audit_order','assert_verifier',
 'group_ready','refresh_group_readiness','save_product','save_worker','set_daily_worker','capture_named_team',
 'sync_daily_counts','remove_daily_worker','assign_order_worker','move_workers','record_pick','report_inventory','set_inventory_status','create_repack_box',
 'reconcile_discrepancy','save_repack_item','set_repack_box_status','verify_full_cases','start_palletization'
 ) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop;
end $$;
grant execute on function public.is_manager(),public.can_group(text,text),public.can_read_item(uuid),
 public.pack_levels(text),public.pack_units(text),
 public.save_product(uuid,text,text,text,boolean,integer),public.save_worker(uuid,text,text,boolean,integer),
 public.remove_daily_worker(date,uuid),public.set_daily_worker(date,uuid,text),public.assign_order_worker(uuid,uuid,text),public.move_workers(uuid,uuid[],text,text),
 public.record_pick(uuid,uuid,boolean,integer),public.report_inventory(uuid,text,integer,integer,text),
 public.set_inventory_status(uuid,text,text,integer),public.create_repack_box(uuid,text,uuid),
 public.save_repack_item(uuid,uuid,integer,integer,boolean,text,integer),public.set_repack_box_status(uuid,text,integer),
 public.verify_full_cases(uuid,integer,boolean,text,integer),public.start_palletization(uuid,text)
 to authenticated;
alter publication supabase_realtime add table
 public.products,public.workers,public.daily_worker_assignments,public.order_workers,public.worker_movements,
 public.inventory_attention,public.repack_boxes,public.repack_box_items,public.full_case_verifications,
 public.quantity_discrepancies,public.order_group_status;

-- One RLS-enforced snapshot per refresh, instead of a query for every widget.
create function public.order_bundle(p_order uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'order',(select to_jsonb(o) from public.orders o where id=p_order),
 'rows',(select coalesce(jsonb_agg(r order by r.sort_order),'[]') from public.pick_rows r),
 'items',(select coalesce(jsonb_agg(i order by i.product_name),'[]') from public.order_items i where order_id=p_order),
 'sessions',(select coalesce(jsonb_agg(s),'[]') from public.pick_sessions s where order_id=p_order),
 'workflow',jsonb_build_object(
  'staffingSnapshot',(select to_jsonb(s) from public.order_staffing_snapshots s where order_id=p_order),
  'staffingRows',(select coalesce(jsonb_agg(s),'[]') from public.order_staffing_rows s where order_id=p_order),
  'groups',(select coalesce(jsonb_agg(g order by g.id),'[]') from public.operation_groups g),
  'workers',(select coalesce(jsonb_agg(w order by w.name),'[]') from public.workers w),
  'team',(select coalesce(jsonb_agg(w),'[]') from public.order_workers w where order_id=p_order),
  'boxes',(select coalesce(jsonb_agg(b order by b.prefix,b.box_number),'[]') from public.repack_boxes b where order_id=p_order),
  'lines',(select coalesce(jsonb_agg(l),'[]') from public.repack_box_items l where order_id=p_order),
  'verifications',(select coalesce(jsonb_agg(v),'[]') from public.full_case_verifications v where order_id=p_order),
  'discrepancies',(select coalesce(jsonb_agg(d order by d.created_at desc),'[]') from public.quantity_discrepancies d where order_id=p_order),
  'attention',(select coalesce(jsonb_agg(a order by a.created_at desc),'[]') from public.inventory_attention a where order_id=p_order),
  'groupStatus',(select coalesce(jsonb_agg(g),'[]') from public.order_group_status g where order_id=p_order),
  'counts',(select to_jsonb(c) from public.order_case_counts c where order_id=p_order),
  'events',(select coalesce(jsonb_agg(e),'[]') from (select * from public.events where order_id=p_order order by occurred_at desc limit 60) e),
  'movements',(select coalesce(jsonb_agg(m order by m.occurred_at desc),'[]') from public.worker_movements m where order_id=p_order)
 ))
$$;
revoke all on function public.order_bundle(uuid) from public,anon;
grant execute on function public.order_bundle(uuid) to authenticated;
commit;
