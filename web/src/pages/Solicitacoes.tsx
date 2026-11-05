import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { formatDateTime, formatPlate } from "../lib/format";
import { CONTACT_STATUS, type ContactRequest, type ContactStatus } from "../lib/types";
import { useToast } from "../components/Toast";
import { OFICINA, whatsappLink } from "../lib/oficina";

const TYPE = { orcamento: "Orçamento", agendamento: "Agendamento", contato: "Dúvida" } as const;

export function Solicitacoes() {
  const { profile } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<ContactStatus | "">("novo");
  const [rows, setRows] = useState<ContactRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    let q = supabase.from("contact_requests").select("*").order("created_at", { ascending: false }).limit(100);
    if (status) q = q.eq("status", status);
    const { data, error: e } = await q;
    if (e) { setError(friendlyError(e)); return; }
    setRows(data as ContactRequest[]);
  }
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(r: ContactRequest, patch: Partial<ContactRequest>) {
    const { error: e } = await supabase.from("contact_requests").update({ ...patch, handled_by: profile!.id }).eq("id", r.id);
    if (e) toast("error", friendlyError(e)); else { toast("ok", "Solicitação atualizada."); load(); }
  }

  return (
    <div className="page">
      <header className="page-head"><h1>Solicitações do site</h1><p className="muted">Pedidos de orçamento e agendamento enviados pelo site. Nenhum horário é confirmado automaticamente.</p></header>
      <div className="filters"><div className="field"><label htmlFor="f-cs">Situação</label>
        <select id="f-cs" value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)}>
          <option value="">Todas</option>{(Object.keys(CONTACT_STATUS) as ContactStatus[]).map((s) => <option key={s} value={s}>{CONTACT_STATUS[s].label}</option>)}
        </select></div></div>
      {error && <p className="form-error">{error}</p>}
      {rows?.length === 0 && <p className="empty">Nenhuma solicitação {status ? `com situação "${CONTACT_STATUS[status].label}"` : ""}.</p>}
      <ul className="req-list">
        {rows?.map((r) => (
          <li key={r.id} className="panel">
            <header className="page-head-row">
              <h2 className="section-title">{r.name} <span className="muted small">{TYPE[r.request_type]}</span></h2>
              <span className={`badge badge-${CONTACT_STATUS[r.status].tone}`}>{CONTACT_STATUS[r.status].label}</span>
            </header>
            <p className="muted small">Recebido em {formatDateTime(r.created_at)}</p>
            <dl className="facts facts-plain">
              <div><dt>Telefone</dt><dd>{r.phone} <a className="wa" href={whatsappLink(`Olá, ${r.name.split(" ")[0]}! Aqui é da ${OFICINA.nome}, sobre o seu pedido pelo site.`).replace(/wa\.me\/\d+/, `wa.me/55${r.phone.replace(/\D/g, "")}`)} target="_blank" rel="noopener noreferrer">WhatsApp</a></dd></div>
              {r.plate && <div><dt>Placa</dt><dd><span className="plate-chip">{formatPlate(r.plate)}</span></dd></div>}
              {r.brand_model && <div><dt>Veículo</dt><dd>{r.brand_model}</dd></div>}
              {r.service && <div><dt>Serviço</dt><dd>{r.service}</dd></div>}
              {r.preferred_period && <div><dt>Preferência</dt><dd>{r.preferred_period}</dd></div>}
              {r.description && <div className="facts-wide"><dt>Descrição</dt><dd>{r.description}</dd></div>}
            </dl>
            <div className="req-actions">
              <div className="field"><label htmlFor={`st-${r.id}`}>Situação</label>
                <select id={`st-${r.id}`} value={r.status} onChange={(e) => update(r, { status: e.target.value as ContactStatus })}>
                  {(Object.keys(CONTACT_STATUS) as ContactStatus[]).map((s) => <option key={s} value={s}>{CONTACT_STATUS[s].label}</option>)}
                </select></div>
              <div className="field req-notes"><label htmlFor={`nt-${r.id}`}>Anotação interna</label>
                <input id={`nt-${r.id}`} value={notes[r.id] ?? r.internal_notes ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} /></div>
              <button className="btn btn-secondary" disabled={(notes[r.id] ?? r.internal_notes ?? "") === (r.internal_notes ?? "")}
                onClick={() => update(r, { internal_notes: (notes[r.id] ?? "").trim() || null })}>Salvar anotação</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
