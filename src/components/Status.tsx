import { useEffect, useState } from "react";
import { duration } from "../lib/metrics";
export function Timer({
  start,
  end,
  offset = 0,
}: {
  start: string | null;
  end: string | null;
  offset?: number;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return <span className="timer">{duration(start, end, now + offset)}</span>;
}
export function Badge({
  status,
}: {
  status: "PLANNED" | "ACTIVE" | "COMPLETE";
}) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {status === "ACTIVE"
        ? "In progress"
        : status === "COMPLETE"
          ? "Complete"
          : "Not started"}
    </span>
  );
}
export function SyncStatus({
  online,
  live,
  checked,
  loadError,
}: {
  online: boolean;
  live: boolean;
  checked: Date | null;
  loadError: string;
}) {
  return (
    <div
      className={`sync ${!online || loadError ? "offline" : ""}`}
      role="status"
    >
      <span>
        <i />
        {!online
          ? "OFFLINE · actions unavailable"
          : loadError
            ? "OFFLINE / DATA UNAVAILABLE · refresh required"
            : live
              ? "Live updates connected"
              : "Reconnecting · checking every 30s"}
      </span>
      {checked && (
        <small>
          Last checked{" "}
          {checked.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </small>
      )}
    </div>
  );
}
export function Feedback({
  loadError,
  actionError,
  notice,
  refresh,
}: {
  loadError: string;
  actionError: string;
  notice: string;
  refresh: () => Promise<void>;
}) {
  return (
    <>
      {(loadError || actionError) && (
        <div className="error" role="alert">
          {loadError || actionError}
          <button onClick={() => void refresh()}>Refresh data</button>
        </div>
      )}
      {notice && !loadError && !actionError && (
        <p className="save-notice" role="status">
          ✓ {notice}
        </p>
      )}
    </>
  );
}
