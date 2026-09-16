import type { OrderItem } from "./types";
export function duration(
  start: string | null,
  end: string | null,
  now = Date.now(),
): string {
  if (!start) return "—";
  const seconds = Math.max(
    0,
    Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000),
  );
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export function progress(items: OrderItem[], complete = false) {
  const done = items.filter((item) => item.completed_at !== null).length;
  return {
    done,
    total: items.length,
    cases: items.reduce((sum, item) => sum + item.full_case_qty, 0),
    pickedCases: items.reduce((sum, item) => sum + item.completed_case_qty, 0),
    percent: items.length
      ? Math.round((done / items.length) * 100)
      : complete
        ? 100
        : 0,
  };
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Unable to reach the warehouse. Please retry.";
}
