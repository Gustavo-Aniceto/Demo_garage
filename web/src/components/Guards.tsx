import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Splash({ text = "Carregando…" }: { text?: string }) {
  return <div className="splash" role="status"><div className="splash-mark" aria-hidden>IA</div><p>{text}</p></div>;
}

/** Exige login + perfil ativo + senha já trocada. A segurança real está no banco (RLS). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!session || !profile) return <Navigate to="/sistema/login" replace state={{ from: loc.pathname }} />;
  if (profile.must_change_password) return <Navigate to="/sistema/trocar-senha" replace />;
  return <>{children}</>;
}

export function RequireMaster({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role !== "master") return <Navigate to="/sistema" replace />;
  return <>{children}</>;
}
