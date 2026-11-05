import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import { formatDate, formatPlate } from "../lib/format";
import { brl, usePhotoCategories, useStaff } from "../lib/data";
import { approvedTotal, vehicleHistory, type HistoryOs } from "../lib/history";
import { DEFECT_CATEGORIES, VEHICLE_TYPES, type DefectCategory, type Vehicle, type VehiclePhoto } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { PhotoGallery } from "../components/PhotoGallery";

type VehicleWithOwner = Vehicle & { customers: { id: string; full_name: string; phone: string } };

export function VeiculoDetalhe() {
  const { id } = useParams();
  const staff = useStaff();
  const categories = usePhotoCategories();
  const [v, setV] = useState<VehicleWithOwner | null>(null);
  const [hist, setHist] = useState<HistoryOs[]>([]);
  const [photos, setPhotos] = useState<(VehiclePhoto & { os_number?: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cat, setCat] = useState<DefectCategory | "">("");
  const [showPhotos, setShowPhotos] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("vehicles").select("*, customers(id, full_name, phone)").eq("id", id).single(),
      vehicleHistory(id!),
      supabase.from("vehicle_photos").select("*, service_orders(number)").eq("vehicle_id", id).order("taken_at"),
    ]).then(([a, h, p]) => {
      if (a.error || p.error) { setError(friendlyError(a.error ?? p.error)); return; }
      setV(a.data as VehicleWithOwner); setHist(h);
      setPhotos((p.data ?? []).map((x) => ({ ...(x as VehiclePhoto), os_number: (x as { service_orders: { number: string } }).service_orders?.number })));
    }).catch((e) => setError(friendlyError(e)));
  }, [id]);

  const filtered = useMemo(() => hist.filter((o) => {
    const d = o.opened_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (cat && !o.diagnostics.some((x) => x.diagnostic_defects.some((df) => df.category === cat))) return false;
    return true;
  }), [hist, from, to, cat]);

  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!v) return <div className="page"><p className="muted">Carregando…</p></div>;
  const openOs = hist.find((o) => !["entregue", "cancelado"].includes(o.status));

  return (
    <div className="page">
      <header className="vehicle-head">
        <div className="plate plate-static" aria-label={`Placa ${formatPlate(v.plate_normalized)}`}>
          <div className="plate-band" aria-hidden><span>BRASIL</span></div>
          <span className="plate-text">{formatPlate(v.plate_normalized)}</span>
        </div>
        <div>
          <h1>{v.brand} {v.model}</h1>
          <p className="muted">{[v.year_manufacture && v.year_model ? `${v.year_manufacture}/${v.year_model}` : v.year_model, v.color,
            VEHICLE_TYPES.find((t) => t.value === v.vehicle_type)?.label].filter(Boolean).join(", ")}</p>
        </div>
        <div className="vehicle-actions">
          {openOs ? (
            <Link className="btn btn-primary" to={openOs.checkin_completed_at ? `/sistema/os/${openOs.id}` : `/sistema/checkin/${openOs.id}`}>
              {openOs.checkin_completed_at ? `Abrir ${openOs.number}` : "Continuar check-in"}
            </Link>
          ) : <Link className="btn btn-primary" to={`/sistema/checkin/novo?veiculo=${v.id}`}>Iniciar check-in</Link>}
          <Link className="btn btn-secondary" to={`/sistema/veiculos/${v.id}/editar`}>Editar</Link>
        </div>
      </header>

      <dl className="facts">
        <div><dt>Cliente</dt><dd><Link to={`/sistema/clientes/${v.customers.id}`}>{v.customers.full_name}</Link></dd></div>
        <div><dt>Telefone</dt><dd>{v.customers.phone}</dd></div>
        <div><dt>Atendimentos</dt><dd>{hist.length}</dd></div>
        {v.notes && <div className="facts-wide"><dt>Observações</dt><dd>{v.notes}</dd></div>}
      </dl>

      <section>
        <div className="page-head-row">
          <h2 className="section-title">Histórico de atendimentos</h2>
          {hist.length > 0 && <Link className="btn btn-secondary btn-sm" to={`/sistema/veiculos/${v.id}/documento`}>Histórico em PDF</Link>}
        </div>
        {hist.length > 0 && (
          <div className="filters">
            <div className="field"><label htmlFor="h-de">De</label><input id="h-de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field"><label htmlFor="h-ate">Até</label><input id="h-ate" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="field"><label htmlFor="h-tipo">Tipo de serviço</label>
              <select id="h-tipo" value={cat} onChange={(e) => setCat(e.target.value as DefectCategory)}>
                <option value="">Todos</option>{DEFECT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
          </div>
        )}
        {hist.length === 0 ? <p className="empty">Este veículo ainda não passou pela oficina.</p> : filtered.length === 0 ? <p className="empty">Nenhum atendimento neste filtro.</p> : (
          <ul className="history">
            {filtered.map((o) => {
              const total = approvedTotal(o);
              const executed = o.performed_services.filter((s) => s.status === "executado");
              return (
                <li key={o.id}>
                  <Link to={o.checkin_completed_at || o.status === "cancelado" ? `/sistema/os/${o.id}` : `/sistema/checkin/${o.id}`} className="history-card">
                    <header><strong>{o.number}</strong><StatusBadge status={o.status} /></header>
                    <p className="muted small">
                      Entrada {formatDate(o.checkin_inspections?.entered_at ?? o.opened_at)}
                      {o.checkin_inspections ? `, ${o.checkin_inspections.km_in.toLocaleString("pt-BR")} km` : ""}
                      {o.checkouts ? `. Saída ${formatDate(o.checkouts.checked_out_at)}, ${o.checkouts.km_out.toLocaleString("pt-BR")} km` : ""}
                      {o.checkin_inspections ? `. Atendido por ${staff[o.checkin_inspections.responsible_id] ?? "—"}` : ""}
                    </p>
                    {o.checkin_inspections?.customer_complaint && <p><span className="muted">Relato:</span> {o.checkin_inspections.customer_complaint}</p>}
                    {o.diagnostics.some((d) => d.technical_diagnosis || d.diagnostic_defects.length) && (
                      <p><span className="muted">Diagnóstico:</span> {o.diagnostics.flatMap((d) => [d.technical_diagnosis, ...d.diagnostic_defects.map((x) => x.description)]).filter(Boolean).join("; ")}</p>
                    )}
                    {executed.length > 0 && <p><span className="muted">Executado:</span> {executed.map((s) => s.description).join(", ")}</p>}
                    {o.checkouts?.pending_items && <p><span className="muted">Pendências:</span> {o.checkouts.pending_items}</p>}
                    {total != null && <p className="small">Valor aprovado {brl(total)}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {photos.length > 0 && (
        <section>
          <div className="page-head-row">
            <h2 className="section-title">Fotos de todos os atendimentos ({photos.length})</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPhotos(!showPhotos)}>{showPhotos ? "Ocultar" : "Ver e comparar"}</button>
          </div>
          {showPhotos && <PhotoGallery photos={photos} categories={categories} staff={staff} groupBy="os" />}
        </section>
      )}
    </div>
  );
}
