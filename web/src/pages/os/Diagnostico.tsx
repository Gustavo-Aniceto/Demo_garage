import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { usePhotoCategories } from "../../lib/data";
import { DEFECT_CATEGORIES, SEVERITIES, type DefectCategory } from "../../lib/types";
import { SelectField, TextArea } from "../../components/Field";
import { PhotoCapture } from "../../components/PhotoCapture";
import { useToast } from "../../components/Toast";
import { isClosed, type OsBundle } from "./useOs";

interface DefectDraft { category: DefectCategory; description: string; severity: string }

export function Diagnostico({ b, staff, reload }: { b: OsBundle; staff: Record<string, string>; reload: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const categories = usePhotoCategories();
  const closed = isClosed(b.os.status);
  const [open, setOpen] = useState(b.diagnostics.length === 0 && !closed);
  const [f, setF] = useState({ symptoms: "", tests_performed: "", technical_diagnosis: "", recommended_services: "", required_parts: "", notes: "", needs_reevaluation: false });
  const [defects, setDefects] = useState<DefectDraft[]>([{ category: "outros", description: "", severity: "media" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const d = await supabase.from("diagnostics").insert({
        service_order_id: b.os.id, mechanic_id: profile!.id,
        ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])),
      }).select("id").single();
      if (d.error) throw d.error;
      const rows = defects.filter((x) => x.description.trim()).map((x) => ({ ...x, description: x.description.trim(), diagnostic_id: d.data.id }));
      if (rows.length) { const r = await supabase.from("diagnostic_defects").insert(rows); if (r.error) throw r.error; }
      if (b.os.status === "aguardando_diagnostico") await supabase.from("service_orders").update({ status: "em_diagnostico" }).eq("id", b.os.id);
      toast("ok", "Diagnóstico registrado.");
      setOpen(false);
      setF({ symptoms: "", tests_performed: "", technical_diagnosis: "", recommended_services: "", required_parts: "", notes: "", needs_reevaluation: false });
      setDefects([{ category: "outros", description: "", severity: "media" }]);
      reload();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const valid = f.technical_diagnosis.trim().length > 0 || defects.some((d) => d.description.trim());

  return (
    <div className="stack">
      {b.diagnostics.map((d) => (
        <article key={d.id} className="panel">
          <header className="page-head-row">
            <h2 className="section-title">Diagnóstico de {formatDateTime(d.performed_at)}</h2>
            <span className="muted small">{staff[d.mechanic_id] ?? ""}</span>
          </header>
          {d.diagnostic_defects && d.diagnostic_defects.length > 0 && (
            <ul className="defects">
              {d.diagnostic_defects.map((x) => (
                <li key={x.id}><span className={`badge sev-${x.severity}`}>{SEVERITIES.find((s) => s.value === x.severity)?.label}</span>
                  <strong>{DEFECT_CATEGORIES.find((c) => c.value === x.category)?.label}:</strong> {x.description}</li>
              ))}
            </ul>
          )}
          <dl className="facts facts-plain">
            {([["Sintomas identificados", d.symptoms], ["Testes realizados", d.tests_performed], ["Diagnóstico técnico", d.technical_diagnosis],
               ["Serviços recomendados", d.recommended_services], ["Peças necessárias", d.required_parts], ["Observações técnicas", d.notes]] as const)
              .filter(([, v]) => v).map(([k, v]) => <div key={k} className="facts-wide"><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {d.needs_reevaluation && <p className="notice notice-warn">Precisa de nova avaliação.</p>}
        </article>
      ))}

      {!closed && !open && <button className="btn btn-secondary" onClick={() => setOpen(true)}>Registrar novo diagnóstico</button>}
      {!closed && open && (
        <section className="panel form">
          <h2 className="section-title">Novo diagnóstico</h2>
          <TextArea label="Sintomas identificados" value={f.symptoms} onChange={(e) => setF({ ...f, symptoms: e.target.value })} />
          <TextArea label="Testes realizados" value={f.tests_performed} onChange={(e) => setF({ ...f, tests_performed: e.target.value })} />
          <fieldset className="field">
            <legend className="legend">Defeitos constatados</legend>
            {defects.map((d, i) => (
              <div key={i} className="defect-row">
                <SelectField label="Categoria" value={d.category} onChange={(e) => setDefects(defects.map((x, j) => j === i ? { ...x, category: e.target.value as DefectCategory } : x))}>
                  {DEFECT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </SelectField>
                <SelectField label="Gravidade" value={d.severity} onChange={(e) => setDefects(defects.map((x, j) => j === i ? { ...x, severity: e.target.value } : x))}>
                  {SEVERITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </SelectField>
                <div className="field defect-desc">
                  <label htmlFor={`def-${i}`}>Descrição</label>
                  <input id={`def-${i}`} value={d.description} onChange={(e) => setDefects(defects.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                </div>
                {defects.length > 1 && <button type="button" className="btn btn-link" onClick={() => setDefects(defects.filter((_, j) => j !== i))}>Remover</button>}
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDefects([...defects, { category: "outros", description: "", severity: "media" }])}>Adicionar defeito</button>
          </fieldset>
          <TextArea label="Diagnóstico técnico" value={f.technical_diagnosis} onChange={(e) => setF({ ...f, technical_diagnosis: e.target.value })} />
          <TextArea label="Serviços recomendados" value={f.recommended_services} onChange={(e) => setF({ ...f, recommended_services: e.target.value })} />
          <TextArea label="Peças necessárias" value={f.required_parts} onChange={(e) => setF({ ...f, required_parts: e.target.value })} />
          <TextArea label="Observações técnicas" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <label className="check"><input type="checkbox" checked={f.needs_reevaluation} onChange={(e) => setF({ ...f, needs_reevaluation: e.target.checked })} /> Precisa de nova avaliação</label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            {b.diagnostics.length > 0 && <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>}
            <button className="btn btn-primary" disabled={!valid || busy} onClick={save}>{busy ? "Salvando…" : "Salvar diagnóstico"}</button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="section-title">Fotos do diagnóstico</h2>
        <PhotoCapture osId={b.os.id} vehicleId={b.os.vehicle_id} stage="checkup" categories={categories}
          saved={b.photos.filter((p) => p.stage === "checkup")} disabled={closed} />
      </section>
    </div>
  );
}
