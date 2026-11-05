import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import { formatPlate, isValidPlate, normalizePlate } from "../lib/format";
import { VEHICLE_TYPES, type Vehicle, type VehicleType } from "../lib/types";
import { SelectField, TextArea, TextField } from "../components/Field";
import { useToast } from "../components/Toast";

const YEAR_MAX = new Date().getFullYear() + 1;

export function VeiculoForm() {
  const { customerId, vehicleId } = useParams();
  const editing = !!vehicleId;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    plate: normalizePlate(params.get("placa") ?? ""), brand: "", model: "", year_manufacture: "", year_model: "",
    color: "", vehicle_type: "carro" as VehicleType, notes: "",
  });
  const [ownerId, setOwnerId] = useState<string | null>(customerId ?? null);
  const [ownerName, setOwnerName] = useState("");
  const [originalPlate, setOriginalPlate] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      supabase.from("vehicles").select("*, customers(full_name)").eq("id", vehicleId).single().then(({ data, error: err }) => {
        if (err) { setError(friendlyError(err)); return; }
        const v = data as Vehicle & { customers: { full_name: string } };
        setForm({ plate: v.plate_normalized, brand: v.brand, model: v.model, year_manufacture: v.year_manufacture?.toString() ?? "",
          year_model: v.year_model?.toString() ?? "", color: v.color ?? "", vehicle_type: v.vehicle_type, notes: v.notes ?? "" });
        setOriginalPlate(v.plate_normalized);
        setOwnerId(v.customer_id);
        setOwnerName(v.customers.full_name);
      });
    } else if (customerId) {
      supabase.from("customers").select("full_name").eq("id", customerId).single().then(({ data }) => setOwnerName(data?.full_name ?? ""));
    }
  }, [editing, vehicleId, customerId]);

  // Verifica duplicidade assim que a placa fica completa
  useEffect(() => {
    const p = form.plate;
    if (!isValidPlate(p) || p === originalPlate) { setDuplicate(null); return; }
    let alive = true;
    supabase.from("vehicles").select("id").eq("plate_normalized", p).maybeSingle()
      .then(({ data }) => alive && setDuplicate(data ?? null));
    return () => { alive = false; };
  }, [form.plate, originalPlate]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const year = (s: string, max: number) => (s && (Number(s) < 1950 || Number(s) > max) ? `Ano entre 1950 e ${max}.` : null);
  const errs = {
    plate: !isValidPlate(form.plate) ? "Placa inválida. Use ABC1234 ou ABC1D23." : null,
    brand: !form.brand.trim() ? "Informe a marca." : null,
    model: !form.model.trim() ? "Informe o modelo." : null,
    year_manufacture: year(form.year_manufacture, YEAR_MAX - 1),
    year_model: year(form.year_model, YEAR_MAX)
      ?? (form.year_manufacture && form.year_model && Number(form.year_model) < Number(form.year_manufacture)
        ? "Ano do modelo não pode ser anterior ao de fabricação." : null),
  };
  const hasErr = Object.values(errs).some(Boolean) || !!duplicate;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (hasErr || !ownerId) return;
    setBusy(true); setError(null);
    const payload = {
      plate: form.plate, brand: form.brand.trim(), model: form.model.trim(),
      year_manufacture: form.year_manufacture ? Number(form.year_manufacture) : null,
      year_model: form.year_model ? Number(form.year_model) : null,
      color: form.color.trim() || null, vehicle_type: form.vehicle_type, notes: form.notes.trim() || null,
    };
    const res = editing
      ? await supabase.from("vehicles").update(payload).eq("id", vehicleId).select("id").single()
      : await supabase.from("vehicles").insert({ ...payload, customer_id: ownerId }).select("id").single();
    setBusy(false);
    if (res.error) { setError(friendlyError(res.error)); return; }
    toast("ok", editing ? "Veículo atualizado." : "Veículo cadastrado.");
    navigate(`/sistema/veiculos/${res.data.id}`, { replace: true });
  }

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>{editing ? "Editar veículo" : "Novo veículo"}</h1>
        {ownerName && <p className="muted">Cliente: {ownerName}</p>}
      </header>
      <form onSubmit={submit} noValidate className="form">
        <TextField label="Placa" value={form.plate} onChange={(e) => set("plate")(normalizePlate(e.target.value).slice(0, 7))}
          required autoCapitalize="characters" spellCheck={false} className="input-plate"
          error={touched ? errs.plate : null} hint="Letras e números, sem hífen." />
        {duplicate && (
          <div className="notice notice-warn" role="alert">
            A placa {formatPlate(form.plate)} já está cadastrada.{" "}
            <Link to={`/sistema/veiculos/${duplicate.id}`}>Abrir histórico deste veículo</Link>
          </div>
        )}
        <div className="grid-2">
          <TextField label="Marca" value={form.brand} onChange={(e) => set("brand")(e.target.value)} required error={touched ? errs.brand : null} />
          <TextField label="Modelo" value={form.model} onChange={(e) => set("model")(e.target.value)} required error={touched ? errs.model : null} />
          <TextField label="Ano de fabricação" inputMode="numeric" value={form.year_manufacture}
            onChange={(e) => set("year_manufacture")(e.target.value.replace(/\D/g, "").slice(0, 4))} error={touched ? errs.year_manufacture : null} />
          <TextField label="Ano do modelo" inputMode="numeric" value={form.year_model}
            onChange={(e) => set("year_model")(e.target.value.replace(/\D/g, "").slice(0, 4))} error={touched ? errs.year_model : null} />
          <TextField label="Cor" value={form.color} onChange={(e) => set("color")(e.target.value)} />
          <SelectField label="Tipo" value={form.vehicle_type} onChange={(e) => set("vehicle_type")(e.target.value)}>
            {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelectField>
        </div>
        <TextArea label="Observações" value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !!duplicate}>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar veículo"}</button>
        </div>
      </form>
    </div>
  );
}
