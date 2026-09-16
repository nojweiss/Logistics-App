import { useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "../../services/auth";
import { errorMessage } from "../../lib/metrics";
import { useAuth } from "./context";
export function Protected({ children }: { children: ReactNode }) {
  const state = useAuth();
  const [error, setError] = useState("");
  if (state.loading)
    return (
      <div className="empty" role="status">
        Loading your workspace…
      </div>
    );
  if (!state.profile) {
    if (!state.signedIn) return <Navigate to="/login" replace />;
    return (
      <div className="empty">
        <h1>Account needs attention</h1>
        <p role="alert">{error || state.error}</p>
        <button
          onClick={() =>
            void auth.signOut().catch((e) => setError(errorMessage(e)))
          }
        >
          Sign out
        </button>
      </div>
    );
  }
  return children;
}
