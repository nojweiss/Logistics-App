import { db } from "../lib/supabase";
import type { Product, StaffingData, Attention } from "../lib/operations";
import type { PickRow } from "../lib/types";
async function rpc<T = void>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!navigator.onLine)
    throw new Error("OFFLINE. Nothing was sent. Reconnect and retry.");
  const { data, error } = await db().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const operations = {
  async catalog(): Promise<{ products: Product[]; rows: PickRow[] }> {
    const [products, rows] = await Promise.all([
      db().from("products").select("*").order("name"),
      db().from("pick_rows").select("*").order("sort_order"),
    ]);
    if (products.error) throw products.error;
    if (rows.error) throw rows.error;
    return {
      products: products.data as Product[],
      rows: rows.data as PickRow[],
    };
  },
  saveProduct: (
    p: Partial<Product> & {
      name: string;
      case_pack_display: string;
      pick_row_id: string;
      active: boolean;
    },
  ) =>
    rpc<string>("save_product", {
      p_id: p.id ?? null,
      p_name: p.name,
      p_pack: p.case_pack_display,
      p_row: p.pick_row_id,
      p_active: p.active,
      p_version: p.version ?? 0,
    }),
  async staffing(date: string): Promise<StaffingData> {
    const [workers, assignments, rows] = await Promise.all([
      db().from("workers").select("*").order("name"),
      db().from("daily_worker_assignments").select("*").eq("work_date", date),
      db().from("pick_rows").select("*").order("sort_order"),
    ]);
    for (const r of [workers, assignments, rows]) if (r.error) throw r.error;
    return {
      workers: workers.data!,
      assignments: assignments.data!,
      rows: rows.data!,
    } as StaffingData;
  },
  saveWorker: (
    id: string | null,
    name: string,
    initials: string,
    active: boolean,
    version = 0,
  ) =>
    rpc("save_worker", {
      p_id: id,
      p_name: name,
      p_initials: initials,
      p_active: active,
      p_version: version,
    }),
  removeDaily: (date: string, worker: string) =>
    rpc("remove_daily_worker", { p_date: date, p_worker: worker }),
  assignDaily: (date: string, worker: string, row: string | null) =>
    rpc("set_daily_worker", { p_date: date, p_worker: worker, p_row: row }),
  assignOrder: (order: string, worker: string, row: string | null) =>
    rpc("assign_order_worker", {
      p_order: order,
      p_worker: worker,
      p_row: row,
    }),
  moveWorkers: (
    order: string,
    workers: string[],
    source: string | null,
    destination: string | null,
  ) =>
    rpc("move_workers", {
      p_order: order,
      p_workers: workers,
      p_source: source,
      p_destination: destination,
    }),
  pick: (item: string, worker: string | null, undo: boolean, version: number) =>
    rpc("record_pick", {
      p_item: item,
      p_worker: worker,
      p_undo: undo,
      p_version: version,
    }),
  reportInventory: (
    item: string,
    kind: "LOW" | "ZERO",
    cases: number | null,
    packs: number | null,
    note: string,
  ) =>
    rpc("report_inventory", {
      p_item: item,
      p_kind: kind,
      p_cases: cases,
      p_packs: packs,
      p_note: note,
    }),
  async inventory(): Promise<Attention[]> {
    const { data, error } = await db()
      .from("inventory_attention")
      .select("*,order_items(*),orders(order_number,stand_name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as Attention[];
  },
  inventoryStatus: (
    id: string,
    status: string,
    note: string,
    version: number,
  ) =>
    rpc("set_inventory_status", {
      p_id: id,
      p_status: status,
      p_note: note,
      p_version: version,
    }),
  createBox: (order: string, group: string, request: string) =>
    rpc<string>("create_repack_box", {
      p_order: order,
      p_group: group,
      p_request: request,
    }),
  saveRepack: (
    box: string,
    item: string,
    expected: number,
    actual: number,
    confirm: boolean,
    note: string,
    version: number,
  ) =>
    rpc("save_repack_item", {
      p_box: box,
      p_item: item,
      p_expected: expected,
      p_actual: actual,
      p_confirm: confirm,
      p_note: note,
      p_version: version,
    }),
  boxStatus: (box: string, status: "OPEN" | "CLOSED", version: number) =>
    rpc("set_repack_box_status", {
      p_box: box,
      p_status: status,
      p_version: version,
    }),
  verifyFull: (
    item: string,
    actual: number,
    confirm: boolean,
    note: string,
    version: number,
  ) =>
    rpc("verify_full_cases", {
      p_item: item,
      p_actual: actual,
      p_confirm: confirm,
      p_note: note,
      p_version: version,
    }),
  startPalletization: (order: string, group: string) =>
    rpc("start_palletization", { p_order: order, p_group: group }),
};
