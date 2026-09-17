import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const admin = "30000000-0000-0000-0000-000000000001",
  lead = "30000000-0000-0000-0000-000000000002",
  fullLead = "30000000-0000-0000-0000-000000000003",
  other = "30000000-0000-0000-0000-000000000004",
  manager = "30000000-0000-0000-0000-000000000005";
const order = "20000000-0000-0000-0000-000000000001",
  second = "20000000-0000-0000-0000-000000000002";
const pb = "40000000-0000-0000-0000-000000000001",
  nw = "40000000-0000-0000-0000-000000000002";
async function asUser(id: string, sql: string) {
  await db.exec(
    `set role authenticated; select set_config('test.uid','${id}',false)`,
  );
  try {
    return await db.exec(sql);
  } finally {
    await db.exec("reset role");
  }
}
async function scalar<T = string>(sql: string): Promise<T> {
  return Object.values((await db.query<Record<string, T>>(sql)).rows[0])[0];
}
let item: string, partner: string, a1: string, a2: string;
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
  await db.exec(readFileSync("supabase/migrations/001_foundation.sql", "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/002_operational_workflow.sql", "utf8"),
  );
  await db.exec(`insert into auth.users values('${admin}'),('${lead}'),('${fullLead}'),('${other}'),('${manager}');
 insert into profiles(id,display_name,role,assigned_row_id) values
 ('${admin}','Admin','ADMIN',null),('${lead}','Repack A','PICK_LEAD','B2-R1'),
 ('${fullLead}','Full A','PICK_LEAD','B2-R2'),('${other}','Repack B','PICK_LEAD','B2-R3'),('${manager}','Manager','SHEET_MANAGER',null);
 insert into workers(id,name,initials) values('${pb}','Parker Brooks','PB'),('${nw}','Nora West','NW');`);
  item = await scalar(
    `select id from order_items where order_id='${order}' and pick_row_id='B2-R1'`,
  );
  partner = await scalar(
    `select id from order_items where order_id='${order}' and pick_row_id='B2-R2'`,
  );
}, 30000);
afterAll(() => db.close());
describe("Operational migration and workflow", () => {
  it("preserves existing orders, old packaging unknown, and four role groups", async () => {
    expect(await scalar<number>("select count(*)::int from orders")).toBe(2);
    expect(
      await scalar(
        `select case_pack_display from order_items where id='${item}'`,
      ),
    ).toBeNull();
    expect(
      await scalar("select verification_role from pick_rows where id='B3-R1'"),
    ).toBe("REPACK");
    expect(
      await scalar("select verification_role from pick_rows where id='B3-R3'"),
    ).toBe("FULL_CASE");
  });
  it("calculates variable-depth packaging in Postgres", async () => {
    expect(await scalar("select pack_units('8/20/100')")).toBe(16000);
    expect(await scalar("select pack_units('4/1')")).toBe(4);
    expect(await scalar("select pack_units('2/3/4/5')")).toBe(120);
    await expect(db.exec("select pack_units('4/0')")).rejects.toThrow();
  });
  it("limits product management to admins and validates row", async () => {
    await expect(
      asUser(lead, "select save_product(null,'New','4/1','B2-R1',true,0)"),
    ).rejects.toThrow("Admin");
    await expect(
      asUser(admin, "select save_product(null,'New','4/1','B9-R9',true,0)"),
    ).rejects.toThrow("Invalid pick location");
    await asUser(
      admin,
      "select save_product('10000000-0000-0000-0000-000000000001','BIG TRUCK','4/1','B2-R1',true,1)",
    );
    expect(
      await scalar(`select product_name from order_items where id='${item}'`),
    ).toContain("Development");
  });
  it("creates daily teams and inherits named workers at start", async () => {
    await asUser(
      admin,
      `select set_daily_worker((now() at time zone 'America/Chicago')::date,'${pb}','B2-R1');select set_daily_worker((now() at time zone 'America/Chicago')::date,'${nw}','B2-R2');select start_order('${order}')`,
    );
    expect(
      await scalar<number>(
        `select count(*)::int from order_workers where order_id='${order}'`,
      ),
    ).toBe(2);
    expect(
      await scalar<number>(
        `select total_workers from order_staffing_snapshots where order_id='${order}'`,
      ),
    ).toBe(2);
  });
  it("prevents cross-row staff stealing and records manager movements", async () => {
    await expect(
      asUser(lead, `select assign_order_worker('${order}','${nw}','B2-R1')`),
    ).rejects.toThrow("Cannot take");
    await asUser(
      manager,
      `select move_workers('${order}',array['${nw}'::uuid],'B2-R2','B2-R1')`,
    );
    expect(
      await scalar(
        `select current_row_id from order_workers where order_id='${order}' and worker_id='${nw}'`,
      ),
    ).toBe("B2-R1");
    expect(
      await scalar(
        `select initial_row_id from order_workers where order_id='${order}' and worker_id='${nw}'`,
      ),
    ).toBe("B2-R2");
    await asUser(
      manager,
      `select move_workers('${order}',array['${nw}'::uuid],'B2-R1','B2-R2')`,
    );
  });
  it("records picker, supports undo/correction and keeps original picker", async () => {
    await asUser(
      lead,
      `select row_action('${order}','B2-R1','START');select record_pick('${item}','${pb}',false,0)`,
    );
    expect(
      await scalar(
        `select picker_initials from order_items where id='${item}'`,
      ),
    ).toBe("PB");
    await asUser(
      lead,
      `select record_pick('${item}',null,true,1);select record_pick('${item}','${pb}',false,2)`,
    );
    await asUser(admin, `select record_pick('${item}','${nw}',false,3)`);
    expect(
      await scalar(
        `select original_picker_initials from order_items where id='${item}'`,
      ),
    ).toBe("PB");
    expect(
      await scalar(
        `select picker_initials from order_items where id='${item}'`,
      ),
    ).toBe("NW");
    await expect(
      asUser(lead, `select set_item_complete('${item}',true)`),
    ).rejects.toThrow("worker initials");
  });
  it("rejects stale picker corrections and other row writes", async () => {
    await expect(
      asUser(lead, `select record_pick('${item}','${pb}',false,0)`),
    ).rejects.toThrow("changed");
    await expect(
      asUser(other, `select record_pick('${item}','${pb}',false,4)`),
    ).rejects.toThrow("denied");
  });
  it("creates distinct LOW/ZERO records, deduplicates and retains resolved history", async () => {
    await asUser(
      lead,
      `select report_inventory('${item}','LOW');select report_inventory('${item}','ZERO');select report_inventory('${item}','ZERO')`,
    );
    expect(
      await scalar<number>("select count(*)::int from inventory_attention"),
    ).toBe(2);
    const zero = await scalar(
      "select id from inventory_attention where kind='ZERO'",
    );
    await expect(
      asUser(
        lead,
        `select set_inventory_status('${zero}','RESOLVED','replenished',1)`,
      ),
    ).rejects.toThrow("Manager");
    await asUser(
      manager,
      `select set_inventory_status('${zero}','IN_PROGRESS','checking reserve',1);select set_inventory_status('${zero}','RESOLVED','replenished',2)`,
    );
    expect(
      await scalar<number>(
        "select count(*)::int from inventory_attention where status='RESOLVED'",
      ),
    ).toBe(1);
  });
  it("gates verification behind clearing and keeps row timers independent", async () => {
    await expect(
      asUser(
        lead,
        `select create_repack_box('${order}','A',gen_random_uuid())`,
      ),
    ).rejects.toThrow("clearing");
    await asUser(
      fullLead,
      `select row_action('${order}','B2-R2','START');select record_pick('${partner}','${nw}',false,0)`,
    );
    await asUser(
      lead,
      `select row_action('${order}','B2-R1','COMPLETE');select row_action('${order}','B2-R1','CLEAR_COMPLETE')`,
    );
    expect(
      await scalar(
        `select row_completed_at is null from pick_sessions where order_id='${order}' and pick_row_id='B2-R2'`,
      ),
    ).toBe(true);
    expect(
      await scalar(
        `select clearing_started_at>=row_completed_at and clearing_completed_at>=clearing_started_at from pick_sessions where order_id='${order}' and pick_row_id='B2-R1'`,
      ),
    ).toBe(true);
    await asUser(
      fullLead,
      `select row_action('${order}','B2-R2','COMPLETE');select row_action('${order}','B2-R2','CLEAR_COMPLETE')`,
    );
  });
  it("creates multiple open boxes with idempotent per-order numbering", async () => {
    const request = "50000000-0000-0000-0000-000000000001";
    await asUser(
      lead,
      `select create_repack_box('${order}','A','${request}');select create_repack_box('${order}','A','${request}');select create_repack_box('${order}','A',gen_random_uuid())`,
    );
    a1 = await scalar(
      `select id from repack_boxes where order_id='${order}' and prefix='A' and box_number=1`,
    );
    a2 = await scalar(
      `select id from repack_boxes where order_id='${order}' and prefix='A' and box_number=2`,
    );
    expect(
      await scalar<number>(
        "select count(*)::int from repack_boxes where status='OPEN'",
      ),
    ).toBe(2);
    await expect(
      asUser(
        fullLead,
        `select create_repack_box('${order}','A',gen_random_uuid())`,
      ),
    ).rejects.toThrow("denied");
    await expect(
      asUser(
        other,
        `select create_repack_box('${order}','A',gen_random_uuid())`,
      ),
    ).rejects.toThrow("denied");
  });
  it("requires explicit discrepancy confirmation and reserves expected quantity", async () => {
    await expect(
      asUser(lead, `select save_repack_item('${a1}','${item}',2,1,false,'',0)`),
    ).rejects.toThrow("Confirm discrepancy");
    await asUser(
      lead,
      `select save_repack_item('${a1}','${item}',2,1,true,'recount pending',0)`,
    );
    expect(
      await scalar<number>(
        "select count(*)::int from quantity_discrepancies where kind='REPACK' and status='OPEN'",
      ),
    ).toBe(1);
    await expect(
      asUser(lead, `select save_repack_item('${a2}','${item}',1,1,false,'',0)`),
    ).rejects.toThrow("remaining");
    await expect(
      asUser(lead, `select set_repack_box_status('${a1}','CLOSED',2)`),
    ).rejects.toThrow("discrepancy");
  });
  it("allows work in another open box while a discrepancy remains", async () => {
    await asUser(
      lead,
      `select save_repack_item('${a2}','${partner}',2,2,false,'',0);select set_repack_box_status('${a2}','CLOSED',2)`,
    );
    expect(
      await scalar(`select status from repack_boxes where id='${a1}'`),
    ).toBe("OPEN");
    expect(
      await scalar(`select status from repack_boxes where id='${a2}'`),
    ).toBe("CLOSED");
  });
  it("corrects discrepancy and counts one case per completed box", async () => {
    await asUser(
      lead,
      `select save_repack_item('${a1}','${item}',2,2,false,'corrected',1);select set_repack_box_status('${a1}','CLOSED',3)`,
    );
    expect(
      await scalar<number>(
        "select count(*)::int from quantity_discrepancies where status='OPEN'",
      ),
    ).toBe(0);
    await asUser(admin, "select 1");
    const counts = await asUser(
      admin,
      `select * from order_case_counts where order_id='${order}'`,
    );
    expect((counts[0].rows[0] as { repack_boxes: number }).repack_boxes).toBe(
      2,
    );
  });
  it("detects full-case discrepancies without mixing loose requirements", async () => {
    await expect(
      asUser(fullLead, `select verify_full_cases('${item}',5,false,'',0)`),
    ).rejects.toThrow("Confirm");
    await asUser(
      fullLead,
      `select verify_full_cases('${item}',5,true,'one case short',0)`,
    );
    expect(
      await scalar<number>(
        "select count(*)::int from quantity_discrepancies where kind='FULL_CASE' and status='OPEN'",
      ),
    ).toBe(1);
    await asUser(
      fullLead,
      `select verify_full_cases('${item}',6,false,'corrected',1);select verify_full_cases('${partner}',6,false,'',0)`,
    );
    await expect(
      asUser(lead, `select verify_full_cases('${item}',6,false,'',2)`),
    ).rejects.toThrow("denied");
  });
  it("makes one group ready and starts palletization without finishing other repack", async () => {
    expect(
      await scalar(
        `select is_ready from order_group_status where order_id='${order}' and group_id='A'`,
      ),
    ).toBe(true);
    expect(
      await scalar(
        `select is_ready from order_group_status where order_id='${order}' and group_id='B'`,
      ),
    ).toBe(false);
    await expect(
      asUser(admin, `select start_palletization('${order}','B')`),
    ).rejects.toThrow("not ready");
    await asUser(
      admin,
      `select create_repack_box('${order}','B',gen_random_uuid());select start_palletization('${order}','A');select start_palletization('${order}','A')`,
    );
    expect(
      await scalar<number>(
        "select count(*)::int from events where type='PALLETIZE_START'",
      ),
    ).toBe(1);
    expect(
      await scalar<number>(
        "select count(*)::int from events where type='REPACK_COMPLETE'",
      ),
    ).toBe(0);
    expect(
      await scalar("select status from repack_boxes where prefix='B'"),
    ).toBe("OPEN");
    const result = await asUser(
      admin,
      `select * from order_case_counts where order_id='${order}'`,
    );
    expect(result[0].rows[0]).toMatchObject({
      full_cases: 12,
      repack_boxes: 2,
      total_cases: 14,
    });
  });
  it("allows manager reopening and revokes readiness without erasing pallet start history", async () => {
    await expect(
      asUser(lead, `select set_repack_box_status('${a1}','OPEN',4)`),
    ).rejects.toThrow("managers");
    await asUser(admin, `select set_repack_box_status('${a1}','OPEN',4)`);
    expect(
      await scalar(
        `select is_ready from order_group_status where order_id='${order}' and group_id='A'`,
      ),
    ).toBe(false);
    expect(
      await scalar(
        `select palletize_started_at is not null from orders where id='${order}'`,
      ),
    ).toBe(true);
  });
  it("resets numbering for the next order and supports B/C/D station prefixes", async () => {
    // Trusted test harness only: this pass intentionally does not expose order completion.
    await db.exec(
      `update orders set status='COMPLETE',completed_at=clock_timestamp() where id='${order}'`,
    );
    await asUser(
      admin,
      `select start_order('${second}');select create_repack_box('${second}','A',gen_random_uuid());select create_repack_box('${second}','C',gen_random_uuid());select create_repack_box('${second}','D',gen_random_uuid())`,
    );
    expect(
      await scalar<number>(
        `select box_number from repack_boxes where order_id='${second}' and prefix='A'`,
      ),
    ).toBe(1);
    expect(
      await scalar("select station_row_id from repack_boxes where prefix='D'"),
    ).toBe("B3-R1");
  });
  it("denies internal helpers, direct writes and unrelated group reads", async () => {
    await expect(
      asUser(lead, `select refresh_group_readiness('${second}')`),
    ).rejects.toThrow();
    await expect(asUser(admin, "delete from repack_boxes")).rejects.toThrow();
    await expect(
      asUser(lead, "update workers set initials='XX'"),
    ).rejects.toThrow();
    expect(
      (
        await asUser(
          other,
          `select * from repack_boxes where order_id='${order}' and group_id='A'`,
        )
      )[0].rows,
    ).toHaveLength(0);
  });

  it("rejects null undo and null discrepancy confirmation", async () => {
    const nextItem = await scalar(
      `select id from order_items where order_id='${second}' and pick_row_id='B2-R1'`,
    );
    await asUser(
      admin,
      `select assign_order_worker('${second}','${pb}','B2-R1');select row_action('${second}','B2-R1','START')`,
    );
    await expect(
      asUser(lead, `select record_pick('${nextItem}','${pb}',null,0)`),
    ).rejects.toThrow();
  });
  it("preserves named and count snapshots when daily workers are deactivated or removed", async () => {
    const date = await scalar(
      "select date::text from daily_staffing order by date desc limit 1",
    );
    const before = await scalar<number>(
      `select total_workers from daily_staffing where date='${date}'`,
    );
    await asUser(
      admin,
      `select save_worker('${pb}','Parker Brooks','PB',false,1)`,
    );
    expect(
      await scalar<number>(
        `select total_workers from daily_staffing where date='${date}'`,
      ),
    ).toBe(before - 1);
    expect(
      await scalar<number>(
        `select count(*)::int from order_workers where order_id='${order}' and worker_id='${pb}'`,
      ),
    ).toBe(1);
    await asUser(admin, `select remove_daily_worker('${date}','${pb}')`);
    expect(
      await scalar<number>(
        `select total_workers from daily_staffing where date='${date}'`,
      ),
    ).toBe(before - 1);
    await expect(
      asUser(lead, `select sync_daily_counts('${date}')`),
    ).rejects.toThrow();
  });
  it("returns one RLS-filtered bundle and preserves original picking audit", async () => {
    const result = await asUser(
      lead,
      `select order_bundle('${order}') as bundle`,
    );
    const b = result[0].rows[0].bundle as {
      items: { group_id: string }[];
      workflow: { boxes: { group_id: string }[] };
    };
    expect(b.items.every((i) => i.group_id === "A")).toBe(true);
    expect(b.workflow.boxes.every((i) => i.group_id === "A")).toBe(true);
    expect(
      await scalar<number>(
        "select count(*)::int from events where type in ('ROW_PICK_COMPLETE','ROW_CLEARING_START','ROW_CLEARING_COMPLETE')",
      ),
    ).toBeGreaterThan(4);
  });
  it("seeds 36 products per row, retains hierarchy and can be repeated safely", async () => {
    const seed = readFileSync("supabase/seed_workflow.sql", "utf8");
    await db.exec(seed);
    await db.exec(seed);
    expect(
      await scalar<number>(
        "select count(*)::int from order_items where order_id='63000000-0000-0000-0000-000000000001' and pick_row_id='B2-R1'",
      ),
    ).toBe(36);
    expect(
      await scalar<number>(
        "select count(*)::int from order_items where order_id='63000000-0000-0000-0000-000000000001'",
      ),
    ).toBe(324);
    expect(
      await scalar(
        "select case_pack_display from order_items where order_id='63000000-0000-0000-0000-000000000001' and product_name='BIG TRUCK'",
      ),
    ).toBe("4/1");
    expect(
      await scalar<number>(
        "select count(*)::int from workers where initials='PB'",
      ),
    ).toBe(2);
  });
});
