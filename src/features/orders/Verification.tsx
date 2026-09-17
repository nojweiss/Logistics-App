import { useState } from "react";
import type { OrderDetail, OrderItem } from "../../lib/types";
import type { Act, RepackBox } from "../../lib/operations";
import { eligibleItems, responsibility } from "../../lib/workflow";
import { operations } from "../../services/operations";
import { useAuth } from "../auth/context";
export function QuantityEntry({
  expected,
  actual,
  initialAllocation,
  allocation = false,
  disabled,
  onSave,
}: {
  expected: number;
  actual: number;
  initialAllocation?: number;
  allocation?: boolean;
  disabled: boolean;
  onSave: (
    expected: number,
    actual: number,
    confirmed: boolean,
    note: string,
  ) => void;
}) {
  const [planned, setPlanned] = useState(initialAllocation ?? expected),
    [count, setCount] = useState(actual),
    [note, setNote] = useState(""),
    [review, setReview] = useState(false);
  const mismatch = planned !== count;
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (mismatch && !review) {
          setReview(true);
          return;
        }
        onSave(planned, count, mismatch && review, note);
      }}
    >
      {allocation ? (
        <label>
          Expected packs allocated to this box
          <input
            aria-label="Expected allocation"
            type="number"
            min="1"
            max={expected}
            step="1"
            required
            value={planned}
            onChange={(e) => {
              setPlanned(Number(e.target.value));
              setReview(false);
            }}
          />
        </label>
      ) : (
        <p>
          Expected: <strong>{expected} full cases</strong>
        </p>
      )}
      <label>
        {allocation
          ? "Actual packs placed in this box"
          : "Actual full cases counted"}
        <input
          aria-label="Actual quantity"
          type="number"
          min="0"
          step="1"
          required
          value={count}
          onChange={(e) => {
            setCount(Number(e.target.value));
            setReview(false);
          }}
        />
      </label>
      <label>
        Count note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {review && mismatch && (
        <div className="discrepancy" role="alert">
          <strong>
            Discrepancy: expected {planned}, actual {count}
          </strong>
          <p>
            {count < planned ? planned - count : count - planned}{" "}
            {allocation ? "packs" : "cases"}{" "}
            {count < planned ? "short" : "over"}. Correct the count above or
            explicitly confirm. This remains unresolved until corrected.
          </p>
          <button type="button" onClick={() => setReview(false)}>
            Return to count
          </button>
        </div>
      )}
      <button className="primary" disabled={disabled}>
        {review && mismatch
          ? "Confirm discrepancy"
          : mismatch
            ? "Review discrepancy"
            : "Save verified count"}
      </button>
    </form>
  );
}
function Attribution({ item }: { item: OrderItem }) {
  return (
    <p className="fine-print">
      Picked by {item.picker_initials ?? "not recorded"} · Original picker{" "}
      {item.original_picker_initials ?? "not recorded"}
      {item.original_picked_at
        ? " · " + new Date(item.original_picked_at).toLocaleString()
        : ""}
    </p>
  );
}
export function Verification({
  detail,
  group,
  mode,
  blocked,
  act,
}: {
  detail: OrderDetail;
  group: string;
  mode: "REPACK" | "FULL_CASE";
  blocked: boolean;
  act: Act;
}) {
  const { profile } = useAuth(),
    manager = profile?.role !== "PICK_LEAD";
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [request, setRequest] = useState(() => crypto.randomUUID());
  const w = detail.workflow;
  const assigned = responsibility(
    detail.rows.find((r) => r.id === profile?.assigned_row_id),
  );
  if (!w)
    return (
      <div className="notice">Apply migration 002 to enable verification.</div>
    );
  if (!manager && (assigned?.group !== group || assigned.mode !== mode))
    return <div className="error">This station is not assigned to you.</div>;
  const ownCleared =
    manager ||
    detail.sessions.some(
      (s) =>
        s.pick_row_id === profile?.assigned_row_id && s.clearing_completed_at,
    );
  const disabled = blocked || detail.order.status !== "ACTIVE" || !ownCleared;
  const boxes = w.boxes.filter((b) => b.group_id === group),
    box =
      boxes.find((b) => b.id === selected) ??
      boxes.find((b) => b.status === "OPEN") ??
      boxes[0];
  const items = eligibleItems(detail.items, group, mode, query);
  const cleared = (i: OrderItem) =>
    !!i.completed_at &&
    detail.sessions.some(
      (s) => s.pick_row_id === i.pick_row_id && s.clearing_completed_at,
    );
  return (
    <section>
      <div className="section-heading">
        <h2>
          {mode === "REPACK" ? "Repack station" : "Full-case verification"} ·{" "}
          {group}
        </h2>
      </div>
      {!ownCleared && (
        <div className="notice">
          Complete your row’s clearing before verification.
        </div>
      )}
      {mode === "REPACK" && (
        <>
          <button
            className="primary"
            disabled={disabled}
            onClick={() =>
              void act(async () => {
                const id = await operations.createBox(
                  detail.order.id,
                  group,
                  request,
                );
                setSelected(id);
                setRequest(crypto.randomUUID());
              }, "New box opened.")
            }
          >
            + Open next {group} box
          </button>
          <div className="box-tabs" aria-label="Repack boxes">
            {boxes.map((b) => (
              <button
                className={box?.id === b.id ? "selected" : ""}
                key={b.id}
                onClick={() => setSelected(b.id)}
              >
                {b.prefix}
                {b.box_number} <small>{b.status}</small>
              </button>
            ))}
          </div>
          {box && (
            <BoxSummary
              box={box}
              detail={detail}
              disabled={disabled}
              manager={manager}
              act={act}
            />
          )}
          {!box && (
            <p className="notice">
              Open a box to begin. Multiple boxes may stay open while counts are
              checked.
            </p>
          )}
        </>
      )}
      <label className="search-label">
        Find product by name
        <input
          type="search"
          placeholder="Try BIG TRUCK"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="fine-print">
        {mode === "REPACK"
          ? "Only products with loose packs appear. Full cases stay separate."
          : "Only products requiring full cases appear. Loose packs are verified at repack."}
      </p>
      <div className="verification-list">
        {items.map((item) => {
          const verified = w.verifications.find(
            (v) => v.order_item_id === item.id,
          );
          const line =
            box &&
            w.lines.find(
              (l) => l.box_id === box.id && l.order_item_id === item.id,
            );
          const reserved = w.lines
            .filter(
              (l) =>
                !l.removed_at &&
                l.order_item_id === item.id &&
                l.box_id !== box?.id,
            )
            .reduce((s, l) => s + l.expected_qty, 0);
          const remaining = item.loose_qty - reserved;
          const activeLine = line && !line.removed_at ? line : null;
          const canEdit =
            !disabled &&
            cleared(item) &&
            (mode === "FULL_CASE" || (box?.status === "OPEN" && remaining > 0));
          return (
            <details className="product-card" key={item.id}>
              <summary>
                <span>
                  {item.product_name}
                  <small>
                    {item.case_pack_display ?? "Pack not recorded"} ·{" "}
                    {item.pick_row_id}
                  </small>
                </span>
                <b>
                  {mode === "REPACK"
                    ? `${item.loose_qty} packs`
                    : verified?.status === "VERIFIED"
                      ? "✓ Verified"
                      : `${item.full_case_qty} cases`}
                </b>
              </summary>
              <Attribution item={item} />
              {!cleared(item) && (
                <p className="notice">
                  Waiting for source row picking and clearing.
                </p>
              )}
              {mode === "REPACK" ? (
                <>
                  <p>
                    {reserved} packs allocated to other boxes · {remaining}{" "}
                    available for this box.
                  </p>
                  {activeLine && (
                    <p>
                      In {box?.prefix}
                      {box?.box_number}: expected {activeLine.expected_qty},
                      actual {activeLine.actual_qty}
                    </p>
                  )}
                  {box && remaining > 0 && (
                    <QuantityEntry
                      key={`${box.id}-${line?.version ?? 0}-${remaining}`}
                      expected={remaining}
                      actual={activeLine?.actual_qty ?? remaining}
                      initialAllocation={activeLine?.expected_qty}
                      allocation
                      disabled={!canEdit}
                      onSave={(e, a, c, n) =>
                        void act(
                          () =>
                            operations.saveRepack(
                              box.id,
                              item.id,
                              e,
                              a,
                              c,
                              n,
                              line?.version ?? 0,
                            ),
                          "Box allocation saved.",
                        )
                      }
                    />
                  )}
                  {activeLine && box && (
                    <button
                      disabled={disabled || box.status !== "OPEN"}
                      onClick={() =>
                        void act(
                          () =>
                            operations.saveRepack(
                              box.id,
                              item.id,
                              0,
                              0,
                              false,
                              "Removed from box",
                              line?.version ?? 0,
                            ),
                          "Allocation removed; history retained.",
                        )
                      }
                    >
                      Remove from this box
                    </button>
                  )}
                </>
              ) : (
                <>
                  {verified && (
                    <p
                      className={
                        verified.status === "DISCREPANCY"
                          ? "discrepancy"
                          : "success"
                      }
                    >
                      {verified.status} · Actual {verified.actual_qty} ·{" "}
                      {verified.verifier_name} ·{" "}
                      {new Date(verified.verified_at).toLocaleString()}
                    </p>
                  )}
                  <QuantityEntry
                    key={verified?.version ?? 0}
                    expected={item.full_case_qty}
                    actual={verified?.actual_qty ?? item.full_case_qty}
                    disabled={!canEdit}
                    onSave={(_e, a, c, n) =>
                      void act(
                        () =>
                          operations.verifyFull(
                            item.id,
                            a,
                            c,
                            n,
                            verified?.version ?? 0,
                          ),
                        "Full-case count saved.",
                      )
                    }
                  />
                </>
              )}
            </details>
          );
        })}
      </div>
      {!items.length && (
        <div className="empty">
          No matching {mode === "REPACK" ? "loose-pack" : "full-case"} products.
        </div>
      )}
    </section>
  );
}
function BoxSummary({
  box,
  detail,
  disabled,
  manager,
  act,
}: {
  box: RepackBox;
  detail: OrderDetail;
  disabled: boolean;
  manager: boolean;
  act: Act;
}) {
  const w = detail.workflow!,
    lines = w.lines.filter((l) => l.box_id === box.id && !l.removed_at),
    issues = w.discrepancies.filter(
      (d) => d.box_id === box.id && d.status === "OPEN",
    );
  return (
    <div className="box-panel">
      <div className="box-label">
        {box.prefix}
        {box.box_number}
      </div>
      <strong>
        {box.status} · {lines.length} products
      </strong>
      <p>
        {box.completed_at
          ? "Closed " + new Date(box.completed_at).toLocaleString()
          : "Each closed box counts as one physical case."}
      </p>
      {lines.map((l) => (
        <p key={l.id}>
          {detail.items.find((i) => i.id === l.order_item_id)?.product_name}:{" "}
          {l.actual_qty} / {l.expected_qty} packs
        </p>
      ))}
      {!!issues.length && (
        <p className="discrepancy">
          {issues.length} unresolved discrepancies. Correct counts in this box;
          other boxes can continue.
        </p>
      )}
      {box.status === "OPEN" ? (
        <button
          className="primary"
          disabled={disabled || !lines.length || !!issues.length}
          onClick={() =>
            void act(
              () => operations.boxStatus(box.id, "CLOSED", box.version),
              "Box closed.",
            )
          }
        >
          Close {box.prefix}
          {box.box_number}
        </button>
      ) : (
        manager && (
          <button
            disabled={disabled}
            onClick={() =>
              void act(
                () => operations.boxStatus(box.id, "OPEN", box.version),
                "Box reopened. Readiness recalculated.",
              )
            }
          >
            Reopen for correction
          </button>
        )
      )}
    </div>
  );
}
