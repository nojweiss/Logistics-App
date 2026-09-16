import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { config, warehouseDate } from "../../lib/config";
import { warehouse } from "../../services/warehouse";
import { useWarehouse } from "../../hooks/useWarehouse";
import { Badge, Feedback, SyncStatus, Timer } from "../../components/Status";
export function Today({ activeOnly = false }: { activeOnly?: boolean }) {
  const [today, setToday] = useState(warehouseDate);
  useEffect(() => {
    const update = () => setToday(warehouseDate());
    const interval = setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const load = useCallback(() => warehouse.orders(today), [today]);
  const state = useWarehouse(`today-${today}`, load);
  const orders = state.data;
  const active = orders?.find((order) => order.status === "ACTIVE");
  if (activeOnly && active)
    return <Navigate to={`/orders/${active.id}`} replace />;
  return (
    <>
      <SyncStatus {...state} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {new Intl.DateTimeFormat("en-US", {
              timeZone: config.timezone,
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(new Date())}
          </div>
          <h1>
            {activeOnly ? "On the floor" : "Today’s orders"}
            <span className="accent">.</span>
          </h1>
          <p>One team. Every row moving forward.</p>
        </div>
        <span className="warehouse-tag">⌂ &nbsp; Warehouse</span>
      </div>
      <Feedback {...state} />
      {!orders ? (
        <div className="empty" role="status">
          {state.loadError
            ? "Warehouse data is unavailable."
            : "Loading today’s orders…"}
        </div>
      ) : (
        <>
          <section className="summary-strip" aria-label="Today at a glance">
            <div>
              <strong>
                {String(
                  orders.filter((o) => o.scheduled_date === today).length,
                ).padStart(2, "0")}
              </strong>
              <span>Scheduled today</span>
            </div>
            <div>
              <strong>
                {String(
                  orders.filter(
                    (o) =>
                      o.status === "COMPLETE" && o.scheduled_date === today,
                  ).length,
                ).padStart(2, "0")}
              </strong>
              <span>Orders complete</span>
            </div>
            <div>
              <strong>09</strong>
              <span>Warehouse pick rows</span>
            </div>
          </section>
          {active ? (
            <Link className="active-card" to={`/orders/${active.id}`}>
              <div className="active-top">
                <span>● &nbsp; ON THE FLOOR</span>
                <span>ORDER {active.order_number}</span>
              </div>
              <h2>{active.stand_name}</h2>
              <p>
                {active.scheduled_date === today
                  ? "All hands on the active order."
                  : `Carried over from ${active.scheduled_date}.`}
              </p>
              <div className="active-bottom">
                <div>
                  <small>ORDER ELAPSED</small>
                  <Timer
                    start={active.started_at}
                    end={active.completed_at}
                    offset={state.offset}
                  />
                </div>
                <span className="round-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
            </Link>
          ) : (
            <div className="empty bordered">
              <h2>The floor is ready</h2>
              <p>
                No active order. A manager can open a planned order to begin.
              </p>
            </div>
          )}
          <div className="section-heading">
            <h2>Order queue</h2>
            <span>{today}</span>
          </div>
          <div className="order-list">
            {orders
              .filter((o) => o.scheduled_date === today)
              .map((order) => (
                <Link
                  className="order-card"
                  key={order.id}
                  to={`/orders/${order.id}`}
                >
                  <span className="order-symbol" aria-hidden="true">
                    ▣
                  </span>
                  <div className="order-name">
                    <small>ORDER {order.order_number}</small>
                    <h3>{order.stand_name}</h3>
                  </div>
                  <Badge status={order.status} />
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            {!orders.some((o) => o.scheduled_date === today) && (
              <div className="empty">
                <h3>No orders scheduled today</h3>
                <p>Add orders through the documented database setup.</p>
              </div>
            )}
          </div>
          <p className="fine-print">
            Shared warehouse data · {config.timezone.replaceAll("_", " ")}
          </p>
        </>
      )}
    </>
  );
}
