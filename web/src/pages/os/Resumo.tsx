import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { FUEL_LEVELS, INSPECTION_ITEMS, INSPECTION_RESULTS, MANUAL_STATUSES, OS_STATUS, type OsStatus } from "../../lib/types";
import { useToast } from "../../components/Toast";
import { isClosed, type OsBundle } from "./useOs";

export function Resumo({ b, staff, reload }: { b: OsBundle; staff: Record<string, string>; reload: () => void }) {
  const ins = b.inspection;
  const items = ins?.checkin_inspection_items ?? [];
  const damaged = items.filter((i) => i.result === "com_avaria");
  return (
    <div className="stack">
      {!isClosed(b.os.status) && b.os.checkin_completed_at && <StatusChanger b={b} reload={reload} />}
      <section className="panel">
        <h2 className="section-title">Entrada</h2>
        {!ins ? <p className="muted">Inspeção de entrada não registrada.</p> : (
          <dl className="facts facts-plain">
            <div><dt>Entrada</dt><dd>{formatDateTime(ins.entered_at)}</dd></div>
            <div><dt>Quilometragem</dt><dd>{ins.km_in.toLocaleString("pt-BR")} km</dd></div>
            <div><dt>Combustível</dt><dd>{FUEL_LEVELS.find((f) => f.value === ins.fuel_level)?.label ?? "Não verificado"}</dd></div>
            <div><dt>Responsável</dt><dd>{staff[ins.responsible_id] ?? "—"}</dd></div>
            {ins.visit_reason && <div className="facts-wide"><dt>Motivo da visita</dt><dd>{ins.visit_reason}</dd></div>}
            {ins.customer_complaint && <div className="facts-wide"><dt>Relato do cliente</dt><dd>{ins.customer_complaint}</dd></div>}
            {ins.dashboard_lights.length > 0 && <div className="facts-wide"><dt>Luzes no painel</dt><dd>{ins.dashboard_lights.join(", ")}</dd></div>}
            {(ins.customer_reported_alerts || ins.noises_reported || ins.vibrations_reported || ins.starting_difficulty != null) && (
              <div className="facts-wide"><dt>Outros relatos do cliente</dt><dd>
                {[ins.customer_reported_alerts && `Alertas: ${ins.customer_reported_alerts}`,
                  ins.starting_difficulty != null && `Dificuldade na partida: ${ins.starting_difficulty ? "sim" : "não"}`,
                  ins.noises_reported && `Ruídos: ${ins.noises_reported}`, ins.vibrations_reported && `Vibrações: ${ins.vibrations_reported}`]
                  .filter(Boolean).join(". ")}
              </dd></div>
            )}
            {(ins.leaks_observed || ins.staff_observations) && (
              <div className="facts-wide"><dt>Constatado pelo funcionário</dt><dd>
                {[ins.leaks_observed && `Vazamentos: ${ins.leaks_observed}`, ins.staff_observations].filter(Boolean).join(". ")}
              </dd></div>
            )}
            {ins.accessories_received && <div className="facts-wide"><dt>Itens recebidos</dt><dd>{ins.accessories_received}</dd></div>}
            <div className="facts-wide"><dt>Ciência do cliente</dt><dd>{ins.customer_ack ? `Sim, ${ins.customer_ack_name} (${ins.customer_ack_method})` : "Não registrada"}</dd></div>
          </dl>
        )}
      </section>
      {items.length > 0 && (
        <section className="panel">
          <h2 className="section-title">Inspeção visual</h2>
          {damaged.length === 0 && <p className="muted">Nenhuma avaria registrada.</p>}
          <ul className="insp-list">
            {INSPECTION_ITEMS.map((def) => {
              const it = items.find((x) => x.item_code === def.code);
              if (!it) return null;
              return (
                <li key={def.code} className={`insp-${it.result}`}>
                  <span>{def.label}</span>
                  <span className="insp-res">{INSPECTION_RESULTS.find((r) => r.value === it.result)?.label}</span>
                  {it.notes && <small>{it.notes}</small>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusChanger({ b, reload }: { b: OsBundle; reload: () => void }) {
  const [to, setTo] = useState<OsStatus | "">("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save() {
    if (!to) return;
    if (to === "cancelado" && !confirm("Cancelar esta OS? Depois disso só o MasterAdm poderá corrigir.")) return;
    setBusy(true);
    const { error } = await supabase.from("service_orders").update({ status: to }).eq("id", b.os.id);
    setBusy(false);
    if (error) { toast("error", friendlyError(error)); return; }
    toast("ok", `Status: ${OS_STATUS[to].label}.`);
    setTo(""); reload();
  }
  return (
    <section className="panel status-changer">
      <div className="field">
        <label htmlFor="novo-status">Mudar status</label>
        <select id="novo-status" value={to} onChange={(e) => setTo(e.target.value as OsStatus)}>
          <option value="">Escolha o novo status</option>
          {MANUAL_STATUSES.filter((s) => s !== b.os.status).map((s) => <option key={s} value={s}>{OS_STATUS[s].label}</option>)}
        </select>
      </div>
      <button className="btn btn-primary" disabled={!to || busy} onClick={save}>{busy ? "Salvando…" : "Atualizar status"}</button>
      <p className="muted small">"Entregue" é registrado na aba Saída, junto com o check-out.</p>
    </section>
  );
}
