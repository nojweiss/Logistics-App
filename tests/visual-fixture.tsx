// Development-only visual harness. Not an entry in the production build.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../src/features/auth/context";
import { RowDashboard } from "../src/features/orders/RowDashboard";
import { PickRow } from "../src/features/orders/PickRow";
import type { OrderDetail, Profile } from "../src/lib/types";
import "../src/index.css";
import "../src/App.css";
const rows = Array.from({ length: 9 }, (_, i) => ({
  id: i < 6 ? `B2-R${i + 1}` : `B3-R${i - 5}`,
  building: i < 6 ? 2 : 3,
  sort_order: i + 1,
}));
const detail: OrderDetail = {
  order: {
    id: "fixture",
    order_number: "DEMO-101",
    stand_name: "Demo · Northside stand",
    scheduled_date: "2026-09-16",
    status: "ACTIVE",
    started_at: "2026-09-16T12:00:00Z",
    completed_at: null,
  },
  rows,
  items: rows.flatMap((row, i) =>
    [0, 1].map((n) => ({
      id: row.id + n,
      order_id: "fixture",
      product_id: row.id + n,
      pick_row_id: row.id,
      sku: `DEMO-${i + 1}-${n}`,
      product_name: n
        ? "Development sample · Family assortment"
        : "Development sample · Celebration pack",
      full_case_qty: 6 + i,
      loose_qty: 2,
      completed_case_qty: i < 2 ? 6 + i : 0,
      completed_loose_qty: i < 2 ? 2 : 0,
      completed_at: i < 2 ? "2026-09-16T12:10:00Z" : null,
    })),
  ),
  sessions: rows.map((row, i) => ({
    id: row.id,
    order_id: "fixture",
    pick_row_id: row.id,
    row_started_at: i < 7 ? "2026-09-16T12:00:00Z" : null,
    row_completed_at: i < 2 ? "2026-09-16T12:10:00Z" : null,
  })),
};
const profile: Profile = {
  id: "fixture",
  display_name: "Demo manager",
  role: "ADMIN",
  active: true,
  assigned_row_id: null,
};
const fixtureOffset = Date.parse("2026-09-16T12:28:15Z") - Date.now();
export function VisualFixture() {
  const [showRow, setShowRow] = useState(false);
  return (
    <MemoryRouter>
      <AuthContext.Provider
        value={{ profile, signedIn: true, loading: false, error: "" }}
      >
        <header className="topbar">
          <div className="brand">
            ▥ <b>FLOOR</b>
            <span>WAREHOUSE OPERATIONS</span>
          </div>
        </header>
        <main>
          <div className="notice">
            Development fixture · no live warehouse data or writes.
          </div>
          <button onClick={() => setShowRow(!showRow)}>
            {showRow ? "Show dashboard" : "Show pick row"}
          </button>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ORDER DEMO-101</div>
              <h1>Northside stand</h1>
              <p>
                {showRow
                  ? "B2-R3 · Digital pick sheet"
                  : "A live view of all nine pick rows."}
              </p>
            </div>
          </div>
          {showRow ? (
            <PickRow
              detail={detail}
              rowId="B2-R3"
              blocked
              offset={fixtureOffset}
              act={async () => {}}
            />
          ) : (
            <RowDashboard detail={detail} offset={fixtureOffset} />
          )}
        </main>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")!).render(<VisualFixture />);
