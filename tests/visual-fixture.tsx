// Development-only synthetic harness. act deliberately never invokes write callbacks.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Shell } from "../src/components/Shell";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "../src/features/auth/context";
import { RowDashboard } from "../src/features/orders/RowDashboard";
import { PickRow } from "../src/features/orders/PickRow";
import { Verification } from "../src/features/orders/Verification";
import { ManagerOverview } from "../src/features/orders/ManagerOverview";
import { QuantityEntry } from "../src/features/orders/Verification";
import { fixture, fixtureProfile } from "./workflow-fixture";
import "../src/index.css";
import "../src/App.css";
export function VisualFixture() {
  const [view, setView] = useState("dashboard"),
    [message, setMessage] = useState("");
  const act = async () => {
    setMessage("Synthetic action only. No server writes.");
  };
  const verificationDetail = {
    ...fixture,
    sessions: fixture.sessions.map((s) => ({
      ...s,
      row_completed_at: "2026-09-16T12:10:00Z",
      clearing_completed_at: "2026-09-16T12:12:00Z",
    })),
  };
  return (
    <MemoryRouter initialEntries={["/orders/fixture/rows/B2-R1"]}>
      <AuthContext.Provider
        value={{
          profile: fixtureProfile,
          signedIn: true,
          loading: false,
          error: "",
        }}
      >
        <Routes><Route element={<Shell />}><Route path="*" element={<>
          <p className="notice">Synthetic fixture · No live data or writes.</p>
          <div className="button-row">
            {["dashboard", "pick row", "repack", "full cases", "quantity"].map(
              (v) => (
                <button key={v} onClick={() => setView(v)}>
                  Show {v}
                </button>
              ),
            )}
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ORDER WF-DEMO-01</div>
              <h1>Northside stand</h1>
            </div>
          </div>
          {message && <p role="status">{message}</p>}
          {view === "dashboard" ? (
            <>
              <RowDashboard detail={fixture} offset={0} />
              <ManagerOverview detail={fixture} blocked={false} act={act} />
            </>
          ) : view === "pick row" ? (
            <PickRow
              detail={fixture}
              rowId="B2-R1"
              blocked={false}
              offset={0}
              act={act}
            />
          ) : view === "quantity" ? (
            <QuantityEntry
              expected={7}
              actual={7}
              allocation
              disabled={false}
              onSave={() => setMessage("Count callback accepted")}
            />
          ) : (
            <Verification
              key={view}
              detail={verificationDetail}
              group="A"
              mode={view === "repack" ? "REPACK" : "FULL_CASE"}
              blocked={false}
              act={act}
            />
          )}
        </>} /></Route></Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")!).render(<VisualFixture />);

