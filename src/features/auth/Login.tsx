import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { config } from "../../lib/config";
import { errorMessage } from "../../lib/metrics";
import { auth } from "../../services/auth";
import { useAuth } from "./context";
export function Login() {
  const { profile, error: sessionError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (profile) return <Navigate to="/" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await auth.signIn(
        String(data.get("email")),
        String(data.get("password")),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="brand">
        ▥ <b>FLOOR</b>
        <span>WAREHOUSE OPERATIONS</span>
      </div>
      <section className="login-panel">
        <div className="eyebrow">READY FOR THE DAY</div>
        <h1>
          Good work starts
          <br />
          on the floor.
        </h1>
        <p>Sign in to your warehouse workspace.</p>
        {!config.configured ? (
          <div className="notice">
            <strong>Connect your warehouse</strong>
            <p>
              Add your Supabase URL and publishable key to{" "}
              <code>.env.local</code>, then restart Vite. Follow the setup steps
              in README.md.
            </p>
            <small>Warehouse data lives in Supabase.</small>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {(error || sessionError) && (
              <p className="error" role="alert">
                {error || sessionError}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>
          </form>
        )}
        <p className="fine-print">
          Your warehouse administrator provides access.
        </p>
      </section>
      <div className="login-footer">NINE ROWS. ONE TEAM.</div>
    </div>
  );
}
