import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import { isValidCpf, isValidPhone, maskCpf, maskPhone, onlyDigits } from "../lib/format";
import type { Customer } from "../lib/types";
import { TextArea, TextField } from "../components/Field";
import { useToast } from "../components/Toast";

export function ClienteForm() {
  const { id } = useParams();
  const editing = !!id;
  const [params] = useSearchParams();
  const placa = params.get("placa");
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ full_name: "", phone: "", email: "", cpf: "", notes: "" });
  const [showCpf, setShowCpf] = useState(false);
  const [loaded, setLoaded] = useState(!editing);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    supabase.from("customers").select("*").eq("id", id).single().then(({ data, error: err }) => {
      if (err) { setError(friendlyError(err)); return; }
      const c = data as Customer;
      setForm({ full_name: c.full_name, phone: maskPhone(c.phone), email: c.email ?? "", cpf: c.cpf ? maskCpf(c.cpf) : "", notes: c.notes ?? "" });
      setShowCpf(!!c.cpf);
      setLoaded(true);
    });
  }, [editing, id]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const errs = {
    full_name: form.full_name.trim().length < 2 ? "Informe o nome completo." : null,
    phone: !isValidPhone(form.phone) ? "Informe DDD + número." : null,
    email: form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) ? "E-mail inválido." : null,
    cpf: form.cpf && !isValidCpf(form.cpf) ? "CPF inválido." : null,
  };
  const hasErr = Object.values(errs).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (hasErr) return;
    setBusy(true); setError(null);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone,
      email: form.email.trim() || null,
      cpf: form.cpf ? onlyDigits(form.cpf) : null,
      notes: form.notes.trim() || null,
    };
    const res = editing
      ? await supabase.from("customers").update(payload).eq("id", id).select("id").single()
      : await supabase.from("customers").insert(payload).select("id").single();
    setBusy(false);
    if (res.error) { setError(friendlyError(res.error)); return; }
    toast("ok", editing ? "Cliente atualizado." : "Cliente cadastrado.");
    const newId = res.data.id as string;
    navigate(placa && !editing ? `/sistema/clientes/${newId}/veiculos/novo?placa=${placa}` : `/sistema/clientes/${newId}`, { replace: true });
  }

  if (!loaded) return <div className="page"><p className="muted">{error ?? "Carregando…"}</p></div>;

  return (
    <div className="page page-narrow">
      <header className="page-head"><h1>{editing ? "Editar cliente" : "Novo cliente"}</h1></header>
      <form onSubmit={submit} noValidate className="form">
        <TextField label="Nome completo" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)}
          required autoComplete="off" error={touched ? errs.full_name : null} />
        <TextField label="Telefone / WhatsApp" value={form.phone} onChange={(e) => set("phone")(maskPhone(e.target.value))}
          required inputMode="tel" placeholder="(11) 90000-0000" error={touched ? errs.phone : null} />
        <TextField label="E-mail" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)}
          inputMode="email" hint="Opcional." error={touched ? errs.email : null} />
        {showCpf ? (
          <TextField label="CPF" value={form.cpf} onChange={(e) => set("cpf")(maskCpf(e.target.value))} inputMode="numeric"
            hint="Preencha somente se for necessário para a operação (ex.: nota fiscal)." error={touched ? errs.cpf : null} />
        ) : (
          <button type="button" className="btn btn-link" onClick={() => setShowCpf(true)}>Adicionar CPF (somente se necessário)</button>
        )}
        <TextArea label="Observações" value={form.notes} onChange={(e) => set("notes")(e.target.value)} hint="Apenas informações úteis ao atendimento." />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar cliente"}</button>
        </div>
      </form>
    </div>
  );
}
