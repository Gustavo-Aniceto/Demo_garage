import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { EXECUTION_STATUS, ITEM_KINDS, type ExecutionStatus, type ItemKind } from "../../lib/types";
import { SelectField, TextField } from "../../components/Field";
import { useToast } from "../../components/Toast";
import { isClosed, type OsBundle } from "./useOs";

export function Execucao({ b, staff, reload }: { b: OsBundle; staff: Record<string, string>; reload: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const closed = isClosed(b.os.status);
  const approved = b.quotes.find((q) => q.status === "aprovado");
  const [f, setF] = useState({ kind: "servico" as ItemKind, description: "", quantity: "1", status: "executado" as ExecutionStatus, notes: "" });
  const [busy, setBusy] = useState(false);
  const imported = new Set(b.services.map((s) => s.quote_item_id).filter(Boolean));
  const toImport = (approved?.quote_items ?? []).filter((i) => !imported.has(i.id));

  async function insert(rows: Record<string, unknown>[], ok: string) {
    setBusy(true);
    const { error } = await supabase.from("performed_services").insert(rows.map((r) => ({ service_order_id: b.os.id, performed_by: profile!.id, ...r })));
    setBusy(false);
    if (error) { toast("error", friendlyError(error)); return false; }
    toast("ok", ok); reload(); return true;
  }
  async function setStatus(id: string, status: ExecutionStatus) {
    const { error } = await supabase.from("performed_services").update({ status }).eq("id", id);
    if (error) toast("error", friendlyError(error)); else reload();
  }

  return (
    <div className="stack">
      {!approved && <p className="notice notice-warn">Nenhum orçamento aprovado. Serviços só devem ser executados após a autorização registrada na aba Orçamento.</p>}
      {approved && toImport.length > 0 && !closed && (
        <div className="notice">
          {toImport.length} item(ns) aprovado(s) ainda não lançado(s) na execução.
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => insert(toImport.map((i) => ({
            quote_item_id: i.id, kind: i.kind, description: i.description, quantity: i.quantity,
            status: i.approved ? "pendente" : "nao_executado", notes: i.approved ? null : "Recusado pelo cliente no orçamento",
          })), "Itens importados do orçamento.")}>Importar do orçamento</button>
        </div>
      )}

      {b.services.length === 0 ? <p className="empty">Nenhum serviço lançado.</p> : (
        <ul className="list">
          {b.services.map((s) => {
            const st = EXECUTION_STATUS.find((x) => x.value === s.status)!;
            return (
              <li key={s.id} className="list-row list-row-static">
                <div className="list-grow">
                  <p className="list-title">{s.description} <span className="muted small">({ITEM_KINDS.find((k) => k.value === s.kind)?.label}, qtd. {Number(s.quantity).toLocaleString("pt-BR")})</span></p>
                  <p className="muted small">{formatDateTime(s.performed_at)}{s.performed_by ? `, ${staff[s.performed_by] ?? ""}` : ""}{s.notes ? `. ${s.notes}` : ""}</p>
                </div>
                {closed ? <span className={`badge badge-${st.tone}`}>{st.label}</span> : (
                  <select aria-label={`Situação de ${s.description}`} value={s.status} onChange={(e) => setStatus(s.id, e.target.value as ExecutionStatus)} className="inline-select">
                    {EXECUTION_STATUS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!closed && (
        <section className="panel form">
          <h2 className="section-title">Lançar serviço ou peça</h2>
          <div className="quote-add-row">
            <SelectField label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ItemKind })}>
              {ITEM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </SelectField>
            <TextField label="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <TextField label="Qtd." inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value.replace(/[^\d,.]/g, "") })} />
            <SelectField label="Situação" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ExecutionStatus })}>
              {EXECUTION_STATUS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </SelectField>
          </div>
          <TextField label="Observação" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || !f.description.trim() || !(Number(f.quantity.replace(",", ".")) > 0)}
              onClick={async () => { if (await insert([{ kind: f.kind, description: f.description.trim(), quantity: Number(f.quantity.replace(",", ".")), status: f.status, notes: f.notes.trim() || null }], "Lançamento registrado.")) setF({ ...f, description: "", quantity: "1", notes: "" }); }}>
              Registrar
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
