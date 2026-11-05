import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { formatPlate } from "../lib/format";
import { usePhotoCategories, useOsPhotos } from "../lib/data";
import { listPending } from "../lib/queue";
import {
  APPROVAL_METHODS, DASHBOARD_LIGHTS, FUEL_LEVELS, INSPECTION_ITEMS, INSPECTION_RESULTS,
  type ApprovalMethod, type Customer, type FuelLevel, type InspectionResult, type Vehicle,
} from "../lib/types";
import { SelectField, TextArea, TextField } from "../components/Field";
import { PendingBanner, PhotoCapture } from "../components/PhotoCapture";
import { useToast } from "../components/Toast";

const STEPS = ["Identificação", "Inspeção visual", "Painel e funcionamento", "Fotos", "Confirmação"];

interface Draft {
  clientRequestId: string;
  osId: string | null;
  step: number;
  f: {
    km_in: string; fuel_level: FuelLevel | ""; visit_reason: string; customer_complaint: string;
    dashboard_lights: string[]; customer_reported_alerts: string; starting_difficulty: "" | "sim" | "nao";
    noises_reported: string; vibrations_reported: string; leaks_observed: string; staff_observations: string;
    accessories_received: string; customer_ack: boolean; customer_ack_name: string; customer_ack_method: ApprovalMethod | "";
  };
  items: Record<string, { result: InspectionResult; notes: string }>;
}

const emptyDraft = (): Draft => ({
  clientRequestId: crypto.randomUUID(), osId: null, step: 0,
  f: { km_in: "", fuel_level: "", visit_reason: "", customer_complaint: "", dashboard_lights: [], customer_reported_alerts: "",
       starting_difficulty: "", noises_reported: "", vibrations_reported: "", leaks_observed: "", staff_observations: "",
       accessories_received: "", customer_ack: false, customer_ack_name: "", customer_ack_method: "" },
  items: Object.fromEntries(INSPECTION_ITEMS.map((i) => [i.code, { result: "nao_verificado" as InspectionResult, notes: "" }])),
});
const draftKey = (vehicleId: string) => `oficina:checkin:${vehicleId}`;

