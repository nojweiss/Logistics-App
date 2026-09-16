import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { Login } from "./features/auth/Login";
import { Protected } from "./features/auth/Protected";
import { Shell } from "./components/Shell";
import { Today } from "./features/orders/Today";
import { OrderScreen } from "./features/orders/OrderScreen";
import "./App.css";
export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
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
            <Route path="/active" element={<Today activeOnly />} />
            <Route path="/orders/:id" element={<OrderScreen />} />
            <Route path="/orders/:id/rows/:rowId" element={<OrderScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
