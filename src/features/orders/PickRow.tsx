import { Link } from "react-router-dom";
import type { OrderDetail } from "../../lib/types";
import type { Act } from "../../lib/operations";
import { useAuth } from "../auth/context";
import { progress } from "../../lib/metrics";
import { responsibility } from "../../lib/workflow";
import { Timer } from "../../components/Status";
import { warehouse } from "../../services/warehouse";
import { PickProduct } from "./PickProduct";
import { Team } from "./Team";
export function PickRow({
  detail,
  rowId,
  blocked,
  offset,
  act,
}: {
  detail: OrderDetail;
  rowId: string;
  blocked: boolean;
  offset: number;
  act: Act;
}) {
  const { profile } = useAuth(),
    manager = profile?.role !== "PICK_LEAD";
  if (!manager && profile?.assigned_row_id !== rowId)
    return <div className="error">This row is not assigned to you.</div>;
  const row = detail.rows.find((r) => r.id === rowId);
  if (!row) return <div className="error">Pick row not found.</div>;
  const items = detail.items.filter((i) => i.pick_row_id === rowId),
    session = detail.sessions.find((s) => s.pick_row_id === rowId);
  const p = progress(items, !!session?.row_completed_at),
    running = !!session?.row_started_at && !session.row_completed_at;
  const disabled = blocked || detail.order.status !== "ACTIVE",
    job = responsibility(row);
  const team = (detail.workflow?.team ?? []).filter(
    (t) =>
      t.current_row_id === rowId &&
      detail.workflow?.workers.some((w) => w.id === t.worker_id && w.active),
  );
  const action = (
    kind: "START" | "COMPLETE" | "CLEAR_START" | "CLEAR_COMPLETE",
    message: string,
  ) =>
    void act(() => warehouse.rowAction(detail.order.id, rowId, kind), message);
  return (
    <>
      <div className="pick-header">
        <div>
          <div className="eyebrow">{rowId} · PICKING TIME</div>
          <Timer
            start={session?.row_started_at ?? null}
            end={session?.row_completed_at ?? null}
            offset={offset}
          />
        </div>
        <strong>
          {p.done} / {p.total}
          <small>products picked</small>
        </strong>
      </div>
      <div className="progress large">
        <span style={{ width: `${p.percent}%` }} />
      </div>
      {!session?.row_started_at && (
        <button
          className="primary full row-action"
          disabled={disabled}
          onClick={() => action("START", rowId + " picking started.")}
        >
          Start {rowId}
        </button>
      )}
      {session?.row_completed_at && (
        <section className="panel">
          <h2>
            {session.clearing_completed_at
              ? "Clearing complete"
              : "Clear the row"}
          </h2>
          <Timer
            start={session.clearing_started_at ?? null}
            end={session.clearing_completed_at ?? null}
            offset={offset}
          />
          {!session.clearing_started_at ? (
            <button
              disabled={disabled}
              onClick={() => action("CLEAR_START", "Clearing started.")}
            >
              Start clearing
            </button>
          ) : !session.clearing_completed_at ? (
            <button
              className="primary"
              disabled={disabled}
              onClick={() =>
                action(
                  "CLEAR_COMPLETE",
                  "Clearing complete. Verification is available.",
                )
              }
            >
              Complete clearing
            </button>
          ) : (
            job && (
              <Link
                className="button primary"
                to={`/orders/${detail.order.id}/${job.mode === "REPACK" ? "repack" : "full-cases"}/${job.group}`}
              >
                Continue to{" "}
                {job.mode === "REPACK" ? "repack" : "full-case verification"} ·
                Group {job.group}
              </Link>
            )
          )}
        </section>
      )}
      <Team detail={detail} rowId={rowId} blocked={disabled} act={act} />
      <div className="section-heading">
        <h2>Pick sheet</h2>
        <span>{p.cases} full cases total</span>
      </div>
      <div className="pick-list">
        {items.map((item) => (
          <PickProduct
            key={item.id}
            item={item}
            team={team}
            disabled={disabled}
            canPick={running || (manager && !!item.completed_at)}
            canUndo={running}
            act={act}
          />
        ))}
      </div>
      {!items.length && (
        <div className="empty">
          No products required. This row does not hold up group readiness.
        </div>
      )}
      {running && (
        <button
          className="primary full row-action"
          disabled={disabled || p.done !== p.total}
          onClick={() => {
            if (window.confirm("Finish picking and start clearing this row?"))
              action("COMPLETE", "Picking complete. Clearing started.");
          }}
        >
          Complete picking · Start clearing
        </button>
      )}
      <p className="fine-print">
        Tap worker initials to record a pick. Expand picked products to review
        or correct. Picking and clearing have separate timers.
      </p>
    </>
  );
}
