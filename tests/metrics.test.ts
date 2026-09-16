import { expect, it } from "vitest";
import { duration, progress } from "../src/lib/metrics";
import type { OrderItem } from "../src/lib/types";
it("derives elapsed time after screen suspension", () => {
  expect(
    duration("2026-01-01T00:00:00Z", null, Date.parse("2026-01-01T02:03:04Z")),
  ).toBe("02:03:04");
});
it("freezes a completed row independently of current clock", () => {
  expect(
    duration("2026-01-01T00:00:00Z", "2026-01-01T00:01:12Z", Date.now()),
  ).toBe("00:01:12");
  expect(duration(null, null)).toBe("—");
});
it("handles empty rows without NaN and acknowledges completed empty rows", () => {
  expect(progress([]).percent).toBe(0);
  expect(progress([], true).percent).toBe(100);
});
it("counts products and cases separately from loose quantities", () => {
  const item: OrderItem = {
    id: "a",
    order_id: "o",
    product_id: "p",
    pick_row_id: "B2-R1",
    sku: "S",
    product_name: "Product",
    full_case_qty: 4,
    loose_qty: 2,
    completed_case_qty: 4,
    completed_loose_qty: 2,
    completed_at: "2026-01-01T00:00:00Z",
  };
  expect(progress([item])).toEqual({
    done: 1,
    total: 1,
    cases: 4,
    pickedCases: 4,
    percent: 100,
  });
});
