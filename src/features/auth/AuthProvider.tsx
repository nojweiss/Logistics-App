import { useEffect, useState, type ReactNode } from "react";
import { config } from "../../lib/config";
import { errorMessage } from "../../lib/metrics";
import { auth } from "../../services/auth";
import { AuthContext, type AuthState } from "./context";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    profile: null,
    loading: config.configured,
    signedIn: false,
    error: "",
  });
  useEffect(() => {
    if (!config.configured) return;
    let alive = true;
    let generation = 0;
    let loadedId: string | null = null;
    async function load(id: string | null) {
      if (!alive) return;
      const request = ++generation;
      if (id !== loadedId) {
        setState({ profile: null, loading: !!id, signedIn: !!id, error: "" });
        loadedId = id;
      }
      if (!id) {
        setState({ profile: null, loading: false, signedIn: false, error: "" });
        return;
      }
      try {
        const profile = await auth.profile(id);
        if (alive && request === generation)
          setState({ profile, loading: false, signedIn: true, error: "" });
      } catch (error) {
        if (alive && request === generation)
          setState({
            profile: null,
            loading: false,
            signedIn: true,
            error: errorMessage(error),
          });
      }
    }
    void auth
      .currentUser()
      .then(load)
      .catch((error) => {
        if (alive)
          setState({
            profile: null,
            loading: false,
            signedIn: false,
            error: errorMessage(error),
          });
      });
    const unsubscribe = auth.onChange((id) => void load(id));
    return () => {
      alive = false;
      generation++;
      unsubscribe();
    };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
