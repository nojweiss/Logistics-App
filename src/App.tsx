import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { Login } from "./features/auth/Login";
import { Protected } from "./features/auth/Protected";
import { Shell } from "./components/Shell";
import { Today } from "./features/orders/Today";
import { OrderScreen } from "./features/orders/OrderScreen";
import { lazy, Suspense } from "react";
const Products = lazy(() =>
  import("./features/admin/Products").then((m) => ({ default: m.Products })),
);
const Staffing = lazy(() =>
  import("./features/staffing/Staffing").then((m) => ({ default: m.Staffing })),
);
const Inventory = lazy(() =>
  import("./features/inventory/Inventory").then((m) => ({
    default: m.Inventory,
  })),
);
import "./App.css";
export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Suspense fallback={<div className="empty">Loading screen…</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <Protected>
                  <Shell />
                </Protected>
              }
            >
              <Route index element={<Today />} />
              <Route path="/products" element={<Products />} />
              <Route path="/staffing" element={<Staffing />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route
                path="/orders/:id/repack/:groupId"
                element={<OrderScreen task="REPACK" />}
              />
              <Route
                path="/orders/:id/full-cases/:groupId"
                element={<OrderScreen task="FULL_CASE" />}
              />
              <Route path="/active" element={<Today activeOnly />} />
              <Route path="/orders/:id" element={<OrderScreen />} />
              <Route path="/orders/:id/rows/:rowId" element={<OrderScreen />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </HashRouter>
  );
}
