import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/context";
import { auth } from "../services/auth";
import { errorMessage } from "../lib/metrics";
export function Shell() {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const operational = pathname.startsWith("/orders/");
  const overview =
    profile?.role !== "PICK_LEAD" && pathname.split("/").length > 3;
  const backTo = overview ? `/orders/${pathname.split("/")[2]}` : "/";
  const [error, setError] = useState("");
  return (
    <>
      <header className="topbar">
        {operational ? (
          <Link to={backTo} className="back">
            ← {overview ? "Order overview" : "Today’s orders"}
          </Link>
        ) : (
          <Link to="/" className="brand">
            <span className="brand-mark">▥</span>
            <b>FLOOR</b>
            <span>WAREHOUSE OPERATIONS</span>
          </Link>
        )}
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
        <NavLink to="/staffing">Team</NavLink>
        {profile?.role !== "PICK_LEAD" && (
          <NavLink to="/inventory">Inventory</NavLink>
        )}
        {profile?.role === "ADMIN" && (
          <NavLink to="/products">Products</NavLink>
        )}
      </nav>
    </>
  );
}
