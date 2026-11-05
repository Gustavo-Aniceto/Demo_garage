import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { loginToEmail, supabase } from "./supabase";
import type { MyProfile } from "./types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: MyProfile | null;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<MyProfile | null>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) throw error;
  return (data as MyProfile[] | null)?.[0] ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    // Callback síncrono: chamadas ao Supabase ficam no efeito abaixo (evita travamento do SDK).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    let alive = true;
    if (!userId) { setProfile(null); return; }
    setLoading(true);
    fetchProfile()
      .then(async (p) => {
        if (!alive) return;
        if (!p || !p.active) { await supabase.auth.signOut(); setProfile(null); return; }
        setProfile(p);
      })
      .catch(() => alive && setProfile(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [userId]);

  const signIn = useCallback(async (login: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginToEmail(login), password });
    if (error) throw error;
    const { error: evErr } = await supabase.rpc("register_session_event", { p_event: "login" });
    if (evErr) { await supabase.auth.signOut(); throw evErr; }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.rpc("register_session_event", { p_event: "logout" }).then(() => undefined, () => undefined);
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    const p = await fetchProfile();
    setProfile(p);
    return p;
  }, []);

  const value = useMemo(
    () => ({ loading, session, profile, signIn, signOut, refreshProfile }),
    [loading, session, profile, signIn, signOut, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
