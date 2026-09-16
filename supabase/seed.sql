-- DEVELOPMENT ONLY. Run once after migration; no accounts or passwords are seeded.
begin;
insert into public.products(id,sku,name,pick_row_id,category)
select ('10000000-0000-0000-0000-'||lpad(sort_order::text,12,'0'))::uuid,
  'DEMO-'||sort_order,'Development sample · '||id,id,'Demo'
from public.pick_rows;
insert into public.orders(id,order_number,stand_name,scheduled_date)
select '20000000-0000-0000-0000-000000000001','DEMO-101','Demo · Northside stand',
  (now() at time zone timezone)::date from public.warehouse_settings;
insert into public.orders(id,order_number,stand_name,scheduled_date)
select '20000000-0000-0000-0000-000000000002','DEMO-102','Demo · Lakeview stand',
  (now() at time zone timezone)::date from public.warehouse_settings;
insert into public.order_items(order_id,product_id,full_case_qty,loose_qty)
select o.id,p.id,6,2 from public.orders o cross join public.products p
where o.order_number like 'DEMO-%' and p.sku like 'DEMO-%';
commit;
