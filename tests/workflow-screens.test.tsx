import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../src/features/auth/context";
import { fixture, fixtureProfile } from "./workflow-fixture";
import { PickRow } from "../src/features/orders/PickRow";
import { Verification } from "../src/features/orders/Verification";
import { ManagerOverview } from "../src/features/orders/ManagerOverview";
import type { ReactNode } from "react";
const act = async () => {};
function render(child: ReactNode, lead = false) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          profile: lead
            ? { ...fixtureProfile, role: "PICK_LEAD", assigned_row_id: "B2-R1" }
            : fixtureProfile,
          signedIn: true,
          loading: false,
          error: "",
        }}
      >
        {child}
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
describe("Operational screens", () => {
  it("uses named initials and collapses completed products without hiding them", () => {
    const h = render(
      <PickRow
        detail={fixture}
        rowId="B2-R1"
        blocked={false}
        offset={0}
        act={act}
      />,
    );
    expect(h).toContain("Picked by Nolan Weiss for Celebration");
    expect(h).toContain('<details class="product-card picked">');
    expect(h).toContain("6cs + 7pk");
    expect(h).toContain("Picked by PB");
    expect(h).not.toContain("Mark picked");
    expect((h.match(/class="product-card/g) || []).length).toBe(36);
  });
  it("renders multiple open boxes and visible discrepancy while excluding case-only search results", () => {
    const h = render(
      <Verification
        detail={fixture}
        group="A"
        mode="REPACK"
        blocked={false}
        act={act}
      />,
    );
    expect(h).toContain("A1");
    expect(h).toContain("A2");
    expect(h).toContain("unresolved discrepancies");
    expect(h).not.toContain("ROMAN CANDLE PACK");
    expect(h).toContain("Expected packs allocated to this box");
  });
  it("shows full-case requirements only and restricts lead station routes", () => {
    const h = render(
      <Verification
        detail={fixture}
        group="A"
        mode="FULL_CASE"
        blocked={false}
        act={act}
      />,
    );
    expect(h).not.toContain("PURPLE RAIN");
    expect(h).toContain("6 full cases");
    expect(
      render(
        <Verification
          detail={fixture}
          group="D"
          mode="REPACK"
          blocked={false}
          act={act}
        />,
        true,
      ),
    ).toContain("not assigned");
  });
  it("shows physical case totals, groups, staffing and start-only milestone", () => {
    const h = render(
      <ManagerOverview detail={fixture} blocked={false} act={act} />,
    );
    expect(h).toContain("Closed repack boxes");
    expect(h).toContain("Start palletization");
    expect(h).toContain("Staffing snapshot");
    expect(h).not.toContain("Load trailer");
  });
});
