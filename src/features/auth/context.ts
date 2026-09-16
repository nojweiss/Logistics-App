import { createContext, useContext } from "react";
import type { Profile } from "../../lib/types";
export interface AuthState {
  profile: Profile | null;
  loading: boolean;
  signedIn: boolean;
  error: string;
}
export const AuthContext = createContext<AuthState>({
  profile: null,
  loading: true,
  signedIn: false,
  error: "",
});
export const useAuth = () => useContext(AuthContext);
