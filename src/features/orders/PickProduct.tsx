import { useState } from "react";
import type { OrderItem } from "../../lib/types";
import type { Act, OrderWorker } from "../../lib/operations";
import { operations } from "../../services/operations";
export function PickProduct({
  item,
  team,
  disabled,
  canPick,
  canUndo,
  act,
}: {
  item: OrderItem;
  team: OrderWorker[];
  disabled: boolean;
  canPick: boolean;
  canUndo: boolean;
  act: Act;
}) {
  const [flag, setFlag] = useState<"LOW" | "ZERO" | null>(null);
  const content = (
    <>
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
      <p className="fine-print">
        Case pack: {item.case_pack_display ?? "Not recorded"} · {item.sku}
      </p>
      {item.completed_at && (
        <p>
          Picked by {item.picker_initials ?? "legacy record"} ·{" "}
          {new Date(item.completed_at).toLocaleTimeString()}
          {item.original_picker_initials &&
            item.original_picker_initials !== item.picker_initials && (
              <> · Original picker {item.original_picker_initials}</>
            )}
        </p>
      )}
      <div
        className="button-row"
        aria-label={item.completed_at ? "Correct picker" : "Select picker"}
      >
        {team.map((w) => (
          <button
            key={w.worker_id}
            className="initial-button"
            title={w.name_snapshot}
            aria-label={`${item.completed_at ? "Correct picker to" : "Picked by"} ${w.name_snapshot} for ${item.product_name}`}
            disabled={disabled || !canPick}
            onClick={() =>
              void act(
                () =>
                  operations.pick(
                    item.id,
                    w.worker_id,
                    false,
                    item.pick_version ?? 0,
                  ),
                "Picker recorded.",
              )
            }
          >
            {w.initials_snapshot}
          </button>
        ))}
        {item.completed_at && (
          <button
            disabled={disabled || !canUndo}
            onClick={() =>
              void act(
                () =>
                  operations.pick(item.id, null, true, item.pick_version ?? 0),
                "Pick undone. Original attribution retained.",
              )
            }
          >
            Undo
          </button>
        )}
      </div>
      {!team.length && (
        <p className="notice">
          Select this row’s workers below to enable initials.
        </p>
      )}
      <div className="button-row">
        <button
          className="low-button"
          disabled={disabled}
          onClick={() => setFlag("LOW")}
        >
          LOW stock
        </button>
        <button
          className="zero-button"
          disabled={disabled}
          onClick={() => setFlag("ZERO")}
        >
          ZERO stock
        </button>
      </div>
      {flag && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              await operations.reportInventory(
                item.id,
                flag,
                f.get("cases") ? Number(f.get("cases")) : null,
                f.get("packs") ? Number(f.get("packs")) : null,
                String(f.get("note")),
              );
              setFlag(null);
            }, `${flag} sent to Inventory Attention.`);
          }}
        >
          <strong>
            {flag === "ZERO"
              ? "Urgent: cannot fulfill current order"
              : "Low stock — current order can be fulfilled"}{" "}
            · {item.product_name}
          </strong>
          <label>
            Available full cases (optional)
            <input name="cases" type="number" min="0" step="1" />
          </label>
          <label>
            Available loose packs (optional)
            <input name="packs" type="number" min="0" step="1" />
          </label>
          <label>
            Note
            <input name="note" />
          </label>
          <div className="button-row">
            <button className="primary" disabled={disabled}>
              Report {flag}
            </button>
            <button type="button" onClick={() => setFlag(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
  return item.completed_at ? (
    <details className="product-card picked">
      <summary>
        <span>
          ✓ {item.product_name}
          <small>
            {item.full_case_qty}cs + {item.loose_qty}pk
          </small>
        </span>
        <b>{item.picker_initials ?? "Picked"}</b>
      </summary>
      {content}
    </details>
  ) : (
    <article className="product-card">
      <h3>{item.product_name}</h3>
      {content}
    </article>
  );
}