export function CheckinWizard() {
  const { osId: osParam } = useParams();
  const [params] = useSearchParams();
  const vehicleParam = params.get("veiculo");
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const categories = usePhotoCategories();

  const [vehicle, setVehicle] = useState<(Vehicle & { customers: Customer }) | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [osNumber, setOsNumber] = useState("");
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { photos } = useOsPhotos(draft?.osId ?? null);

  // ---- carregar veículo / OS em rascunho ----
  useEffect(() => {
    (async () => {
      try {
        if (osParam) {
          const { data, error: e } = await supabase.from("service_orders")
            .select("id, number, checkin_completed_at, client_request_id, vehicles(*, customers(*)), checkin_inspections(*, checkin_inspection_items(*))")
            .eq("id", osParam).single();
          if (e) throw e;
          if (data.checkin_completed_at) { navigate(`/sistema/os/${osParam}`, { replace: true }); return; }
          const v = data.vehicles as unknown as Vehicle & { customers: Customer };
          setVehicle(v); setOsNumber(data.number);
          const local = readDraft(v.id);
          const ins = (Array.isArray(data.checkin_inspections) ? data.checkin_inspections[0] : data.checkin_inspections) as
            (Record<string, unknown> & { id: string; checkin_inspection_items: { item_code: string; result: InspectionResult; notes: string | null }[] }) | null;
          const d = local?.osId === osParam ? local : emptyDraft();
          d.osId = osParam; d.clientRequestId = data.client_request_id ?? d.clientRequestId;
          if (ins && local?.osId !== osParam) {
            setInspectionId(ins.id);
            for (const k of Object.keys(d.f) as (keyof Draft["f"])[]) {
              const val = ins[k];
              if (k === "km_in") d.f.km_in = val != null ? String(val) : "";
              else if (k === "starting_difficulty") d.f.starting_difficulty = val == null ? "" : val ? "sim" : "nao";
              else if (val != null) (d.f as Record<string, unknown>)[k] = val;
            }
            for (const it of ins.checkin_inspection_items ?? []) d.items[it.item_code] = { result: it.result, notes: it.notes ?? "" };
            d.step = 1;
          } else if (ins) setInspectionId(ins.id);
          setDraft(d);
        } else if (vehicleParam) {
          const { data: open } = await supabase.from("service_orders").select("id")
            .eq("vehicle_id", vehicleParam).is("checkin_completed_at", null).neq("status", "cancelado").maybeSingle();
          if (open) { navigate(`/sistema/checkin/${open.id}`, { replace: true }); return; }
          const { data, error: e } = await supabase.from("vehicles").select("*, customers(*)").eq("id", vehicleParam).single();
          if (e) throw e;
          setVehicle(data as Vehicle & { customers: Customer });
          const local = readDraft(vehicleParam);
          setDraft(local && !local.osId ? local : emptyDraft());
        } else {
          setError("Escolha o veículo pela busca de placa antes de iniciar o check-in.");
        }
      } catch (e) { setError(friendlyError(e)); }
    })();
  }, [osParam, vehicleParam, navigate]);

  // ---- rascunho local (só dados digitados; nunca confundido com "salvo") ----
  useEffect(() => {
    if (vehicle && draft && !done) localStorage.setItem(draftKey(vehicle.id), JSON.stringify(draft));
  }, [vehicle, draft, done]);

  const setF = <K extends keyof Draft["f"]>(k: K, v: Draft["f"][K]) => setDraft((d) => d && ({ ...d, f: { ...d.f, [k]: v } }));
  const setItem = (code: string, patch: Partial<{ result: InspectionResult; notes: string }>) =>
    setDraft((d) => d && ({ ...d, items: { ...d.items, [code]: { ...d.items[code], ...patch } } }));
  const goto = (step: number) => { setDraft((d) => d && ({ ...d, step })); window.scrollTo({ top: 0 }); };

  const requiredMissing = useMemo(() => categories
    .filter((c) => c.stage === "checkin" && c.required && !photos.some((p) => p.category === c.code)), [categories, photos]);

  if (error && !draft) return <div className="page"><p className="form-error">{error}</p><Link to="/sistema">Voltar ao painel</Link></div>;
  if (!draft || !vehicle) return <div className="page"><p className="muted">Carregando…</p></div>;
  const { f, step } = draft;

  // ---- gravações ----
  async function ensureOs(): Promise<string> {
    if (draft!.osId) return draft!.osId;
    const ins = await supabase.from("service_orders")
      .insert({ client_request_id: draft!.clientRequestId, customer_id: vehicle!.customer_id, vehicle_id: vehicle!.id })
      .select("id, number").single();
    let row = ins.data;
    if (ins.error) {
      if (ins.error.code !== "23505") throw ins.error;
      const again = await supabase.from("service_orders").select("id, number").eq("client_request_id", draft!.clientRequestId).single();
      if (again.error) throw again.error;
      row = again.data;
    }
    setOsNumber(row!.number);
    setDraft((d) => d && ({ ...d, osId: row!.id }));
    return row!.id;
  }

  async function saveInspection(osId: string, extra: Record<string, unknown> = {}) {
    const payload = {
      service_order_id: osId, km_in: Number(f.km_in), fuel_level: f.fuel_level || null, responsible_id: profile!.id,
      visit_reason: f.visit_reason || null, customer_complaint: f.customer_complaint || null, ...extra,
    };
    const r = await supabase.from("checkin_inspections").upsert(payload, { onConflict: "service_order_id" }).select("id").single();
    if (r.error) throw r.error;
    setInspectionId(r.data.id);
    return r.data.id as string;
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  const step1Valid = /^\d{1,7}$/.test(f.km_in) && (f.visit_reason.trim() || f.customer_complaint.trim());
  const damagedWithoutNote = INSPECTION_ITEMS.filter((i) => draft.items[i.code].result === "com_avaria" && !draft.items[i.code].notes.trim());

  const next1 = () => run(async () => { const id = await ensureOs(); await saveInspection(id); goto(1); });
  const next2 = () => run(async () => {
    const insId = inspectionId ?? await saveInspection(draft.osId!);
    const rows = INSPECTION_ITEMS.map((i) => ({ inspection_id: insId, item_code: i.code, result: draft.items[i.code].result, notes: draft.items[i.code].notes || null }));
    const r = await supabase.from("checkin_inspection_items").upsert(rows, { onConflict: "inspection_id,item_code" });
    if (r.error) throw r.error;
    goto(2);
  });
  const next3 = () => run(async () => {
    await saveInspection(draft.osId!, {
      dashboard_lights: f.dashboard_lights, customer_reported_alerts: f.customer_reported_alerts || null,
      starting_difficulty: f.starting_difficulty === "" ? null : f.starting_difficulty === "sim",
      noises_reported: f.noises_reported || null, vibrations_reported: f.vibrations_reported || null,
      leaks_observed: f.leaks_observed || null, staff_observations: f.staff_observations || null,
      accessories_received: f.accessories_received || null,
    });
    goto(3);
  });
  const finish = () => run(async () => {
    const pending = await listPending(draft.osId!);
    if (pending.length) throw new Error(`Ainda há ${pending.length} foto(s) não enviadas. Aguarde o envio ou toque em "Enviar agora".`);
    await saveInspection(draft.osId!, {
      customer_ack: f.customer_ack, customer_ack_name: f.customer_ack ? f.customer_ack_name.trim() : null,
      customer_ack_method: f.customer_ack ? f.customer_ack_method || null : null,
    });
    const r = await supabase.from("service_orders").update({ checkin_completed_at: new Date().toISOString() }).eq("id", draft.osId!);
    if (r.error) throw r.error;
    localStorage.removeItem(draftKey(vehicle.id));
    setDone(true);
    toast("ok", `Check-in concluído: ${osNumber}.`);
  });

  if (done) {
    return (
      <div className="page page-narrow">
        <div className="panel success-panel">
          <h1>Check-in concluído</h1>
          <p className="os-number">{osNumber}</p>
          <p>{vehicle.brand} {vehicle.model}, placa {formatPlate(vehicle.plate_normalized)}. Dados e fotos salvos na nuvem.</p>
          <div className="form-actions">
            <Link className="btn btn-secondary" to={`/sistema/os/${draft.osId}/documento/checkin`}>Ficha de entrada (PDF)</Link>
            <Link className="btn btn-primary" to={`/sistema/os/${draft.osId}`}>Abrir ordem de serviço</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>Check-in {osNumber && <span className="muted">{osNumber}</span>}</h1>
        <p className="muted"><span className="plate-chip">{formatPlate(vehicle.plate_normalized)}</span> {vehicle.brand} {vehicle.model}, cliente {vehicle.customers.full_name}</p>
      </header>

      <ol className="stepper" aria-label="Etapas do check-in">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "current" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
            <button type="button" disabled={i > step || busy} onClick={() => goto(i)}><span>{i + 1}</span>{s}</button>
          </li>
        ))}
      </ol>

      {draft.osId && <PendingBanner osId={draft.osId} />}
      <p className="muted small">{draft.osId ? "Cada etapa é salva na nuvem ao tocar em Continuar. O que você digita também fica guardado neste aparelho até concluir." : "O que você digita fica guardado neste aparelho. A OS é criada na nuvem ao continuar."}</p>

      {step === 0 && (
        <section className="form">
          <div className="grid-2">
            <TextField label="Quilometragem atual" inputMode="numeric" value={f.km_in} required
              onChange={(e) => setF("km_in", e.target.value.replace(/\D/g, "").slice(0, 7))}
              error={f.km_in && !/^\d+$/.test(f.km_in) ? "Somente números." : null} />
            <SelectField label="Combustível (aproximado)" value={f.fuel_level} onChange={(e) => setF("fuel_level", e.target.value as FuelLevel)}>
              <option value="">Não verificado</option>
              {FUEL_LEVELS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </SelectField>
          </div>
          <TextField label="Motivo da visita" value={f.visit_reason} onChange={(e) => setF("visit_reason", e.target.value)} placeholder="Ex.: revisão, barulho, luz acesa" />
          <TextArea label="Reclamação relatada pelo cliente" value={f.customer_complaint} onChange={(e) => setF("customer_complaint", e.target.value)}
            hint="Use as palavras do cliente. O que o funcionário constatar vai na etapa 3." />
          <p className="muted small">Responsável: {profile?.full_name}. Data e hora são registradas automaticamente.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary btn-lg" disabled={!step1Valid || busy} onClick={next1}>{busy ? "Salvando…" : "Continuar"}</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="form">
          {INSPECTION_ITEMS.map((i) => {
            const it = draft.items[i.code];
            return (
              <fieldset key={i.code} className={`insp-item insp-${it.result}`}>
                <legend>{i.label}</legend>
                <div className="seg" role="radiogroup" aria-label={i.label}>
                  {INSPECTION_RESULTS.map((r) => (
                    <label key={r.value} className={it.result === r.value ? "on" : ""}>
                      <input type="radio" name={i.code} value={r.value} checked={it.result === r.value} onChange={() => setItem(i.code, { result: r.value })} />
                      {r.label}
                    </label>
                  ))}
                </div>
                {(it.result === "com_avaria" || it.notes) && (
                  <input className="insp-notes" placeholder={it.result === "com_avaria" ? "Descreva a avaria e onde está (obrigatório)" : "Observação"}
                    value={it.notes} onChange={(e) => setItem(i.code, { notes: e.target.value })} aria-label={`Observação: ${i.label}`} />
                )}
              </fieldset>
            );
          })}
          {damagedWithoutNote.length > 0 && <p className="field-error">Descreva as avarias em: {damagedWithoutNote.map((d) => d.label).join(", ")}.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => goto(0)}>Voltar</button>
            <button className="btn btn-primary btn-lg" disabled={busy || damagedWithoutNote.length > 0} onClick={next2}>{busy ? "Salvando…" : "Continuar"}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="form">
          <fieldset className="field">
            <legend className="legend">Luzes acesas no painel</legend>
            <div className="chip-select">
              {DASHBOARD_LIGHTS.map((l) => {
                const on = f.dashboard_lights.includes(l);
                return (
                  <label key={l} className={on ? "on" : ""}>
                    <input type="checkbox" checked={on} onChange={() => setF("dashboard_lights", on ? f.dashboard_lights.filter((x) => x !== l) : [...f.dashboard_lights, l])} />
                    {l}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <h2 className="section-title">Relatos do cliente</h2>
          <TextField label="Alertas informados pelo cliente" value={f.customer_reported_alerts} onChange={(e) => setF("customer_reported_alerts", e.target.value)} />
          <SelectField label="Dificuldade na partida (segundo o cliente)" value={f.starting_difficulty} onChange={(e) => setF("starting_difficulty", e.target.value as Draft["f"]["starting_difficulty"])}>
            <option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option>
          </SelectField>
          <TextField label="Ruídos relatados" value={f.noises_reported} onChange={(e) => setF("noises_reported", e.target.value)} />
          <TextField label="Vibrações relatadas" value={f.vibrations_reported} onChange={(e) => setF("vibrations_reported", e.target.value)} />
          <h2 className="section-title">Constatações do funcionário</h2>
          <TextField label="Vazamentos aparentes" value={f.leaks_observed} onChange={(e) => setF("leaks_observed", e.target.value)} />
          <TextArea label="Outros sintomas observados" value={f.staff_observations} onChange={(e) => setF("staff_observations", e.target.value)} />
          <TextField label="Acessórios e itens recebidos com o veículo" value={f.accessories_received} onChange={(e) => setF("accessories_received", e.target.value)} placeholder="Ex.: estepe, macaco, chave de roda, documento" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => goto(1)}>Voltar</button>
            <button className="btn btn-primary btn-lg" disabled={busy} onClick={next3}>{busy ? "Salvando…" : "Continuar"}</button>
          </div>
        </section>
      )}

      {step === 3 && draft.osId && (
        <section className="form">
          <p>Fotografe o veículo. As marcadas como <strong>obrigatórias</strong> precisam estar na nuvem para concluir.</p>
          <PhotoCapture osId={draft.osId} vehicleId={vehicle.id} stage="checkin" categories={categories} saved={photos} />
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => goto(2)}>Voltar</button>
            <button className="btn btn-primary btn-lg" onClick={() => goto(4)}>Continuar</button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="form">
          <div className="panel">
            <h2 className="section-title">Resumo</h2>
            <dl className="facts facts-plain">
              <div><dt>Quilometragem</dt><dd>{Number(f.km_in).toLocaleString("pt-BR")} km</dd></div>
              <div><dt>Combustível</dt><dd>{FUEL_LEVELS.find((x) => x.value === f.fuel_level)?.label ?? "Não verificado"}</dd></div>
              <div><dt>Avarias registradas</dt><dd>{INSPECTION_ITEMS.filter((i) => draft.items[i.code].result === "com_avaria").length}</dd></div>
              <div><dt>Fotos na nuvem</dt><dd>{photos.filter((p) => p.stage === "checkin").length}</dd></div>
            </dl>
            {requiredMissing.length > 0 && (
              <p className="field-error">Faltam fotos obrigatórias: {requiredMissing.map((c) => c.label).join(", ")}. <button className="btn btn-link" onClick={() => goto(3)}>Ir para fotos</button></p>
            )}
          </div>
          <label className="check"><input type="checkbox" checked={f.customer_ack} onChange={(e) => setF("customer_ack", e.target.checked)} />
            O cliente está ciente das condições observadas no recebimento</label>
          {f.customer_ack && (
            <div className="grid-2">
              <TextField label="Nome de quem confirmou" value={f.customer_ack_name} onChange={(e) => setF("customer_ack_name", e.target.value)} required />
              <SelectField label="Forma de confirmação" value={f.customer_ack_method} onChange={(e) => setF("customer_ack_method", e.target.value as ApprovalMethod)}>
                <option value="">Escolha</option>
                {APPROVAL_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </SelectField>
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => goto(3)}>Voltar</button>
            <button className="btn btn-primary btn-lg" onClick={finish}
              disabled={busy || requiredMissing.length > 0 || (f.customer_ack && (!f.customer_ack_name.trim() || !f.customer_ack_method))}>
              {busy ? "Concluindo…" : "Concluir check-in"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function readDraft(vehicleId: string): Draft | null {
  try { return JSON.parse(localStorage.getItem(draftKey(vehicleId)) ?? "null"); } catch { return null; }
}
