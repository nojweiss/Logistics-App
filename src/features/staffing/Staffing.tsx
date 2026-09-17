import { useCallback, useState } from "react";
import { useAuth } from "../auth/context";
import { useWarehouse } from "../../hooks/useWarehouse";
import { operations } from "../../services/operations";
import { Feedback, SyncStatus } from "../../components/Status";
import type { Act, Worker } from "../../lib/operations";
import { warehouseDate as localDate } from "../../lib/config";
export function Staffing() {
  const { profile } = useAuth(),
    manager = profile?.role !== "PICK_LEAD";
  const [date, setDate] = useState(localDate),
    [edit, setEdit] = useState<Worker | null | undefined>();
  const load = useCallback(() => operations.staffing(date), [date]),
    state = useWarehouse("staffing-" + date, load, undefined, "staffing");
  const data = state.data;
  return (
    <>
      <SyncStatus {...state} />
      <Feedback {...state} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">NAMED TEAMS</div>
          <h1>Daily staffing</h1>
          <p>
            Set today’s team before starting the order. Worker names are not
            login accounts.
          </p>
        </div>
        {manager && (
          <button className="primary" onClick={() => setEdit(null)}>
            Add worker
          </button>
        )}
      </div>
      <label>
        Work date
        <input
          type="date"
          value={date}
          disabled={!manager}
          onChange={(e) => setDate(e.target.value || localDate())}
        />
      </label>
      <p>
        {data?.assignments.filter((a) =>
          data.workers.some((w) => w.id === a.worker_id && w.active),
        ).length ?? 0}{" "}
        workers assigned · Starting an order captures named workers and counts.
      </p>
      {manager && edit !== undefined && (
        <WorkerEditor
          key={edit?.id ?? "new"}
          worker={edit}
          blocked={state.blocked}
          act={state.act}
          done={() => setEdit(undefined)}
        />
      )}
      <div className="catalog-list">
        {data?.workers
          .filter((w) => manager || w.active)
          .map((w) => {
            const assigned = data.assignments.find((a) => a.worker_id === w.id),
              other =
                !!assigned?.pick_row_id &&
                assigned.pick_row_id !== profile?.assigned_row_id;
            return (
              <article className="panel" key={w.id}>
                <h3>
                  {w.initials} · {w.name}
                </h3>
                {!w.active && <p>Inactive</p>}
                <label>
                  Assignment
                  <select
                    aria-label={"Row for " + w.name}
                    value={
                      assigned
                        ? (assigned.pick_row_id ?? "FLOAT")
                        : "UNASSIGNED"
                    }
                    disabled={state.blocked || !w.active || (!manager && other)}
                    onChange={(e) =>
                      void state.act(
                        () =>
                          operations.assignDaily(
                            date,
                            w.id,
                            e.target.value === "FLOAT" ? null : e.target.value,
                          ),
                        "Daily assignment saved.",
                      )
                    }
                  >
                    <option value="UNASSIGNED" disabled>
                      Not assigned
                    </option>
                    {manager && <option value="FLOAT">Floating team</option>}
                    {data.rows
                      .filter(
                        (r) =>
                          manager ||
                          r.id === profile?.assigned_row_id ||
                          r.id === assigned?.pick_row_id,
                      )
                      .map((r) => (
                        <option key={r.id}>{r.id}</option>
                      ))}
                  </select>
                </label>
                {assigned && (
                  <button
                    disabled={state.blocked || (!manager && other)}
                    onClick={() =>
                      void state.act(
                        () => operations.removeDaily(date, w.id),
                        "Worker removed from daily roster. Order snapshots retained.",
                      )
                    }
                  >
                    Remove daily assignment
                  </button>
                )}
                {manager && (
                  <button onClick={() => setEdit(w)}>Edit worker</button>
                )}
              </article>
            );
          })}
      </div>
    </>
  );
}
function WorkerEditor({
  worker,
  blocked,
  act,
  done,
}: {
  worker: Worker | null;
  blocked: boolean;
  act: Act;
  done: () => void;
}) {
  return (
    <form
      className="panel inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void act(async () => {
          await operations.saveWorker(
            worker?.id ?? null,
            String(f.get("name")),
            String(f.get("initials")).toUpperCase(),
            f.get("active") === "on",
            worker?.version ?? 0,
          );
          done();
        }, "Worker saved.");
      }}
    >
      <h2>{worker ? "Edit worker" : "New worker"}</h2>
      <label>
        Name
        <input name="name" required defaultValue={worker?.name} />
      </label>
      <label>
        Initials
        <input
          name="initials"
          required
          maxLength={4}
          pattern="[A-Za-z0-9]{1,4}"
          defaultValue={worker?.initials}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="active"
          defaultChecked={worker?.active ?? true}
        />
        Active
      </label>
      <div className="button-row">
        <button className="primary" disabled={blocked}>
          Save worker
        </button>
        <button type="button" onClick={done}>
          Cancel
        </button>
      </div>
    </form>
  );
}
