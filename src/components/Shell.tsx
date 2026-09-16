import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/context";
import { auth } from "../services/auth";
import { errorMessage } from "../lib/metrics";
export function Shell() {
  const { profile } = useAuth();
  const [error, setError] = useState("");
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">▥</span>
          <b>FLOOR</b>
          <span>WAREHOUSE OPERATIONS</span>
        </Link>
        <div className="account">
          <div>
            {profile?.display_name}
            <small>{profile?.role.replaceAll("_", " ")}</small>
          </div>
          <button
            aria-label="Sign out"
            onClick={() =>
              void auth
                .signOut()
                .catch((cause) => setError(errorMessage(cause)))
            }
          >
            ↪
          </button>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <main>
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        <NavLink to="/" end>
          <span aria-hidden="true">▤</span>Today
        </NavLink>
        <NavLink to="/active">
          <span aria-hidden="true">▦</span>
          {profile?.role === "PICK_LEAD" ? "My pick row" : "Active floor"}
        </NavLink>
      </nav>
    </>
  );
}
