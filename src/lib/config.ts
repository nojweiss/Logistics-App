const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
function clientKey(value: string | undefined) {
  if (!value || value.startsWith("sb_secret_")) return false;
  if (value.startsWith("sb_publishable_")) return true;
  try {
    return (
      JSON.parse(
        atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ).role === "anon"
    );
  } catch {
    return false;
  }
}
function validUrl(value: string | undefined) {
  try {
    return new URL(value || "").protocol === "https:";
  } catch {
    return false;
  }
}
export const config = {
  url: url || "",
  key: key || "",
  configured: validUrl(url) && clientKey(key),
  timezone: import.meta.env.VITE_WAREHOUSE_TIMEZONE || "America/Chicago",
};
export function warehouseDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
