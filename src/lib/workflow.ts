import type { OrderDetail, OrderItem, PickRow } from "./types";
export function normalizeLogin(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@")
    ? trimmed
    : trimmed.toLowerCase() + "@warehouse.example";
}
export function parseCasePack(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!/^[1-9]\d*(\/[1-9]\d*)*$/.test(compact))
    throw new Error("Use positive packaging levels, e.g. 4/1 or 8/20/100.");
  const levels = compact.split("/").map(Number);
  const total = levels.reduce((n, x) => n * x, 1);
  if (
    levels.length > 8 ||
    levels.some((x) => x > 1000000) ||
    !Number.isSafeInteger(total)
  )
    throw new Error("Packaging exceeds supported numeric limits.");
  return { display: value.trim(), levels, units: total };
}
export const BOTTLENECK_THRESHOLDS = { caution: 0.5, urgent: 0.875 };
export function bottleneck(detail: OrderDetail, rowId: string) {
  const applicable = detail.rows.filter((r) =>
    detail.items.some(
      (i) => i.pick_row_id === r.id && i.full_case_qty + i.loose_qty > 0,
    ),
  );
  const others = applicable.filter((r) => r.id !== rowId);
  const done = others.filter((r) =>
    detail.sessions.some((s) => s.pick_row_id === r.id && s.row_completed_at),
  ).length;
  if (
    !applicable.some((r) => r.id === rowId) ||
    !others.length ||
    detail.sessions.some((s) => s.pick_row_id === rowId && s.row_completed_at)
  )
    return { level: "normal", done, others: others.length };
  const ratio = done / others.length;
  return {
    level:
      ratio >= BOTTLENECK_THRESHOLDS.urgent
        ? "urgent"
        : ratio >= BOTTLENECK_THRESHOLDS.caution
          ? "caution"
          : "normal",
    done,
    others: others.length,
  };
}
export function responsibility(row: PickRow | undefined) {
  if (!row) return null;
  const map: Record<string, { group: string; mode: "REPACK" | "FULL_CASE" }> = {
    "B2-R1": { group: "A", mode: "REPACK" },
    "B2-R2": { group: "A", mode: "FULL_CASE" },
    "B2-R3": { group: "B", mode: "REPACK" },
    "B2-R4": { group: "B", mode: "FULL_CASE" },
    "B2-R5": { group: "C", mode: "REPACK" },
    "B2-R6": { group: "C", mode: "FULL_CASE" },
    "B3-R1": { group: "D", mode: "REPACK" },
    "B3-R2": { group: "D", mode: "FULL_CASE" },
    "B3-R3": { group: "D", mode: "FULL_CASE" },
  };
  const fallback = map[row.id];
  return {
    group: row.group_id ?? fallback?.group,
    mode: row.verification_role ?? fallback?.mode,
  };
}
function normalized(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function nearWord(a: string, b: string) {
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++diff > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
export function matchesProduct(name: string, query: string) {
  const text = normalized(name),
    words = text.split(" ");
  return normalized(query)
    .split(" ")
    .filter(Boolean)
    .every((q) => text.includes(q) || words.some((w) => nearWord(q, w)));
}
export function eligibleItems(
  items: OrderItem[],
  group: string,
  mode: "REPACK" | "FULL_CASE",
  query = "",
) {
  return items.filter(
    (i) =>
      i.group_id === group &&
      (mode === "REPACK" ? i.loose_qty : i.full_case_qty) > 0 &&
      matchesProduct(i.product_name, query),
  );
}
export function inventoryPriority(kind: string) {
  return kind === "ZERO" ? 0 : 1;
}
export function physicalCaseCount(fullCases: number, closedBoxes: number) {
  return {
    fullCases,
    repackBoxes: closedBoxes,
    total: fullCases + closedBoxes,
  };
}
export function quantityDifference(expected: number, actual: number) {
  return actual - expected;
}
