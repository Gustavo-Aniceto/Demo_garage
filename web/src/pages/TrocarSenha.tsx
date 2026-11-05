import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { functionError } from "../lib/errors";
import { passwordChecks } from "../lib/format";
import { TextField } from "../components/Field";
import { Splash } from "../components/Guards";
import { useToast } from "../components/Toast";

export function TrocarSenha() {
  const { loading, session, profile, refreshProfile, signOut } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  if (loading) return <Splash />;
  if (!session || !profile) return <Navigate to="/sistema/login" replace />;

  const checks = passwordChecks(next);
  const valid = checks.every((c) => c.ok) && next === confirm && next !== current && current.length > 0;
  const forced = profile.must_change_password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    const { error: err } = await supabase.functions.invoke("change-password", {
      body: { current_password: current, new_password: next },
    });
    if (err) { setError(await functionError(err)); setBusy(false); return; }
    await refreshProfile();
    toast("ok", "Senha alterada.");
    navigate("/sistema", { replace: true });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{forced ? "Crie sua senha" : "Alterar senha"}</h1>
        <p className="muted">
          {forced
            ? `Olá, ${profile.full_name.split(" ")[0]}. Antes de usar o sistema, troque a senha temporária por uma senha só sua.`
            : "Informe a senha atual e a nova senha."}
        </p>
        <form onSubmit={submit} noValidate>
          <TextField label={forced ? "Senha temporária" : "Senha atual"} type="password" value={current}
            onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          <TextField label="Nova senha" type="password" value={next} onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password" required />
          <ul className="pw-checks" aria-label="Requisitos da senha">
            {checks.map((c) => <li key={c.label} className={c.ok ? "ok" : ""}>{c.label}</li>)}
            <li className={next && next !== current ? "ok" : ""}>Diferente da senha atual</li>
          </ul>
          <TextField label="Repita a nova senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password" required error={confirm && confirm !== next ? "As senhas não conferem." : null} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={!valid || busy}>
            {busy ? "Salvando…" : "Salvar nova senha"}
          </button>
        </form>
        <button className="btn btn-link" onClick={async () => { await signOut(); navigate("/sistema/login"); }}>Sair</button>
      </div>
    </div>
  );
}
