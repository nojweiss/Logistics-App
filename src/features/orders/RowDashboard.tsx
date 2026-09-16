import { Link } from "react-router-dom";
import type { OrderDetail } from "../../lib/types";
import { progress } from "../../lib/metrics";
import { Badge, Timer } from "../../components/Status";
export function RowDashboard({
  detail,
  offset,
}: {
  detail: OrderDetail;
  offset: number;
}) {
  return (
    <>
      <div className="order-timing">
        <span>Warehouse elapsed</span>
        <Timer
          start={detail.order.started_at}
          end={detail.order.completed_at}
          offset={offset}
        />
        <small>Measured from order start</small>
      </div>
      {[2, 3].map((building) => (
        <section key={building}>
          <div className="section-heading">
            <h2>Building {building}</h2>
            <span>
              {building === 2 ? "6 pick rows · 3 aisles" : "3 active pick rows"}
            </span>
          </div>
          <div className="row-grid">
            {detail.rows
              .filter((row) => row.building === building)
              .map((row) => {
                const session = detail.sessions.find(
                  (s) => s.pick_row_id === row.id,
                );
                const p = progress(
                  detail.items.filter((item) => item.pick_row_id === row.id),
                  !!session?.row_completed_at,
                );
                const status = session?.row_completed_at
                  ? "COMPLETE"
                  : session?.row_started_at
                    ? "ACTIVE"
                    : "PLANNED";
                return (
                  <Link
                    className={`row-card ${status === "COMPLETE" ? "finished" : ""}`}
                    key={row.id}
                    to={`/orders/${detail.order.id}/rows/${row.id}`}
                  >
                    <div className="row-top">
                      <h3>{row.id}</h3>
                      <Badge status={status} />
                    </div>
                    <Timer
                      start={session?.row_started_at ?? null}
                      end={session?.row_completed_at ?? null}
                      offset={offset}
                    />
                    <div
                      className="progress"
                      aria-label={`${p.percent}% products complete`}
                    >
                      <span style={{ width: `${p.percent}%` }} />
                    </div>
                    <div className="row-metrics">
                      <span>
                        {p.done}/{p.total} products
                      </span>
                      <strong>{p.percent}%</strong>
                    </div>
                    <div className="row-foot">
                      <span>
                        {p.pickedCases}/{p.cases} cases picked
                      </span>
                      <span aria-hidden="true">↗</span>
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
      <p className="fine-print">
        Progress describes the order’s work, never individual employee
        performance.
      </p>
    </>
  );
}
