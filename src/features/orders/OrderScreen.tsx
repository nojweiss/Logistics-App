import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { warehouse } from "../../services/warehouse";
import { useWarehouse } from "../../hooks/useWarehouse";
import { Badge, Feedback, SyncStatus } from "../../components/Status";
import { RowDashboard } from "./RowDashboard";
import { PickRow } from "./PickRow";
export function OrderScreen() {
  const { id = "", rowId } = useParams();
  const { profile } = useAuth();
  const manager = profile?.role !== "PICK_LEAD";
  const load = useCallback(() => warehouse.detail(id), [id]);
  const state = useWarehouse(`order-${id}`, load, id);
  const { data } = state;
  const selectedRow = rowId || (!manager ? profile?.assigned_row_id : null);
  return (
    <>
      <SyncStatus {...state} />
      <Link className="back" to={rowId ? `/orders/${id}` : "/"}>
        ← &nbsp; {rowId ? "Order overview" : "Today’s orders"}
      </Link>
      <Feedback {...state} />
      {!data ? (
        <div className="empty" role="status">
          {state.loadError ? "Order could not be loaded." : "Loading order…"}
        </div>
      ) : (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                ORDER {data.order.order_number} · {data.order.scheduled_date}
              </div>
              <h1>{data.order.stand_name}</h1>
              <p>
                {selectedRow
                  ? `${selectedRow} · Digital pick sheet`
                  : "A live view of all nine pick rows."}
              </p>
            </div>
            <Badge status={data.order.status} />
          </div>
          {data.order.status === "PLANNED" && (
            <div className="notice">
              <strong>Ready when the team is.</strong>
              <p>
                Starting captures today’s staffing plan and opens all nine rows.{" "}
                {manager
                  ? "Only one warehouse order can be active at a time."
                  : "Your manager will start this order."}
              </p>
              {manager && (
                <button
                  className="primary"
                  disabled={state.blocked}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Start this order and capture today’s staffing plan?",
                      )
                    )
                      void state.act(
                        () => warehouse.startOrder(id),
                        "Order started. Staffing snapshot recorded.",
                      );
                  }}
                >
                  ▶ &nbsp; Start order
                </button>
              )}
            </div>
          )}
          {selectedRow ? (
            <PickRow
              detail={data}
              rowId={selectedRow}
              blocked={state.blocked}
              offset={state.offset}
              act={state.act}
            />
          ) : manager ? (
            <RowDashboard detail={data} offset={state.offset} />
          ) : (
            <div className="notice">
              No pick row assigned. Ask your administrator to assign your
              default row.
            </div>
          )}
        </>
      )}
    </>
  );
}
