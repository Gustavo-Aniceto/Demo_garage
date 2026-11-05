import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isValidPhone, maskPhone, normalizePlate } from "../lib/format";
import { OFICINA, SERVICOS, whatsappLink } from "../lib/oficina";
import { SelectField, TextArea, TextField } from "../components/Field";

export function SiteContato() {
  const [params] = useSearchParams();
  const [f, setF] = useState({
    request_type: "orcamento" as "orcamento" | "agendamento" | "contato", name: "", phone: "", plate: "", brand_model: "",
    service: params.get("servico") ?? "", description: "", preferred_period: "", lgpd: false, empresa: "",
  });
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF({ ...f, [k]: v });

  const errs = {
    name: f.name.trim().length < 2 ? "Informe seu nome." : null,
    phone: !isValidPhone(f.phone) ? "Informe DDD + número." : null,
    lgpd: !f.lgpd ? "Precisamos da sua autorização para entrar em contato." : null,
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    if (f.empresa) { setState("sent"); return; } // armadilha para robôs
    setState("busy"); setError(null);
    const { error: err } = await supabase.from("contact_requests").insert({
      request_type: f.request_type, name: f.name.trim(), phone: f.phone, plate: f.plate ? normalizePlate(f.plate).slice(0, 10) : null,
      brand_model: f.brand_model.trim() || null, service: f.service || null, description: f.description.trim() || null,
      preferred_period: f.preferred_period.trim() || null, lgpd_consent: true,
    });
    if (err) {
      setState("idle");
      setError(err.code === "54000" ? err.message : navigator.onLine ? "Não foi possível enviar agora. Tente de novo ou chame no WhatsApp." : "Sem conexão com a internet. Tente de novo ou chame no WhatsApp.");
      return;
    }
    setState("sent");
  }

  return (
    <section className="site-section site-page contact-grid">
      <div>
        <h1>Contato e orçamento</h1>
        <dl className="contact-info">
          <div><dt>Endereço</dt><dd>{OFICINA.endereco}, {OFICINA.bairro}, CEP {OFICINA.cep}<br /><a href={OFICINA.mapsUrl} target="_blank" rel="noopener noreferrer">Abrir no mapa</a></dd></div>
          <div><dt>Telefone e WhatsApp</dt><dd><a href={`tel:+${OFICINA.whatsapp}`}>{OFICINA.telefone}</a></dd></div>
          <div><dt>Horário</dt><dd>{OFICINA.horario.map((h) => <span key={h.dias}>{h.dias}: {h.horas}<br /></span>)}</dd></div>
          <div><dt>Pagamento</dt><dd>{OFICINA.pagamentos.join(", ")}</dd></div>
        </dl>
        <a className="btn btn-secondary" href={whatsappLink()} target="_blank" rel="noopener noreferrer">Prefiro conversar no WhatsApp</a>
      </div>

      <div className="panel">
        {state === "sent" ? (
          <div className="sent" role="status">
            <h2>Pedido recebido</h2>
            <p>Obrigado, {f.name.split(" ")[0] || "cliente"}. Este é um <strong>pedido</strong>, ainda não um horário confirmado. Vamos responder pelo telefone informado em horário comercial.</p>
            <a className="btn btn-primary" href={whatsappLink(`Olá! Acabei de enviar um pedido pelo site em nome de ${f.name}.`)} target="_blank" rel="noopener noreferrer">Avisar no WhatsApp</a>
          </div>
        ) : (
          <form className="form" onSubmit={submit} noValidate>
            <h2>Pedir orçamento ou agendamento</h2>
            <fieldset className="seg seg-wide" aria-label="Tipo de pedido">
              {[["orcamento", "Orçamento"], ["agendamento", "Agendamento"], ["contato", "Dúvida"]].map(([v, l]) => (
                <label key={v} className={f.request_type === v ? "on" : ""}><input type="radio" name="tipo" checked={f.request_type === v} onChange={() => set("request_type")(v)} />{l}</label>
              ))}
            </fieldset>
            <TextField label="Nome" value={f.name} onChange={(e) => set("name")(e.target.value)} autoComplete="name" required error={touched ? errs.name : null} />
            <TextField label="Telefone / WhatsApp" value={f.phone} onChange={(e) => set("phone")(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel" required error={touched ? errs.phone : null} />
            <div className="grid-2">
              <TextField label="Placa" value={f.plate} onChange={(e) => set("plate")(e.target.value.toUpperCase().slice(0, 8))} hint="Se tiver em mãos." autoCapitalize="characters" />
              <TextField label="Marca e modelo" value={f.brand_model} onChange={(e) => set("brand_model")(e.target.value)} placeholder="Ex.: Fiat Argo 2021" />
            </div>
            <SelectField label="Serviço" value={f.service} onChange={(e) => set("service")(e.target.value)}>
              <option value="">Não sei / outro</option>
              {SERVICOS.map((s) => <option key={s.slug} value={s.nome}>{s.nome}</option>)}
            </SelectField>
            <TextArea label="O que está acontecendo?" value={f.description} onChange={(e) => set("description")(e.target.value)} maxLength={2000} placeholder="Ex.: barulho ao frear, luz da injeção acesa" />
            {f.request_type === "agendamento" && (
              <TextField label="Data ou período de preferência" value={f.preferred_period} onChange={(e) => set("preferred_period")(e.target.value)} placeholder="Ex.: terça de manhã" hint="Confirmamos o horário com você antes." />
            )}
            <div className="hp" aria-hidden><label>Empresa <input tabIndex={-1} autoComplete="off" value={f.empresa} onChange={(e) => set("empresa")(e.target.value)} /></label></div>
            <label className="check"><input type="checkbox" checked={f.lgpd} onChange={(e) => set("lgpd")(e.target.checked)} />
              Autorizo a {OFICINA.nome} a usar estes dados só para responder a este pedido.</label>
            {touched && errs.lgpd && <p className="field-error">{errs.lgpd}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-lg btn-block" disabled={state === "busy"}>{state === "busy" ? "Enviando…" : "Enviar pedido"}</button>
          </form>
        )}
      </div>
    </section>
  );
}
