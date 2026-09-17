import type { OrderDetail, Profile } from "../src/lib/types";
export const fixtureProfile: Profile = {
  id: "fixture",
  display_name: "Demo manager",
  role: "ADMIN",
  active: true,
  assigned_row_id: null,
};
const stamp = "2026-09-16T12:10:00Z";
const rows = Array.from({ length: 9 }, (_, n) => ({
  id: n < 6 ? "B2-R" + (n + 1) : "B3-R" + (n - 5),
  building: n < 6 ? 2 : 3,
  sort_order: n + 1,
  group_id: n < 6 ? ["A", "B", "C"][Math.floor(n / 2)] : "D",
  verification_role: (n === 6 || (n < 6 && n % 2 === 0)
    ? "REPACK"
    : "FULL_CASE") as "REPACK" | "FULL_CASE",
}));
export const fixture: OrderDetail = {
  order: {
    id: "fixture",
    order_number: "WF-DEMO-01",
    stand_name: "Northside stand",
    scheduled_date: "2026-09-16",
    status: "ACTIVE",
    started_at: "2026-09-16T12:00:00Z",
    completed_at: null,
  },
  rows,
  items: rows.flatMap((r, n) =>
    Array.from({ length: n === 0 ? 36 : 3 }, (_, i) => ({
      id: r.id + "-" + i,
      order_id: "fixture",
      product_id: r.id + "-" + i,
      pick_row_id: r.id,
      group_id: r.group_id,
      sku: "DEMO-" + i,
      product_name:
        i === 0
          ? "BIG TRUCK"
          : i === 1
            ? "PURPLE RAIN"
            : i === 2
              ? "ROMAN CANDLE PACK"
              : "Celebration assortment " + (i + 1),
      full_case_qty: i === 1 ? 0 : 6,
      loose_qty: i === 2 ? 0 : 7,
      completed_case_qty: i < 3 && i !== 1 ? 6 : 0,
      completed_loose_qty: i < 3 && i !== 2 ? 7 : 0,
      completed_at: i < 3 ? stamp : null,
      picker_initials: i < 3 ? "PB" : null,
      original_picker_initials: i < 3 ? "PB" : null,
      original_picked_at: i < 3 ? stamp : null,
      case_pack_display: i % 2 ? "8/20/100" : "4/1",
      pick_version: i < 3 ? 1 : 0,
    })),
  ),
  sessions: rows.map((r, n) => ({
    id: r.id,
    order_id: "fixture",
    pick_row_id: r.id,
    row_started_at: "2026-09-16T12:00:00Z",
    row_completed_at: n === 1 ? stamp : null,
    clearing_started_at: n === 1 ? stamp : null,
    clearing_completed_at: n === 1 ? stamp : null,
  })),
  workflow: {
    groups: ["A", "B", "C", "D"].map((id, n) => ({
      id,
      name: n === 3 ? "Building 3" : "Building 2 · Aisle " + (n + 1),
      repack_row_id: n === 3 ? "B3-R1" : "B2-R" + (n * 2 + 1),
      box_prefix: id,
    })),
    workers: [
      {
        id: "pb",
        name: "Parker Brooks",
        initials: "PB",
        active: true,
        version: 1,
      },
      {
        id: "nw",
        name: "Nolan Weiss",
        initials: "NW",
        active: true,
        version: 1,
      },
      {
        id: "ec",
        name: "Ellis Carter",
        initials: "EC",
        active: true,
        version: 1,
      },
    ],
    team: ["pb", "nw", "ec"].map((id, n) => ({
      order_id: "fixture",
      worker_id: id,
      initial_row_id: "B2-R1",
      current_row_id: "B2-R1",
      name_snapshot: ["Parker Brooks", "Nolan Weiss", "Ellis Carter"][n],
      initials_snapshot: ["PB", "NW", "EC"][n],
    })),
    boxes: [1, 2].map((n) => ({
      id: "a" + n,
      order_id: "fixture",
      group_id: "A",
      station_row_id: "B2-R1",
      prefix: "A",
      box_number: n,
      status: "OPEN",
      created_at: stamp,
      completed_at: null,
      version: 1,
    })),
    lines: [
      {
        id: "line",
        order_id: "fixture",
        box_id: "a1",
        order_item_id: "B2-R1-0",
        expected_qty: 7,
        actual_qty: 6,
        removed_at: null,
        updated_at: stamp,
        updated_by: "fixture",
        version: 1,
      },
    ],
    discrepancies: [
      {
        id: "disc",
        order_id: "fixture",
        order_item_id: "B2-R1-0",
        box_id: "a1",
        kind: "REPACK",
        expected_qty: 7,
        actual_qty: 6,
        status: "OPEN",
        note: "Recount requested",
        created_at: stamp,
        resolved_at: null,
      },
    ],
    verifications: [],
    attention: [],
    groupStatus: [],
    counts: {
      order_id: "fixture",
      full_cases: 12,
      repack_boxes: 2,
      total_cases: 14,
    },
    events: [],
    movements: [],
  },
};
