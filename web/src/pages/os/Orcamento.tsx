import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { brl, useStaffList } from "../../lib/data";
import { APPROVAL_METHODS, ITEM_KINDS, QUOTE_STATUS, type ApprovalMethod, type ItemKind, type Quote } from "../../lib/types";
import { SelectField, TextField } from "../../components/Field";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { isClosed, type OsBundle } from "./useOs";

const totals = (q: Quote) => {
  const items = q.quote_items ?? [];
  const approved = items.filter((i) => i.approved).reduce((s, i) => s + Number(i.total), 0);
  const all = items.reduce((s, i) => s + Number(i.total), 0);
  const base = q.status === "aprovado" ? approved : all;
  return { all, approved, total: Math.max(base - Number(q.discount_amount), 0) };
};

export function Orcamento({ b, staff, reload }: { b: OsBundle; staff: Record<string, string>; reload: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const closed = isClosed(b.os.status);
  const current = b.quotes[b.quotes.length - 1];
  const [busy, setBusy] = useState(false);

  async function newVersion() {
    setBusy(true);
    const { error } = await supabase.from("quotes").insert({ service_order_id: b.os.id, prepared_by: profile!.id, version: (current?.version ?? 0) + 1 });
    if (!error && ["em_diagnostico", "aguardando_diagnostico"].includes(b.os.status))
      await supabase.from("service_orders").update({ status: "aguardando_orcamento" }).eq("id", b.os.id);
    setBusy(false);
    if (error) toast("error", friendlyError(error)); else reload();
  }

  return (
    <div className="stack">
      {b.quotes.length === 0 && <p className="empty">Nenhum orçamento ainda.</p>}
      {[...b.quotes].reverse().map((q) => <QuoteCard key={q.id} q={q} b={b} staff={staff} reload={reload} editable={!closed && q.id === current?.id} />)}
      {!closed && (!current || ["aprovado", "recusado", "cancelado"].includes(current.status)) && (
        <button className="btn btn-primary" disabled={busy} onClick={newVersion}>{current ? "Criar nova versão do orçamento" : "Criar orçamento"}</button>
      )}
    </div>
  );
}

function QuoteCard({ q, b, staff, reload, editable }: { q: Quote; b: OsBundle; staff: Record<string, string>; reload: () => void; editable: boolean }) {
  const toast = useToast();
  const staffList = useStaffList();
  const st = QUOTE_STATUS[q.status];
  const draft = editable && q.status === "em_elaboracao";
  const t = totals(q);
  const [item, setItem] = useState({ kind: "servico" as ItemKind, description: "", quantity: "1", unit_price: "" });
  const [discount, setDiscount] = useState({ amount: String(q.discount_amount ?? 0), by: q.discount_authorized_by ?? "" });
  const [approve, setApprove] = useState<{ name: string; method: ApprovalMethod | ""; notes: string; items: Record<string, boolean> } | null>(null);
  const [refuse, setRefuse] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDiscount({ amount: String(q.discount_amount ?? 0), by: q.discount_authorized_by ?? "" }), [q.discount_amount, q.discount_authorized_by]);

  async function act(fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast("error", friendlyError(error)); return false; }
    toast("ok", ok); reload(); return true;
  }
  const price = Number(item.unit_price.replace(",", ".")), qty = Number(item.quantity.replace(",", "."));
  const itemValid = item.description.trim() && price >= 0 && item.unit_price !== "" && qty > 0;

  async function addItem() {
    const ok = await act(() => supabase.from("quote_items").insert({ quote_id: q.id, kind: item.kind, description: item.description.trim(),
      quantity: qty, unit_price: price, sort_order: (q.quote_items?.length ?? 0) + 1 }), "Item adicionado.");
    if (ok) setItem({ kind: item.kind, description: "", quantity: "1", unit_price: "" });
  }
  const discountNum = Number(discount.amount.replace(",", ".")) || 0;

  async function sendForApproval() {
    if (discountNum !== Number(q.discount_amount) || (discount.by || null) !== q.discount_authorized_by) {
      const r = await supabase.from("quotes").update({ discount_amount: discountNum, discount_authorized_by: discountNum > 0 ? discount.by || null : null }).eq("id", q.id);
      if (r.error) { toast("error", friendlyError(r.error)); return; }
    }
    const ok = await act(() => supabase.from("quotes").update({ status: "pendente_aprovacao" }).eq("id", q.id), "Orçamento enviado para aprovação.");
    if (ok) await supabase.from("service_orders").update({ status: "aguardando_aprovacao" }).eq("id", b.os.id).then(() => reload());
  }

  async function registerApproval() {
    if (!approve) return;
    setBusy(true);
    try {
      for (const it of q.quote_items ?? []) {
        if (approve.items[it.id] !== it.approved) {
          const r = await supabase.from("quote_items").update({ approved: approve.items[it.id] }).eq("id", it.id);
          if (r.error) throw r.error;
        }
      }
      const r = await supabase.from("quotes").update({ status: "aprovado", approved_by_name: approve.name.trim(),
        approval_method: approve.method, approval_notes: approve.notes.trim() || null }).eq("id", q.id);
      if (r.error) throw r.error;
      await supabase.from("service_orders").update({ status: "aguardando_execucao" }).eq("id", b.os.id);
      toast("ok", "Aprovação registrada."); setApprove(null); reload();
    } catch (e) { toast("error", friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <article className="panel">
      <header className="page-head-row">
        <h2 className="section-title">Orçamento versão {q.version}</h2>
        <span className={`badge badge-${st.tone}`}>{st.label}</span>
      </header>
      <p className="muted small">Elaborado em {formatDateTime(q.prepared_at)} por {staff[q.prepared_by] ?? "—"}</p>

      <div className="table-wrap table-static">
        <table className="table">
          <thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th>{q.status === "aprovado" && <th>Aprovado</th>}{draft && <th />}</tr></thead>
          <tbody>
            {(q.quote_items ?? []).map((i) => (
              <tr key={i.id} className={q.status === "aprovado" && !i.approved ? "row-off" : ""}>
                <td>{ITEM_KINDS.find((k) => k.value === i.kind)?.label}</td><td>{i.description}</td>
                <td>{Number(i.quantity).toLocaleString("pt-BR")}</td><td>{brl(Number(i.unit_price))}</td><td>{brl(Number(i.total))}</td>
                {q.status === "aprovado" && <td>{i.approved ? "Sim" : "Não"}</td>}
                {draft && <td><button className="btn btn-link" onClick={() => act(() => supabase.from("quote_items").delete().eq("id", i.id), "Item removido.")}>Remover</button></td>}
              </tr>
            ))}
            {(q.quote_items ?? []).length === 0 && <tr><td colSpan={6} className="muted">Nenhum item.</td></tr>}
          </tbody>
        </table>
      </div>

      <dl className="totals">
        <div><dt>Subtotal{q.status === "aprovado" ? " aprovado" : ""}</dt><dd>{brl(q.status === "aprovado" ? t.approved : t.all)}</dd></div>
        {Number(q.discount_amount) > 0 && <div><dt>Desconto{q.discount_authorized_by ? ` (autorizado por ${staff[q.discount_authorized_by] ?? "—"})` : ""}</dt><dd>− {brl(Number(q.discount_amount))}</dd></div>}
        <div className="totals-final"><dt>Total</dt><dd>{brl(t.total)}</dd></div>
      </dl>

      {q.status === "aprovado" && <p className="small">Aprovado por <strong>{q.approved_by_name}</strong> via {APPROVAL_METHODS.find((m) => m.value === q.approval_method)?.label} em {formatDateTime(q.approved_at)}, registrado por {staff[q.approved_registered_by ?? ""] ?? "—"}.{q.approval_notes ? ` ${q.approval_notes}` : ""}</p>}
      {q.status === "recusado" && <p className="small">Recusado em {formatDateTime(q.refused_at)}.{q.notes ? ` ${q.notes}` : ""}</p>}

      {draft && (
        <div className="form quote-add">
          <h3>Adicionar item</h3>
          <div className="quote-add-row">
            <SelectField label="Tipo" value={item.kind} onChange={(e) => setItem({ ...item, kind: e.target.value as ItemKind })}>
              {ITEM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </SelectField>
            <TextField label="Descrição" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
            <TextField label="Qtd." inputMode="decimal" value={item.quantity} onChange={(e) => setItem({ ...item, quantity: e.target.value.replace(/[^\d,.]/g, "") })} />
            <TextField label="Valor unitário (R$)" inputMode="decimal" value={item.unit_price} onChange={(e) => setItem({ ...item, unit_price: e.target.value.replace(/[^\d,.]/g, "") })} />
          </div>
          <button className="btn btn-secondary" disabled={!itemValid || busy} onClick={addItem}>Adicionar item</button>
          <div className="grid-2">
            <TextField label="Desconto (R$)" inputMode="decimal" value={discount.amount} onChange={(e) => setDiscount({ ...discount, amount: e.target.value.replace(/[^\d,.]/g, "") })} />
            {discountNum > 0 && (
              <SelectField label="Desconto autorizado por" value={discount.by} onChange={(e) => setDiscount({ ...discount, by: e.target.value })}>
                <option value="">Escolha</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </SelectField>
            )}
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || !(q.quote_items ?? []).length || (discountNum > 0 && !discount.by)} onClick={sendForApproval}>Enviar para aprovação</button>
          </div>
        </div>
      )}

      {editable && q.status === "pendente_aprovacao" && (
        <div className="form-actions">
          <button className="btn btn-danger-ghost" onClick={() => setRefuse(true)}>Registrar recusa</button>
          <button className="btn btn-primary" onClick={() => setApprove({ name: b.os.customers.full_name, method: "", notes: "",
            items: Object.fromEntries((q.quote_items ?? []).map((i) => [i.id, true])) })}>Registrar aprovação</button>
        </div>
      )}
      {editable && q.status === "pendente_aprovacao" && (
        <p className="muted small">A aprovação só vale com o nome de quem autorizou e a forma de confirmação. Serviços adicionais exigem nova versão.</p>
      )}

      <ConfirmDialog open={!!approve} title="Registrar aprovação" confirmLabel="Registrar aprovação" busy={busy}
        onClose={() => setApprove(null)} onConfirm={() => { if (approve?.name.trim() && approve.method) registerApproval(); else toast("error", "Informe quem autorizou e a forma de confirmação."); }}>
        {approve && (
          <div className="form">
            <TextField label="Quem autorizou" value={approve.name} onChange={(e) => setApprove({ ...approve, name: e.target.value })} required />
            <SelectField label="Forma de confirmação" value={approve.method} onChange={(e) => setApprove({ ...approve, method: e.target.value as ApprovalMethod })}>
              <option value="">Escolha</option>{APPROVAL_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </SelectField>
            <fieldset className="field"><legend className="legend">Itens aprovados</legend>
              {(q.quote_items ?? []).map((i) => (
                <label key={i.id} className="check"><input type="checkbox" checked={approve.items[i.id]}
                  onChange={(e) => setApprove({ ...approve, items: { ...approve.items, [i.id]: e.target.checked } })} /> {i.description} ({brl(Number(i.total))})</label>
              ))}
            </fieldset>
            <TextField label="Observação (opcional)" value={approve.notes} onChange={(e) => setApprove({ ...approve, notes: e.target.value })} />
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog open={refuse} title="Registrar recusa do orçamento?" confirmLabel="Registrar recusa" danger busy={busy}
        onClose={() => setRefuse(false)} onConfirm={async () => { if (await act(() => supabase.from("quotes").update({ status: "recusado" }).eq("id", q.id), "Recusa registrada.")) setRefuse(false); }}>
        <p>Os serviços deste orçamento não serão executados. Você poderá criar uma nova versão ou liberar o veículo.</p>
      </ConfirmDialog>
    </article>
  );
}
