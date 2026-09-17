import type { RealtimeScope } from "../lib/realtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/metrics";
import { warehouse } from "../services/warehouse";
interface Snapshot<T> {
  key: string;
  data: T;
  checked: Date;
  offset: number;
}
export function useWarehouse<T>(
  key: string,
  loader: () => Promise<T>,
  orderId?: string,
  scope: RealtimeScope = orderId ? "order" : "orders",
) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const actionPending = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [data, offset] = await Promise.all([
        loader(),
        warehouse.clockOffset(),
      ]);
      if (request === sequence.current) {
        setSnapshot({ key, data, checked: new Date(), offset });
        setLoadError("");
        setActionError("");
      }
    } catch (cause) {
      if (request === sequence.current) setLoadError(errorMessage(cause));
    }
  }, [key, loader]);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const unsubscribe = warehouse.subscribe(
      orderId,
      () => void refresh(),
      setLive,
      scope,
    );
    const resume = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && document.visibilityState === "visible")
        void refresh();
    };
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    const poll = setInterval(resume, 30000);
    return () => {
      invalidate();
      window.clearTimeout(initial);
      unsubscribe();
      clearInterval(poll);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh, orderId, invalidate, scope]);
  async function act(action: () => Promise<void>, success: string) {
    if (actionPending.current || !online) return;
    actionPending.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await refresh();
    } catch (cause) {
      setActionError(
        `${errorMessage(cause)} The result may be uncertain. Refresh server data before retrying.`,
      );
    } finally {
      setBusy(false);
      actionPending.current = false;
    }
  }
  const current = snapshot?.key === key ? snapshot : null;
  return {
    data: current?.data ?? null,
    offset: current?.offset ?? 0,
    checked: current?.checked ?? null,
    loadError,
    actionError,
    online,
    live,
    busy,
    notice,
    blocked: busy || !online || !!loadError || !!actionError || !current,
    refresh,
    act,
  };
}
