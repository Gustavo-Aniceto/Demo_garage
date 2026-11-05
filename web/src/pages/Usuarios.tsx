import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { functionError } from "../lib/errors";
import { formatDateTime, generateTempPassword, passwordChecks } from "../lib/format";
import type { ManagedUser } from "../lib/types";
import { TextField } from "../components/Field";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";

type Action =
  | { kind: "toggle"; user: ManagedUser }
  | { kind: "reset"; user: ManagedUser; password: string }
  | { kind: "revoke"; user: ManagedUser };

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) throw new Error(await functionError(error));
  return data;
}

export function Usuarios() {
  const { profile } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownPassword, setShownPassword] = useState<{ login: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try { setUsers((await call({ action: "list" })).users); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runAction() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "toggle") {
        await call({ action: "set_active", user_id: action.user.id, active: !action.user.active });
        toast("ok", action.user.active ? "Conta desativada e sessões encerradas." : "Conta reativada.");
      } else if (action.kind === "reset") {
        await call({ action: "reset_password", user_id: action.user.id, temp_password: action.password });
        setShownPassword({ login: action.user.login, password: action.password });
      } else {
        await call({ action: "revoke_sessions", user_id: action.user.id });
        toast("ok", "Sessões encerradas. O usuário precisará entrar de novo.");
      }
      setAction(null);
      await load();
    } catch (e) { toast("error", (e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleCheckout(u: ManagedUser) {
    try {
      await call({ action: "update", user_id: u.id, can_checkout: !u.can_checkout });
      toast("ok", "Permissão atualizada.");
      await load();
    } catch (e) { toast("error", (e as Error).message); }
  }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <h1>Gestão de usuários</h1>
        <div className="form-actions">
          <a className="btn btn-secondary" href="/sistema/fotos">Fotos exigidas</a>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>Novo usuário</button>
        </div>
      </header>

      {shownPassword && (
        <div className="notice notice-key" role="alert">
          <p>Senha temporária de <strong>{shownPassword.login}</strong>. Ela aparece só agora: entregue pessoalmente.</p>
          <code className="secret">{shownPassword.password}</code>
          <div className="form-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(shownPassword.password).then(() => toast("ok", "Copiada."))}>Copiar</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShownPassword(null)}>Já anotei</button>
          </div>
        </div>
      )}

      {creating && (
        <NovoUsuario
          onCancel={() => setCreating(false)}
          onCreated={async (login, password) => { setCreating(false); setShownPassword({ login, password }); await load(); }}
        />
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {!users && !error && <p className="muted">Carregando…</p>}

      {users && (
        <div className="table-wrap">
          <table className="table table-users">
            <thead>
              <tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th><th>Criado / último acesso</th><th>Check-out</th><th><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMaster = u.role === "master";
                return (
                  <tr key={u.id}>
                    <td data-label="Nome"><span className="cell-stack">{u.full_name}{u.id === profile?.id && <span className="muted"> (você)</span>}</span></td>
                    <td data-label="Login" className="nowrap">{u.login}</td>
                    <td data-label="Perfil">{isMaster ? "Master" : "Mecânico"}</td>
                    <td data-label="Situação">
                      <span className="cell-stack">
                        <span className={`badge ${u.active ? "badge-ready" : "badge-stop"}`}>{u.active ? "Ativa" : "Desativada"}</span>
                        {u.must_change_password && u.active && <span className="badge badge-wait">Senha temporária</span>}
                      </span>
                    </td>
                    <td data-label="Criado / último acesso" className="nowrap">
                      <span className="cell-stack">{formatDateTime(u.created_at)}<br /><span className="muted small">{u.last_access_at ? formatDateTime(u.last_access_at) : "Nunca acessou"}</span></span>
                    </td>
                    <td data-label="Check-out">
                      {isMaster ? <span>Sim</span> : (
                        <label className="check">
                          <input type="checkbox" checked={u.can_checkout} onChange={() => toggleCheckout(u)} />
                          {u.can_checkout ? "Autorizado" : "Não autorizado"}
                        </label>
                      )}
                    </td>
                    <td className="row-actions">
                      {isMaster ? <span className="muted small">Conta protegida</span> : (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => setAction({ kind: "reset", user: u, password: generateTempPassword() })}>Redefinir senha</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setAction({ kind: "revoke", user: u })}>Encerrar sessões</button>
                          <button className={`btn btn-sm ${u.active ? "btn-danger-ghost" : "btn-secondary"}`} onClick={() => setAction({ kind: "toggle", user: u })}>
                            {u.active ? "Desativar" : "Reativar"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!action}
        busy={busy}
        danger={action?.kind === "toggle" && action.user.active}
        title={
          action?.kind === "toggle" ? (action.user.active ? `Desativar ${action.user.full_name}?` : `Reativar ${action.user.full_name}?`)
          : action?.kind === "reset" ? `Redefinir a senha de ${action.user.full_name}?`
          : action ? `Encerrar as sessões de ${action.user.full_name}?` : ""
        }
        confirmLabel={action?.kind === "toggle" ? (action.user.active ? "Desativar" : "Reativar") : action?.kind === "reset" ? "Redefinir senha" : "Encerrar sessões"}
        onConfirm={runAction}
        onClose={() => setAction(null)}
      >
        {action?.kind === "toggle" && action.user.active && <p>O acesso é bloqueado na hora e todas as sessões abertas são encerradas. O histórico de atendimentos dele é mantido.</p>}
        {action?.kind === "reset" && <p>Uma senha temporária será gerada e exibida uma única vez. No próximo acesso, o usuário terá de criar uma senha própria. As sessões abertas serão encerradas.</p>}
        {action?.kind === "revoke" && <p>O usuário será desconectado de todos os aparelhos. A conta continua ativa.</p>}
      </ConfirmDialog>
    </div>
  );
}

function NovoUsuario({ onCancel, onCreated }: { onCancel: () => void; onCreated: (login: string, password: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", login: "", password: generateTempPassword(), can_checkout: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginOk = /^[A-Za-z0-9._-]{3,40}$/.test(form.login);
  const pwOk = passwordChecks(form.password).every((c) => c.ok);
  const valid = form.full_name.trim().length >= 3 && loginOk && pwOk;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      await call({ action: "create", full_name: form.full_name, login: form.login, role: "mecanico",
                   temp_password: form.password, can_checkout: form.can_checkout, active: true });
      toast("ok", "Usuário criado.");
      onCreated(form.login, form.password);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form className="panel form" onSubmit={submit} noValidate>
      <h2 className="section-title">Novo usuário (mecânico)</h2>
      <div className="grid-2">
        <TextField label="Nome completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoFocus />
        <TextField label="Login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value.trim() })} required
          autoCapitalize="none" spellCheck={false} hint="3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado."
          error={form.login && !loginOk ? "Login inválido." : null} />
      </div>
      <TextField label="Senha temporária" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
        required spellCheck={false} autoComplete="off"
        hint={<>O usuário troca no primeiro acesso. <button type="button" className="btn btn-link" onClick={() => setForm({ ...form, password: generateTempPassword() })}>Gerar outra</button></>}
        error={!pwOk ? "Mínimo 10 caracteres, com maiúscula, minúscula, número e símbolo." : null} />
      <label className="check"><input type="checkbox" checked={form.can_checkout} onChange={(e) => setForm({ ...form, can_checkout: e.target.checked })} /> Autorizado a fazer check-out (liberar veículos)</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" disabled={!valid || busy}>{busy ? "Criando…" : "Criar usuário"}</button>
      </div>
    </form>
  );
}
