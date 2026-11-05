import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import type { AuditRow } from "../lib/types";

const PAGE = 50;
const ACTIONS: Record<string, string> = {
  login: "Entrou no sistema", logout: "Saiu do sistema", insert: "Criou registro", update: "Alterou registro", delete: "Excluiu registro",
  "usuario.criado": "Criou usuário", "usuario.editado": "Editou usuário", "usuario.ativado": "Reativou usuário",
  "usuario.desativado": "Desativou usuário", "usuario.senha_redefinida": "Redefiniu senha", "usuario.sessoes_revogadas": "Encerrou sessões",
  "senha.trocada": "Trocou a própria senha", "senha.troca": "Tentou trocar a senha", "master.provisionado": "MasterAdm criado",
  "master.recuperacao": "Recuperação do MasterAdm",
};
const ENTITIES: Record<string, string> = {
  profiles: "Usuários", customers: "Clientes", vehicles: "Veículos", service_orders: "Ordens de serviço", quotes: "Orçamentos",
  quote_items: "Itens de orçamento", checkouts: "Check-outs", checkin_inspections: "Check-ins", diagnostics: "Diagnósticos",
  performed_services: "Serviços executados", vehicle_photos: "Fotos", auth: "Acesso", photo_categories: "Categorias de foto",
};

export function Auditoria() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    supabase.rpc("staff_directory").then(({ data }) =>
      setNames(Object.fromEntries(((data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]))));
  }, []);

  useEffect(() => {
    let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE);
    if (result) q = q.eq("result", result);
    if (entity) q = q.eq("entity", entity);
    q.then(({ data, error: err }) => {
      if (err) { setError(friendlyError(err)); return; }
      const list = data as AuditRow[];
      setHasMore(list.length > PAGE);
      setRows(list.slice(0, PAGE));
      setError(null);
    });
  }, [page, result, entity]);

  const entityOptions = useMemo(() => Object.entries(ENTITIES), []);

  return (
    <div className="page">
      <header className="page-head"><h1>Auditoria</h1><p className="muted">Registro somente-leitura de acessos e alterações. Ninguém pode editar ou apagar estas linhas.</p></header>
      <div className="filters">
        <div className="field">
          <label htmlFor="f-res">Resultado</label>
          <select id="f-res" value={result} onChange={(e) => { setResult(e.target.value); setPage(0); }}>
            <option value="">Todos</option><option value="sucesso">Sucesso</option><option value="negado">Negado</option><option value="erro">Erro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-ent">Área</label>
          <select id="f-ent" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }}>
            <option value="">Todas</option>
            {entityOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {rows.length === 0 && !error && <p className="empty">Nenhum registro para este filtro.</p>}
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className="audit-row">
            <button className="audit-head" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span className={`badge ${r.result === "sucesso" ? "badge-done" : "badge-stop"}`}>{r.result === "sucesso" ? "Sucesso" : r.result === "negado" ? "Negado" : "Erro"}</span>
              <span className="audit-what">{ACTIONS[r.action] ?? r.action}{r.entity ? `: ${ENTITIES[r.entity] ?? r.entity}` : ""}</span>
              <span className="muted small">{r.actor_id ? names[r.actor_id] ?? "Usuário removido" : "Sistema"}, {formatDateTime(r.created_at)}</span>
            </button>
            {open === r.id && <pre className="audit-details">{JSON.stringify(r.details, null, 2)}</pre>}
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Mais recentes</button>
        <button className="btn btn-secondary" disabled={!hasMore} onClick={() => setPage(page + 1)}>Mais antigos</button>
      </div>
    </div>
  );
}
