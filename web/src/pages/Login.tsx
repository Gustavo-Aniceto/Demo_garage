import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { TextField } from "../components/Field";
import { OFICINA } from "../lib/oficina";

export function Login() {
  const { session, profile, signIn } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/sistema";

  if (session && profile) return <Navigate to={profile.must_change_password ? "/sistema/trocar-senha" : from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(login, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark brand-mark-lg" aria-hidden>IA</span>
          <div>
            <h1>{OFICINA.nome}</h1>
            <p>Sistema da oficina</p>
          </div>
        </div>
        <form onSubmit={submit} noValidate>
          <TextField label="Login" value={login} onChange={(e) => setLogin(e.target.value)}
            autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
          <TextField label="Senha" type={show ? "text" : "password"} value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senha</label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !login || !password}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="auth-foot">Esqueceu a senha? Peça a redefinição ao administrador da oficina.</p>
      </div>
    </div>
  );
}
