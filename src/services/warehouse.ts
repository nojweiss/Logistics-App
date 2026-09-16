import { db } from "../lib/supabase";
import type {
  Order,
  OrderDetail,
  OrderItem,
  PickRow,
  PickSession,
} from "../lib/types";
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
    const responses = await Promise.all([
      db().from("orders").select("*").eq("id", id).single(),
      db().from("pick_rows").select("*").order("sort_order"),
      db().from("order_items").select("*").eq("order_id", id).order("sku"),
      db().from("pick_sessions").select("*").eq("order_id", id),
    ]);
    for (const response of responses) if (response.error) throw response.error;
    return {
      order: responses[0].data as Order,
      rows: responses[1].data as PickRow[],
      items: responses[2].data as OrderItem[],
      sessions: responses[3].data as PickSession[],
    };
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
    action: "START" | "COMPLETE",
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
  ) {
    const channel = db().channel(`floor-${crypto.randomUUID()}`);
    for (const table of ["orders", "order_items", "pick_sessions"]) {
      const filter = orderId
        ? `${table === "orders" ? "id" : "order_id"}=eq.${orderId}`
        : undefined;
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        refresh,
      );
    }
    channel.subscribe((status) => {
      connection(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") refresh();
    });
    return () => {
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
