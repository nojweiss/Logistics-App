import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { useWarehouse } from "../../hooks/useWarehouse";
import { operations } from "../../services/operations";
import { Feedback, SyncStatus } from "../../components/Status";
import { inventoryPriority } from "../../lib/workflow";
import type { Act, Attention } from "../../lib/operations";
export function Inventory() {
  const { profile } = useAuth();
  return profile?.role === "PICK_LEAD" ? (
    <div className="error">
      Inventory Attention is managed by sheet managers and administrators.
    </div>
  ) : (
    <Queue />
  );
}
function Queue() {
  const state = useWarehouse(
      "inventory",
      operations.inventory,
      undefined,
      "inventory",
    ),
    [history, setHistory] = useState(false);
  const items = (state.data ?? [])
    .filter((a) => history || a.status !== "RESOLVED")
    .sort((a, b) => inventoryPriority(a.kind) - inventoryPriority(b.kind));
  return (
    <>
      <SyncStatus {...state} />
      <Feedback {...state} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">MANAGER QUEUE</div>
          <h1>Inventory Attention</h1>
          <p>
            Urgent ZERO reports appear first. Keep full cases and loose packs
            separate.
          </p>
        </div>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={history}
          onChange={(e) => setHistory(e.target.checked)}
        />
        Include resolved history
      </label>
      {items.map((a) => (
        <AttentionCard
          key={a.id + "-" + a.version}
          attention={a}
          blocked={state.blocked}
          act={state.act}
        />
      ))}
      {!items.length && (
        <div className="empty">No inventory reports in this view.</div>
      )}
    </>
  );
}
function AttentionCard({
  attention: a,
  blocked,
  act,
}: {
  attention: Attention;
  blocked: boolean;
  act: Act;
}) {
  const item = a.order_items,
    [status, setStatus] = useState(a.status),
    [note, setNote] = useState(a.note);
  return (
    <article className={"panel inventory-card " + a.kind.toLowerCase()}>
      <div className="section-heading">
        <h2>{a.kind === "ZERO" ? "URGENT · ZERO" : "LOW STOCK"}</h2>
        <b>{a.status.replaceAll("_", " ")}</b>
      </div>
      <h3>{item?.product_name ?? "Product"}</h3>
      <p>
        {item?.case_pack_display ?? "Pack not recorded"} · {a.pick_row_id} ·{" "}
        <Link to={"/orders/" + a.order_id}>
          {a.orders?.order_number ?? "Order"}
        </Link>{" "}
        · {a.orders?.stand_name}
      </p>
      <p>
        Required:{" "}
        <strong>
          {item?.full_case_qty ?? "—"} full cases / {item?.loose_qty ?? "—"}{" "}
          loose packs
        </strong>
      </p>
      <p>
        Available: {a.available_cases ?? "unknown"} full cases /{" "}
        {a.available_packs ?? "unknown"} loose packs
      </p>
      <p>
        Shortage:{" "}
        {a.available_cases !== null && item
          ? Math.max(0, item.full_case_qty - a.available_cases)
          : "unknown"}{" "}
        full cases /{" "}
        {a.available_packs !== null && item
          ? Math.max(0, item.loose_qty - a.available_packs)
          : "unknown"}{" "}
        loose packs
      </p>
      <p className="fine-print">
        Reported by {a.reporter_name} ·{" "}
        {new Date(a.created_at).toLocaleString()}
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(
            () => operations.inventoryStatus(a.id, status, note, a.version),
            "Inventory status recorded.",
          );
        }}
      >
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Attention["status"])}
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
        <label>
          Resolution / progress note
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button disabled={blocked} className="primary">
          Update report
        </button>
      </form>
    </article>
  );
}
