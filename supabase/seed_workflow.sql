-- OPTIONAL DEVELOPMENT DATA ONLY. Apply 002 first. Does not start orders or create Auth users.
-- Safe to repeat: existing demo products/items/orders/worker records remain unchanged.
begin;
insert into public.workers(id,name,initials)
values ('61000000-0000-0000-0000-000000000001','Demo · Parker Brooks','PB'),
 ('61000000-0000-0000-0000-000000000002','Demo · Nolan Weiss','NW'),
 ('61000000-0000-0000-0000-000000000003','Demo · Ellis Carter','EC')
on conflict(id) do nothing;
insert into public.products(id,sku,name,pick_row_id,case_pack_display)
select ('62000000-0000-0000-0000-'||lpad((r.sort_order*100+n)::text,12,'0'))::uuid,
 'WF-DEMO-'||r.id||'-'||n,
 case when r.id='B2-R1' and n=1 then 'BIG TRUCK'
 when r.id='B2-R1' and n=2 then 'PURPLE RAIN'
 when r.id='B2-R1' and n=3 then 'ROMAN CANDLE PACK'
 else (array['CELEBRATION','GOLDEN SKY','THUNDER ROAD','NIGHT LIGHTS','STAR BURST','SILVER COMET'])[((n-1)%6)+1]||' · '||r.id||' · '||n end,
 r.id,case when n%3=0 then '8/20/100' when n%3=1 then '4/1' else '12/1' end
from public.pick_rows r cross join generate_series(1,36) n
on conflict(id) do nothing;
insert into public.orders(id,order_number,stand_name,scheduled_date)
values ('63000000-0000-0000-0000-000000000001','WF-DEMO-01','Development · Northside acceptance',
 (clock_timestamp() at time zone (select timezone from public.warehouse_settings where id))::date),
 ('63000000-0000-0000-0000-000000000002','WF-DEMO-02','Development · Second-order numbering',
 (clock_timestamp() at time zone (select timezone from public.warehouse_settings where id))::date)
on conflict(id) do nothing;
insert into public.order_items(order_id,product_id,full_case_qty,loose_qty)
select o.id,p.id,case when n%6=0 and n%5<>0 then 0 else 6 end,
 case when n%5=0 then 0 when n=1 then 7 else 2 end
from public.orders o
cross join public.pick_rows r cross join generate_series(1,36) n
join public.products p on p.id=('62000000-0000-0000-0000-'||lpad((r.sort_order*100+n)::text,12,'0'))::uuid
where o.id in ('63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000002')
and o.status='PLANNED'
and not exists(select 1 from public.order_items i where i.order_id=o.id and i.product_id=p.id)
on conflict do nothing;
commit;

