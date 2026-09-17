import { Link } from "react-router-dom";
import type { OrderDetail } from "../../lib/types";
import type { Act } from "../../lib/operations";
import { operations } from "../../services/operations";
import { MoveTeam } from "./Team";
export function ManagerOverview({
  detail,
  blocked,
  act,
}: {
  detail: OrderDetail;
  blocked: boolean;
  act: Act;
}) {
  const w = detail.workflow;
  if (!w) return null;
  const counts = w.counts;
  return (
    <>
      <section className="panel">
        <h2>Verified physical cases</h2>
        <div className="count-grid">
          <div>
            <strong>{counts?.full_cases ?? 0}</strong>Full cases
          </div>
          <div>
            <strong>{counts?.repack_boxes ?? 0}</strong>Closed repack boxes
          </div>
          <div>
            <strong>{counts?.total_cases ?? 0}</strong>Total cases
          </div>
        </div>
        <p className="fine-print">
          Open boxes and unresolved full-case counts are excluded.
        </p>
      </section>
      <div className="group-grid">
        {w.groups.map((g) => {
          const status = w.groupStatus.find((s) => s.group_id === g.id);
          const groupItems = detail.items.filter(i => i.group_id === g.id);
          const fullItems = groupItems.filter(i => i.full_case_qty > 0);
          const verified = fullItems.filter(i => w.verifications.some(v => v.order_item_id === i.id && v.status === "VERIFIED")).length;
          const loose = groupItems.reduce((sum, i) => sum + i.loose_qty, 0);
          const allocated = w.lines.filter(l => !l.removed_at && groupItems.some(i => i.id === l.order_item_id)).reduce((sum, l) => sum + l.expected_qty, 0);
          return (
            <section className="panel" key={g.id}>
              <h2>Group {g.id}</h2>
              <p>{g.name}</p><p>{verified}/{fullItems.length} full-case products verified · {allocated}/{loose} loose packs allocated</p>
              <strong className={status?.is_ready ? "ready-text" : ""}>
                {status?.is_ready
                  ? "Ready for palletization"
                  : "Verification in progress"}
              </strong>
              <div className="button-row">
                <Link
                  className="button"
                  to={`/orders/${detail.order.id}/repack/${g.id}`}
                >
                  Repack {g.box_prefix}
                </Link>
                <Link
                  className="button"
                  to={`/orders/${detail.order.id}/full-cases/${g.id}`}
                >
                  Full cases
                </Link>
              </div>
              <p>
                {
                  w.boxes.filter(
                    (b) => b.group_id === g.id && b.status === "OPEN",
                  ).length
                }{" "}
                open boxes ·{" "}
                {
                  w.boxes.filter(
                    (b) => b.group_id === g.id && b.status === "CLOSED",
                  ).length
                }{" "}
                closed
              </p>
              {status?.ready_at && (
                <small>
                  Readiness recorded{" "}
                  {new Date(status.ready_at).toLocaleString()}
                </small>
              )}
              {status?.palletize_started_at ? (
                <p className="success">
                  Palletization started{" "}
                  {new Date(status.palletize_started_at).toLocaleString()}
                </p>
              ) : (
                <button
                  className="primary"
                  disabled={
                    blocked ||
                    detail.order.status !== "ACTIVE" ||
                    !status?.is_ready
                  }
                  onClick={() =>
                    void act(
                      () =>
                        operations.startPalletization(detail.order.id, g.id),
                      "Palletization start recorded for this group.",
                    )
                  }
                >
                  Start palletization · {g.id}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <section className="panel">
        <h2>Attention & discrepancies</h2>
        <Link to="/inventory">
          Inventory Attention ·{" "}
          {w.attention.filter((a) => a.status !== "RESOLVED").length} open
        </Link>
        {w.attention
          .filter((a) => a.status !== "RESOLVED")
          .map((a) => (
            <p key={a.id} className={a.kind === "ZERO" ? "discrepancy" : ""}>
              {a.kind} ·{" "}
              {detail.items.find((i) => i.id === a.order_item_id)?.product_name}{" "}
              · {a.pick_row_id} · {a.status}
            </p>
          ))}
        {w.discrepancies
          .filter((d) => d.status === "OPEN")
          .map((d) => (
            <p className="discrepancy" key={d.id}>
              {detail.items.find((i) => i.id === d.order_item_id)?.product_name}{" "}
              · {d.kind} · Expected {d.expected_qty}, actual {d.actual_qty}
            </p>
          ))}
      </section>
      <MoveTeam
        detail={detail}
        blocked={blocked || detail.order.status !== "ACTIVE"}
        act={act}
      />
      <details className="panel">
        <summary>Staffing snapshot & movements</summary>
        <p>
          At order start: {w.staffingSnapshot?.total_workers ?? "unknown"}{" "}
          workers · {w.staffingSnapshot?.float_workers ?? "unknown"} floating.
          Current named roster: {w.team.length}.
        </p>
        {w.staffingRows?.map((r) => (
          <p key={r.pick_row_id}>
            {r.pick_row_id}: {r.worker_count} workers at start
          </p>
        ))}
        {w.team.map((t) => (
          <p key={t.worker_id}>
            {t.initials_snapshot} · {t.name_snapshot}:{" "}
            {t.at_start ? "At start" : "Joined during order"}{" "}
            {t.initial_row_id ?? "floating"} → current{" "}
            {t.current_row_id ?? "floating"}
          </p>
        ))}
        {w.movements.map((m) => (
          <p key={m.id}>
            {new Date(m.occurred_at).toLocaleString()} · {m.worker_count}{" "}
            workers · {m.source_row_id ?? "floating"} →{" "}
            {m.destination_row_id ?? "floating"}
          </p>
        ))}
      </details>
      <details className="panel">
        <summary>Recent activity · audit trail</summary>
        {w.events.map((e) => (
          <p key={e.id}>
            <time>{new Date(e.occurred_at).toLocaleString()}</time> ·{" "}
            {e.type.replaceAll("_", " ")} · {e.pick_row_id}
          </p>
        ))}
        <p className="fine-print">
          Latest 60 events. Complete append-only history remains in the
          database.
        </p>
      </details>
    </>
  );
}

