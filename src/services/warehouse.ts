import {
  realtimeTables,
  coalescedRefresh,
  type RealtimeScope,
} from "../lib/realtime";
import { db } from "../lib/supabase";
import type { Order, OrderDetail } from "../lib/types";
export const warehouse = {
  async orders(date: string): Promise<Order[]> {
    const { data, error } = await db()
      .from("orders")
      .select("*")
      .or(`scheduled_date.eq.${date},status.eq.ACTIVE`)
      .order("created_at");
    if (error) throw error;
    return data as Order[];
  },
  async detail(id: string): Promise<OrderDetail> {
    const { data, error } = await db().rpc("order_bundle", { p_order: id });
    if (error) throw error;
    if (!data?.order) throw new Error("Order unavailable or access denied.");
    return data as OrderDetail;
  },
  async clockOffset(): Promise<number> {
    const before = Date.now();
    const { data, error } = await db().rpc("server_time");
    const after = Date.now();
    if (error) throw error;
    return Date.parse(String(data)) - (before + after) / 2;
  },
  async startOrder(orderId: string) {
    await call("start_order", { p_order: orderId });
  },
  async rowAction(
    orderId: string,
    rowId: string,
    action: "START" | "COMPLETE" | "CLEAR_START" | "CLEAR_COMPLETE",
  ) {
    await call("row_action", {
      p_order: orderId,
      p_row: rowId,
      p_action: action,
    });
  },
  async completeItem(itemId: string, complete: boolean) {
    await call("set_item_complete", { p_item: itemId, p_complete: complete });
  },
  subscribe(
    orderId: string | undefined,
    refresh: () => void,
    connection: (connected: boolean) => void,
    scope: RealtimeScope = orderId ? "order" : "orders",
  ) {
    const channel = db().channel(`floor-${crypto.randomUUID()}`);
    const scheduled = coalescedRefresh(refresh);
    for (const table of realtimeTables(scope)) {
      const filter =
        orderId && table !== "workers"
          ? `${table === "orders" ? "id" : "order_id"}=eq.${orderId}`
          : undefined;
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        scheduled.trigger,
      );
    }
    channel.subscribe((status) => {
      connection(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") refresh();
    });
    return () => {
      scheduled.cancel();
      void db().removeChannel(channel);
    };
  },
};
async function call(name: string, args: Record<string, unknown>) {
  if (!navigator.onLine)
    throw new Error("OFFLINE. Nothing was sent. Reconnect and try again.");
  const { error } = await db().rpc(name, args);
  if (error) throw error;
}
