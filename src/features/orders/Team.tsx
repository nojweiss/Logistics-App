import { useState } from "react";
import type { OrderDetail } from "../../lib/types";
import type { Act } from "../../lib/operations";
import { operations } from "../../services/operations";
export function Team({
  detail,
  rowId,
  blocked,
  act,
}: {
  detail: OrderDetail;
  rowId: string;
  blocked: boolean;
  act: Act;
}) {
  const w = detail.workflow;
  return (
    <details className="panel">
      <summary>
        Row team ·{" "}
        {w?.team
          .filter((t) => t.current_row_id === rowId)
          .map((t) => t.initials_snapshot)
          .join(", ") || "Select workers"}
      </summary>
      <p>
        Tap a name to assign this worker to {rowId}. Initial assignments remain
        in the staffing snapshot.
      </p>
      <div className="button-row">
        {w?.workers
          .filter(
            (p) =>
              p.active &&
              !w.team.some(
                (t) =>
                  t.worker_id === p.id &&
                  t.current_row_id &&
                  t.current_row_id !== rowId,
              ),
          )
          .map((p) => (
            <button
              key={p.id}
              disabled={
                blocked ||
                w.team.some(
                  (t) => t.worker_id === p.id && t.current_row_id === rowId,
                )
              }
              onClick={() =>
                void act(
                  () => operations.assignOrder(detail.order.id, p.id, rowId),
                  "Worker assigned.",
                )
              }
            >
              {p.initials} · {p.name}
            </button>
          ))}
      </div>
    </details>
  );
}
export function MoveTeam({
  detail,
  blocked,
  act,
}: {
  detail: OrderDetail;
  blocked: boolean;
  act: Act;
}) {
  const [source, setSource] = useState(""),
    [destination, setDestination] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  return (
    <details className="panel">
      <summary>Move workers between rows</summary>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await operations.moveWorkers(
              detail.order.id,
              selected,
              source || null,
              destination || null,
            );
            setSelected([]);
          }, "Movement recorded with worker names and count.");
        }}
      >
        <label>
          From
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setSelected([]);
            }}
          >
            <option value="">Floating team</option>
            {detail.rows.map((r) => (
              <option key={r.id}>{r.id}</option>
            ))}
          </select>
        </label>
        <div className="button-row">
          {detail.workflow?.team
            .filter((t) => (t.current_row_id ?? "") === source)
            .map((t) => (
              <label className="check-label" key={t.worker_id}>
                <input
                  type="checkbox"
                  checked={selected.includes(t.worker_id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, t.worker_id]
                        : selected.filter((id) => id !== t.worker_id),
                    )
                  }
                />
                {t.initials_snapshot} · {t.name_snapshot}
              </label>
            ))}
        </div>
        <label>
          To
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Floating team</option>
            {detail.rows.map((r) => (
              <option key={r.id}>{r.id}</option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          disabled={blocked || !selected.length || source === destination}
        >
          Move {selected.length} workers
        </button>
      </form>
    </details>
  );
}
