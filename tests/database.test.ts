import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const admin = "30000000-0000-0000-0000-000000000001";
const lead = "30000000-0000-0000-0000-000000000002";
const manager = "30000000-0000-0000-0000-000000000003";
const unknown = "30000000-0000-0000-0000-000000000004";
const order = "20000000-0000-0000-0000-000000000001";
async function asUser(id: string, sql: string) {
  await db.exec(
    `set role authenticated; select set_config('test.uid','${id}',false);`,
  );
  try {
    return await db.exec(sql);
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create publication supabase_realtime;
  `);
  await db.exec(readFileSync("supabase/migrations/001_foundation.sql", "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec(`
    insert into auth.users values('${admin}'),('${lead}'),('${manager}'),('${unknown}');
    insert into profiles(id,display_name,role,assigned_row_id) values
      ('${admin}','Admin','ADMIN',null),
      ('${lead}','Lead','PICK_LEAD','B2-R1'),
      ('${manager}','Sheet manager','SHEET_MANAGER',null);
  `);
}, 30000);
afterAll(() => db.close());
describe("Database access and operational invariants", () => {
  it("seeds exactly nine rows and denies anonymous reads", async () => {
    expect((await db.query("select * from pick_rows")).rows).toHaveLength(9);
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from orders")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("denies unprovisioned accounts and blocks self-promotion", async () => {
    expect(
      (await asUser(unknown, "select * from orders"))[0].rows,
    ).toHaveLength(0);
    await expect(
      asUser(lead, `update profiles set role='ADMIN' where id='${lead}'`),
    ).rejects.toThrow();
    await expect(
      asUser(lead, `select start_order('${order}')`),
    ).rejects.toThrow("Manager");
  });
  it("copies product identity and row into order items", async () => {
    const initial = await db.query<{
      product_name: string;
      pick_row_id: string;
    }>(
      `select product_name,pick_row_id from order_items where order_id='${order}' and sku='DEMO-1'`,
    );
    expect(initial.rows[0].pick_row_id).toBe("B2-R1");
    await db.exec(
      "update products set name='Renamed product',pick_row_id='B2-R6' where sku='DEMO-1'",
    );
    expect(
      (
        await db.query<{ product_name: string }>(
          `select product_name from order_items where order_id='${order}' and sku='DEMO-1'`,
        )
      ).rows[0].product_name,
    ).toBe(initial.rows[0].product_name);
  });
  it("validates staffing totals before order start", async () => {
    await db.exec(
      "insert into daily_staffing(date,total_workers,float_workers) values((now() at time zone 'America/Chicago')::date,5,1)",
    );
    await expect(
      asUser(manager, `select start_order('${order}')`),
    ).rejects.toThrow("totals");
    await db.exec(
      "insert into daily_staffing_rows select id,'B2-R1',4 from daily_staffing",
    );
  });
  it("starts once, creates nine sessions, and captures staffing", async () => {
    await asUser(
      manager,
      `select start_order('${order}'); select start_order('${order}');`,
    );
    expect((await db.query("select * from pick_sessions")).rows).toHaveLength(
      9,
    );
    expect(
      (await db.query("select * from events where type='ORDER_START'")).rows,
    ).toHaveLength(1);
    await db.exec("update daily_staffing set total_workers=6,float_workers=2");
    expect(
      (
        await db.query<{ total_workers: number }>(
          "select total_workers from order_staffing_snapshots",
        )
      ).rows[0].total_workers,
    ).toBe(5);
    expect(
      (
        await db.query<{ worker_count: number }>(
          "select worker_count from order_staffing_rows",
        )
      ).rows[0].worker_count,
    ).toBe(4);
  });
  it("rejects a second active order", async () => {
    await expect(
      asUser(
        admin,
        "select start_order('20000000-0000-0000-0000-000000000002')",
      ),
    ).rejects.toThrow();
  });
  it("restricts leads to their row in reads and writes", async () => {
    expect(
      (
        await asUser(
          lead,
          `select * from pick_sessions where order_id='${order}'`,
        )
      )[0].rows,
    ).toHaveLength(1);
    expect(
      (
        await asUser(
          manager,
          `select * from pick_sessions where order_id='${order}'`,
        )
      )[0].rows,
    ).toHaveLength(9);
    await expect(
      asUser(lead, `select row_action('${order}','B2-R2','START')`),
    ).rejects.toThrow("denied");
    const item = (
      await db.query<{ id: string }>(
        `select id from order_items where order_id='${order}' and pick_row_id='B2-R2'`,
      )
    ).rows[0].id;
    await expect(
      asUser(lead, `select set_item_complete('${item}',true)`),
    ).rejects.toThrow("denied");
  });
  it("requires row start and completed products before row completion", async () => {
    await expect(
      asUser(lead, `select row_action('${order}','B2-R1','COMPLETE')`),
    ).rejects.toThrow("Start");
    await asUser(lead, `select row_action('${order}','B2-R1','START')`);
    await expect(
      asUser(lead, `select row_action('${order}','B2-R1','COMPLETE')`),
    ).rejects.toThrow("Pick every");
  });
  it("keeps row timers independent and duplicate starts idempotent", async () => {
    await asUser(
      manager,
      `select row_action('${order}','B2-R2','START'); select row_action('${order}','B2-R1','START');`,
    );
    expect(
      (await db.query("select * from events where type='ROW_START'")).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query(
          "select * from pick_sessions where row_started_at is not null and row_completed_at is null",
        )
      ).rows,
    ).toHaveLength(2);
  });
  it("retains undo history, avoids duplicate events, and locks completed rows", async () => {
    const item = (
      await db.query<{ id: string }>(
        `select id from order_items where order_id='${order}' and pick_row_id='B2-R1'`,
      )
    ).rows[0].id;
    await asUser(
      lead,
      `
      select set_item_complete('${item}',true);
      select set_item_complete('${item}',true);
      select set_item_complete('${item}',false);
      select set_item_complete('${item}',true);
      select row_action('${order}','B2-R1','COMPLETE');
    `,
    );
    expect(
      (await db.query("select * from events where type='ITEM_COMPLETE'")).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select * from events where type='ITEM_UNDO'")).rows,
    ).toHaveLength(1);
    await expect(
      asUser(lead, `select set_item_complete('${item}',false)`),
    ).rejects.toThrow("running");
    await expect(asUser(admin, "delete from events")).rejects.toThrow();
    await expect(
      asUser(admin, "update pick_sessions set row_started_at=now()"),
    ).rejects.toThrow();
  });
  it("revokes warehouse access when a profile is inactive", async () => {
    await db.exec(`update profiles set active=false where id='${lead}'`);
    expect((await asUser(lead, "select * from orders"))[0].rows).toHaveLength(
      0,
    );
    await expect(
      asUser(lead, `select row_action('${order}','B2-R1','START')`),
    ).rejects.toThrow("denied");
  });
});
