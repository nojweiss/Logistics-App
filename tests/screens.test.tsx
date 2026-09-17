import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RowDashboard } from "../src/features/orders/RowDashboard";
import { PickRow } from "../src/features/orders/PickRow";
import { SyncStatus } from "../src/components/Status";
import { AuthContext } from "../src/features/auth/context";
import type { OrderDetail, Profile } from "../src/lib/types";
vi.mock("../src/services/warehouse", () => ({ warehouse: {} }));
const rows = Array.from({ length: 9 }, (_, i) => ({
  id: i < 6 ? `B2-R${i + 1}` : `B3-R${i - 5}`,
  building: i < 6 ? 2 : 3,
  sort_order: i + 1,
}));
const detail: OrderDetail = {
  order: {
    id: "order",
    order_number: "DEMO-1",
    stand_name: "Demo",
    scheduled_date: "2026-09-16",
    status: "ACTIVE",
    started_at: "2026-09-16T12:00:00Z",
    completed_at: null,
  },
  rows,
  items: [
    {
      id: "item",
      order_id: "order",
      product_id: "product",
      pick_row_id: "B2-R1",
      sku: "DEMO-SKU",
      product_name: "Sample product",
      full_case_qty: 6,
      loose_qty: 2,
      completed_case_qty: 0,
      completed_loose_qty: 0,
      completed_at: null,
    },
  ],
  sessions: rows.map((row) => ({
    id: row.id,
    order_id: "order",
    pick_row_id: row.id,
    row_started_at: "2026-09-16T12:00:00Z",
    row_completed_at: null,
  })),
};
const profile: Profile = {
  id: "lead",
  display_name: "Lead",
  role: "PICK_LEAD",
  assigned_row_id: "B2-R1",
  active: true,
};
describe("Role-specific rendering", () => {
  it("renders every warehouse row and counts to managers", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RowDashboard detail={detail} offset={0} />
      </MemoryRouter>,
    );
    expect((html.match(/class="row-card /g) || []).length).toBe(9);
    expect(html).toContain("Building 3");
    expect(html).toContain("cases picked");
  });
  it("renders required case and loose quantities with unavailable actions disabled", () => {
    const html = renderToStaticMarkup(
      <AuthContext.Provider
        value={{ profile, loading: false, signedIn: true, error: "" }}
      >
        <PickRow
          detail={detail}
          rowId="B2-R1"
          blocked
          offset={0}
          act={async () => {}}
        />
      </AuthContext.Provider>,
    );
    expect(html).toContain("Sample product");
    expect(html).toContain("DEMO-SKU");
    expect(html).toContain("loose / packs");
    expect(html).toContain("LOW stock");
    expect(html).toContain("ZERO stock");
    expect(html).not.toContain("Mark picked");
    expect((html.match(/disabled=""/g) || []).length).toBe(3);
  });
  it("rejects a lead navigating to another row", () => {
    const html = renderToStaticMarkup(
      <AuthContext.Provider
        value={{ profile, loading: false, signedIn: true, error: "" }}
      >
        <PickRow
          detail={detail}
          rowId="B2-R2"
          blocked={false}
          offset={0}
          act={async () => {}}
        />
      </AuthContext.Provider>,
    );
    expect(html).toContain("This row is not assigned to you.");
    expect(html).not.toContain("Mark picked");
  });
  it("labels offline and disconnected live updates honestly", () => {
    expect(
      renderToStaticMarkup(
        <SyncStatus online={false} live={false} checked={null} loadError="" />,
      ),
    ).toContain("OFFLINE");
    expect(
      renderToStaticMarkup(
        <SyncStatus online live={false} checked={null} loadError="" />,
      ),
    ).toContain("Reconnecting");
  });
});
