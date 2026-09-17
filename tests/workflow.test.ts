import { describe, it, expect, vi } from "vitest";
import {
  normalizeLogin,
  parseCasePack,
  bottleneck,
  matchesProduct,
  eligibleItems,
  responsibility,
  physicalCaseCount,
} from "../src/lib/workflow";
import { coalescedRefresh, realtimeTables } from "../src/lib/realtime";
import type { OrderDetail, OrderItem } from "../src/lib/types";
describe("Operational rules", () => {
  it("normalizes usernames while preserving real email logins", () => {
    expect(normalizeLogin(" B2-R1 ")).toBe("b2-r1@warehouse.example");
    expect(normalizeLogin(" Nolan@Example.com ")).toBe("Nolan@Example.com");
  });
  it("retains flexible packaging notation and all levels", () => {
    expect(parseCasePack("8/20/100")).toEqual({
      display: "8/20/100",
      levels: [8, 20, 100],
      units: 16000,
    });
    expect(parseCasePack(" 4 / 1 ").display).toBe("4 / 1");
    expect(parseCasePack("2/3/4/5").units).toBe(120);
  });
  it("rejects malformed and unsafe case packs", () => {
    for (const p of [
      "",
      "4/0",
      "4/-1",
      "1.5/2",
      "a/b",
      "999999999/2",
      "1000000/1000000/1000000",
    ])
      expect(() => parseCasePack(p)).toThrow();
  });
  it("searches names forgiving case, spacing, punctuation and one mistyped letter", () => {
    for (const q of [
      "big",
      "BIG TRUCK",
      " big  truck ",
      "big-truck",
      "big truk",
    ])
      expect(matchesProduct("BIG TRUCK", q)).toBe(true);
    expect(matchesProduct("BIG TRUCK", "purple")).toBe(false);
  });
  it("separates loose-only, full-only and mixed requirements by group", () => {
    const items = [
      {
        id: "loose",
        group_id: "A",
        loose_qty: 7,
        full_case_qty: 0,
        product_name: "BIG TRUCK",
      },
      {
        id: "full",
        group_id: "A",
        loose_qty: 0,
        full_case_qty: 6,
        product_name: "CASE",
      },
      {
        id: "mixed",
        group_id: "A",
        loose_qty: 2,
        full_case_qty: 3,
        product_name: "MIX",
      },
      {
        id: "other",
        group_id: "B",
        loose_qty: 2,
        full_case_qty: 3,
        product_name: "OTHER",
      },
    ] as OrderItem[];
    expect(eligibleItems(items, "A", "REPACK").map((i) => i.id)).toEqual([
      "loose",
      "mixed",
    ]);
    expect(eligibleItems(items, "A", "FULL_CASE").map((i) => i.id)).toEqual([
      "full",
      "mixed",
    ]);
    expect(eligibleItems(items, "A", "REPACK", "truck")[0].loose_qty).toBe(7);
  });
  it("assigns only B3-R1 to Building 3 repack", () => {
    for (let n = 1; n <= 3; n++)
      expect(
        responsibility({ id: "B3-R" + n, building: 3, sort_order: n }),
      ).toEqual({ group: "D", mode: n === 1 ? "REPACK" : "FULL_CASE" });
  });
  it("calculates relative caution and urgent without empty rows", () => {
    const d = {
      rows: Array.from({ length: 9 }, (_, n) => ({ id: String(n) })),
      items: Array.from({ length: 9 }, (_, n) => ({
        pick_row_id: String(n),
        full_case_qty: 1,
        loose_qty: 0,
      })),
      sessions: Array.from({ length: 9 }, (_, n) => ({
        pick_row_id: String(n),
        row_completed_at: n > 0 && n <= 4 ? "done" : null,
      })),
    } as OrderDetail;
    expect(bottleneck(d, "0").level).toBe("caution");
    d.sessions.forEach((s, n) => {
      if (n > 0 && n <= 7) s.row_completed_at = "done";
    });
    expect(bottleneck(d, "0").level).toBe("urgent");
    expect(bottleneck(d, "1").level).toBe("normal");
    d.items = [];
    expect(bottleneck(d, "0").level).toBe("normal");
  });
  it("counts boxes as cases instead of loose products", () =>
    expect(physicalCaseCount(12, 2)).toEqual({
      fullCases: 12,
      repackBoxes: 2,
      total: 14,
    }));
  it("limits realtime scopes and coalesces bursts with cleanup", () => {
    vi.useFakeTimers();
    const refresh = vi.fn(),
      c = coalescedRefresh(refresh);
    c.trigger();
    c.trigger();
    c.trigger();
    vi.advanceTimersByTime(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    c.trigger();
    c.cancel();
    vi.advanceTimersByTime(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(realtimeTables("products")).toEqual(["products"]);
    expect(realtimeTables("order")).toContain("repack_boxes");
    expect(realtimeTables("orders")).not.toContain("repack_boxes");
    vi.useRealTimers();
  });
});
