import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import { formatDate, formatPlate } from "../lib/format";
import { brl, useStaff } from "../lib/data";
import { approvedTotal, vehicleHistory, type HistoryOs } from "../lib/history";
import { DEFECT_CATEGORIES, OS_STATUS, type Customer, type Vehicle } from "../lib/types";
import { DocRow, DocShell } from "../components/DocShell";

export function HistoricoDoc() {
  const { id } = useParams();
  const staff = useStaff();
  const [v, setV] = useState<(Vehicle & { customers: Customer }) | null>(null);
  const [h, setH] = useState<HistoryOs[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([supabase.from("vehicles").select("*, customers(*)").eq("id", id).single(), vehicleHistory(id!)])
      .then(([a, hist]) => { if (a.error) throw a.error; setV(a.data as Vehicle & { customers: Customer }); setH(hist); })
      .catch((e) => setError(friendlyError(e)));
  }, [id]);
  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!v) return <div className="page"><p className="muted">Carregando…</p></div>;

  return (
    <DocShell title="Histórico de atendimento" number={formatPlate(v.plate_normalized)}>
      <section className="doc-section doc-grid2">
        <div><h2>Veículo</h2><dl><DocRow label="Placa" value={formatPlate(v.plate_normalized)} /><DocRow label="Marca / modelo" value={`${v.brand} ${v.model}`} />
          <DocRow label="Ano" value={v.year_model} /><DocRow label="Cor" value={v.color} /></dl></div>
        <div><h2>Cliente atual</h2><dl><DocRow label="Nome" value={v.customers.full_name} /><DocRow label="Telefone" value={v.customers.phone} /></dl></div>
      </section>
      <section className="doc-section">
        <h2>Atendimentos ({h.length})</h2>
        {h.map((o) => {
          const total = approvedTotal(o);
          return (
            <div key={o.id} className="doc-block">
              <h3>{o.number}: {OS_STATUS[o.status].label}</h3>
              <dl className="doc-grid2">
                <DocRow label="Entrada" value={formatDate(o.checkin_inspections?.entered_at ?? o.opened_at)} />
                <DocRow label="Saída" value={o.checkouts ? formatDate(o.checkouts.checked_out_at) : null} />
                <DocRow label="Km" value={`${o.checkin_inspections?.km_in?.toLocaleString("pt-BR") ?? "—"}${o.checkouts ? ` / ${o.checkouts.km_out.toLocaleString("pt-BR")}` : ""}`} />
                <DocRow label="Responsáveis" value={[o.checkin_inspections && staff[o.checkin_inspections.responsible_id], o.checkouts && staff[o.checkouts.mechanic_id]].filter(Boolean).join(", ")} />
                <DocRow label="Valor aprovado" value={total != null ? brl(total) : null} />
              </dl>
              <dl>
                <DocRow label="Defeito relatado" value={o.checkin_inspections?.customer_complaint} />
                <DocRow label="Diagnóstico" value={o.diagnostics.map((d) => [d.technical_diagnosis, ...d.diagnostic_defects.map((x) => `${DEFECT_CATEGORIES.find((c) => c.value === x.category)?.label}: ${x.description}`)].filter(Boolean).join("; ")).join(" | ")} />
                <DocRow label="Executado" value={o.performed_services.filter((s) => s.status === "executado").map((s) => s.description).join(", ")} />
                <DocRow label="Não executado / pendente" value={o.performed_services.filter((s) => s.status !== "executado").map((s) => s.description).join(", ")} />
                <DocRow label="Pendências registradas" value={o.checkouts?.pending_items} />
              </dl>
            </div>
          );
        })}
      </section>
    </DocShell>
  );
}
