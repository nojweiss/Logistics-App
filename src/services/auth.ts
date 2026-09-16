import { db } from "../lib/supabase";
import type { Profile } from "../lib/types";
export const auth = {
  async currentUser() {
    const { data, error } = await db().auth.getSession();
    if (error) throw error;
    return data.session?.user.id ?? null;
  },
  onChange(callback: (id: string | null) => void) {
    const { data } = db().auth.onAuthStateChange((_event, session) => {
      // Do not perform async Supabase calls inside the Auth callback.
      setTimeout(() => callback(session?.user.id ?? null), 0);
    });
    return () => data.subscription.unsubscribe();
  },
  async profile(id: string) {
    const { data, error } = await db()
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();
    if (error)
      throw new Error(
        "No warehouse profile found. Ask your administrator to provision this account.",
      );
    const profile = data as Profile;
    if (!profile.active)
      throw new Error("This account is inactive. Contact your administrator.");
    return profile;
  },
  async signIn(email: string, password: string) {
    const { error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signOut() {
    const { error } = await db().auth.signOut();
    if (error) throw error;
  },
};
