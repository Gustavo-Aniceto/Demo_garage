import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { usePhotoCategories, useStaffList } from "../../lib/data";
import { listPending } from "../../lib/queue";
import { SelectField, TextArea, TextField } from "../../components/Field";
import { PhotoCapture } from "../../components/PhotoCapture";
import { useToast } from "../../components/Toast";
import { isClosed, type OsBundle } from "./useOs";

export function Saida({ b, staff, reload }: { b: OsBundle; staff: Record<string, string>; reload: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const categories = usePhotoCategories();
  const closed = isClosed(b.os.status);
  const c = b.checkout;
  const kmIn = b.inspection?.km_in ?? 0;
  const pendingServices = b.services.filter((s) => s.status === "pendente");
  const notDone = b.services.filter((s) => s.status === "nao_executado");
  const [f, setF] = useState({
    km_out: c?.km_out?.toString() ?? "", mechanic_id: c?.mechanic_id ?? profile?.id ?? "",
    pending_items: c?.pending_items ?? notDone.map((s) => `${s.description} (não executado)`).join("\n"),
    future_recommendations: c?.future_recommendations ?? "", final_notes: c?.final_notes ?? "",
    delivered_to_name: c?.delivered_to_name ?? b.os.customers.full_name, delivery_confirmed: c?.delivery_confirmed ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (closed && c) {
    return (
      <section className="panel">
        <h2 className="section-title">Saída registrada</h2>
        <dl className="facts facts-plain">
          <div><dt>Data e hora</dt><dd>{formatDateTime(c.checked_out_at)}</dd></div>
          <div><dt>Quilometragem final</dt><dd>{c.km_out.toLocaleString("pt-BR")} km</dd></div>
          <div><dt>Mecânico responsável</dt><dd>{staff[c.mechanic_id] ?? "—"}</dd></div>
          <div><dt>Liberado por</dt><dd>{staff[c.released_by] ?? "—"}</dd></div>
          <div><dt>Entregue a</dt><dd>{c.delivered_to_name ?? "—"}</dd></div>
          {c.pending_items && <div className="facts-wide"><dt>Pendências</dt><dd className="pre">{c.pending_items}</dd></div>}
          {c.future_recommendations && <div className="facts-wide"><dt>Recomendações</dt><dd className="pre">{c.future_recommendations}</dd></div>}
          {c.final_notes && <div className="facts-wide"><dt>Observações</dt><dd className="pre">{c.final_notes}</dd></div>}
        </dl>
        <Link className="btn btn-secondary" to={`/sistema/os/${b.os.id}/documento/checkout`}>Relatório de saída (PDF)</Link>
      </section>
    );
  }
  if (closed) return <p className="empty">OS cancelada sem check-out.</p>;
  if (!profile?.can_checkout && profile?.role !== "master") {
    return <p className="notice notice-warn">Seu usuário não está autorizado a fazer check-out. Peça a um responsável autorizado.</p>;
  }

  const km = Number(f.km_out);
  const checks = [
    { ok: b.os.checkin_completed_at != null, label: "Check-in concluído" },
    { ok: b.services.length > 0, label: "Serviços executados registrados (aba Execução)" },
    { ok: pendingServices.length === 0, label: `Nenhum serviço com situação "Pendente"${pendingServices.length ? ` (${pendingServices.length})` : ""}` },
    { ok: /^\d+$/.test(f.km_out) && km >= kmIn, label: `Quilometragem final informada e ≥ ${kmIn.toLocaleString("pt-BR")} km` },
    { ok: !!f.mechanic_id, label: "Mecânico responsável" },
    { ok: f.delivery_confirmed && f.delivered_to_name.trim().length > 1, label: "Entrega confirmada com nome de quem retirou" },
  ];
  const ready = checks.every((x) => x.ok);

  async function finish() {
    setBusy(true); setError(null);
    try {
      const pending = await listPending(b.os.id);
      if (pending.length) throw new Error(`Ainda há ${pending.length} foto(s) não enviadas.`);
      const payload = {
        service_order_id: b.os.id, km_out: km, mechanic_id: f.mechanic_id, released_by: profile!.id,
        pending_items: f.pending_items.trim() || null, future_recommendations: f.future_recommendations.trim() || null,
        final_notes: f.final_notes.trim() || null, delivered_to_name: f.delivered_to_name.trim(), delivery_confirmed: true,
        checked_out_at: new Date().toISOString(),
      };
      const r = await supabase.from("checkouts").upsert(payload, { onConflict: "service_order_id" });
      if (r.error) throw r.error;
      const s = await supabase.from("service_orders").update({ status: "entregue" }).eq("id", b.os.id);
      if (s.error) throw s.error;
      toast("ok", "Saída registrada. OS encerrada.");
      reload();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <section className="panel form">
        <h2 className="section-title">Check-out</h2>
        <div className="grid-2">
          <TextField label="Quilometragem final" inputMode="numeric" value={f.km_out} onChange={(e) => setF({ ...f, km_out: e.target.value.replace(/\D/g, "").slice(0, 7) })}
            error={f.km_out && km < kmIn ? `Menor que a de entrada (${kmIn.toLocaleString("pt-BR")} km).` : null} />
          <SelectField label="Mecânico responsável" value={f.mechanic_id} onChange={(e) => setF({ ...f, mechanic_id: e.target.value })}>
            <option value="">Escolha</option>{staffList.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </SelectField>
        </div>
        <TextArea label="Pendências e serviços não executados" value={f.pending_items} onChange={(e) => setF({ ...f, pending_items: e.target.value })} />
        <TextArea label="Recomendações futuras" value={f.future_recommendations} onChange={(e) => setF({ ...f, future_recommendations: e.target.value })} />
        <TextArea label="Observações finais" value={f.final_notes} onChange={(e) => setF({ ...f, final_notes: e.target.value })} />
        <TextField label="Entregue a (nome)" value={f.delivered_to_name} onChange={(e) => setF({ ...f, delivered_to_name: e.target.value })} />
        <label className="check"><input type="checkbox" checked={f.delivery_confirmed} onChange={(e) => setF({ ...f, delivery_confirmed: e.target.checked })} /> Confirmo a entrega do veículo</label>
      </section>

      <section className="panel">
        <h2 className="section-title">Fotos após o serviço</h2>
        <PhotoCapture osId={b.os.id} vehicleId={b.os.vehicle_id} stage="checkout" categories={categories} saved={b.photos.filter((p) => p.stage === "checkout")} />
      </section>

      <section className="panel">
        <h2 className="section-title">Antes de liberar</h2>
        <ul className="pw-checks">{checks.map((x) => <li key={x.label} className={x.ok ? "ok" : ""}>{x.label}</li>)}</ul>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="btn btn-primary btn-lg" disabled={!ready || busy} onClick={finish}>{busy ? "Registrando…" : "Registrar saída e entregar"}</button>
        </div>
        <p className="muted small">Liberação registrada em nome de {profile?.full_name}. Depois de entregue, a OS só pode ser corrigida pelo MasterAdm.</p>
      </section>
    </div>
  );
}
