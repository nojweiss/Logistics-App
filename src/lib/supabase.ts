import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
const boundedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 15000);
  if (init?.signal?.aborted) abort();
  init?.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abort);
  }
};
const instance = config.configured
  ? createClient(config.url, config.key, {
      global: { fetch: boundedFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
export function db() {
  if (!instance) throw new Error("Supabase is not configured. See README.md.");
  return instance;
}
