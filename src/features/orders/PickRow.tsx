import type { OrderDetail } from "../../lib/types";
import { useAuth } from "../auth/context";
import { progress } from "../../lib/metrics";
import { Timer } from "../../components/Status";
import { warehouse } from "../../services/warehouse";
interface Props {
  detail: OrderDetail;
  rowId: string;
  blocked: boolean;
  offset: number;
  act: (action: () => Promise<void>, success: string) => Promise<void>;
}
export function PickRow({ detail, rowId, blocked, offset, act }: Props) {
  const { profile } = useAuth();
  if (profile?.role === "PICK_LEAD" && profile.assigned_row_id !== rowId)
    return (
      <div className="error" role="alert">
        This row is not assigned to you.
      </div>
    );
  if (!detail.rows.some((row) => row.id === rowId))
    return <div className="error">Pick row not found.</div>;
  const items = detail.items.filter((item) => item.pick_row_id === rowId);
  const session = detail.sessions.find((row) => row.pick_row_id === rowId);
  const p = progress(items, !!session?.row_completed_at);
  const running = !!session?.row_started_at && !session.row_completed_at;
  const disabled = blocked || detail.order.status !== "ACTIVE";
  return (
    <>
      <div className="pick-header">
        <div>
          <div className="eyebrow">{rowId} · ROW ELAPSED</div>
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
          onClick={() =>
            void act(
              () => warehouse.rowAction(detail.order.id, rowId, "START"),
              `${rowId} started.`,
            )
          }
        >
          ▶ &nbsp; Start {rowId}
        </button>
      )}
      <div className="section-heading">
        <h2>Pick sheet</h2>
        <span>{p.cases} full cases total</span>
      </div>
      <div className="pick-list">
        {items.map((item) => (
          <article
            className={`pick-item ${item.completed_at ? "picked" : ""}`}
            key={item.id}
          >
            <div className="product-name">
              <small>{item.sku}</small>
              <h3>{item.product_name}</h3>
            </div>
            <div className="quantities">
              <div>
                <strong>{item.full_case_qty}</strong>
                <span>full cases</span>
              </div>
              <div>
                <strong>{item.loose_qty}</strong>
                <span>loose / packs</span>
              </div>
            </div>
            <button
              className={item.completed_at ? "undo" : "primary"}
              disabled={disabled || !running}
              aria-label={
                item.completed_at
                  ? `Undo ${item.product_name}`
                  : `Mark ${item.product_name} picked`
              }
              onClick={() =>
                void act(
                  () => warehouse.completeItem(item.id, !item.completed_at),
                  item.completed_at
                    ? "Pick undone. Audit history retained."
                    : "Product marked picked.",
                )
              }
            >
              {item.completed_at ? "✓ Picked · Undo" : "Mark picked"}
            </button>
          </article>
        ))}
      </div>
      {!items.length && (
        <div className="empty bordered">
          No products required from this row. Start and complete it to
          acknowledge.
        </div>
      )}
      {running && (
        <button
          className="primary full row-action"
          disabled={disabled || p.done !== p.total}
          onClick={() => {
            if (
              window.confirm(
                `Complete ${rowId}? Item changes are locked once this row is complete.`,
              )
            )
              void act(
                () => warehouse.rowAction(detail.order.id, rowId, "COMPLETE"),
                `${rowId} complete.`,
              );
          }}
        >
          ✓ &nbsp; Complete row
        </button>
      )}
      {session?.row_completed_at && (
        <div className="success" role="status">
          ✓ &nbsp; Row complete. Thank you, team.
        </div>
      )}
      <p className="fine-print">
        Undo is available while the row is running. Every action retains its
        event history.
      </p>
    </>
  );
}
