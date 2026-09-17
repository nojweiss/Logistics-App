export type RealtimeScope =
  "orders" | "order" | "products" | "staffing" | "inventory";
export function realtimeTables(scope: RealtimeScope): string[] {
  switch (scope) {
    case "orders":
      return ["orders"];
    case "products":
      return ["products"];
    case "staffing":
      return ["workers", "daily_worker_assignments"];
    case "inventory":
      return ["inventory_attention"];
    case "order":
      return [
        "orders",
        "order_items",
        "pick_sessions",
        "order_workers",
        "workers",
        "worker_movements",
        "inventory_attention",
        "repack_boxes",
        "repack_box_items",
        "full_case_verifications",
        "quantity_discrepancies",
        "order_group_status",
      ];
  }
}
export function coalescedRefresh(refresh: () => void, delay = 150) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        refresh();
      }, delay);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
