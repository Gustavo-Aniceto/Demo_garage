import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import { formatDate, formatPlate, maskCpf } from "../lib/format";
import type { Customer, Vehicle } from "../lib/types";

export function ClienteDetalhe() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useAuth();
  const toast = useToast();
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  async function anonymize() {
    setBusy(true);
    const { error: e } = await supabase.rpc("anonymize_customer", { p_customer: id });
    setBusy(false); setAnon(false);
    if (e) toast("error", friendlyError(e)); else { toast("ok", "Dados pessoais removidos. Histórico técnico mantido."); setTick(tick + 1); }
  }

  useEffect(() => {
    Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("vehicles").select("*").eq("customer_id", id).order("created_at"),
    ]).then(([c, v]) => {
      if (c.error || v.error) { setError(friendlyError(c.error ?? v.error)); return; }
      setCustomer(c.data as Customer);
      setVehicles(v.data as Vehicle[]);
    });
  }, [id, tick]);

  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!customer) return <div className="page"><p className="muted">Carregando…</p></div>;
  const waLink = `https://wa.me/55${customer.phone.replace(/\D/g, "")}`;

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <h1>{customer.full_name}</h1>
        <Link className="btn btn-secondary" to={`/sistema/clientes/${customer.id}/editar`}>Editar dados</Link>
      </header>

      <dl className="facts">
        <div><dt>Telefone</dt><dd>{customer.phone} <a className="wa" href={waLink} target="_blank" rel="noopener noreferrer">WhatsApp</a></dd></div>
        {customer.email && <div><dt>E-mail</dt><dd>{customer.email}</dd></div>}
        {customer.cpf && <div><dt>CPF</dt><dd>{maskCpf(customer.cpf)}</dd></div>}
        <div><dt>Cliente desde</dt><dd>{formatDate(customer.created_at)}</dd></div>
        {customer.notes && <div className="facts-wide"><dt>Observações</dt><dd>{customer.notes}</dd></div>}
      </dl>

      <section>
        <div className="page-head-row">
          <h2 className="section-title">Veículos</h2>
          <Link className="btn btn-primary" to={`/sistema/clientes/${customer.id}/veiculos/novo`}>Adicionar veículo</Link>
        </div>
        {vehicles.length === 0 ? (
          <p className="empty">Nenhum veículo cadastrado para este cliente.</p>
        ) : (
          <ul className="list">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Link to={`/sistema/veiculos/${v.id}`} className="list-row">
                  <span className="plate-chip">{formatPlate(v.plate_normalized)}</span>
                  <div className="list-grow">
                    <p className="list-title">{v.brand} {v.model}</p>
                    <p className="muted small">{[v.year_model, v.color].filter(Boolean).join(", ") || "—"}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile?.role === "master" && customer.full_name !== "Cliente anonimizado" && (
        <section className="panel danger-zone">
          <h2 className="section-title">Dados pessoais (LGPD)</h2>
          <p className="muted">Atende pedidos de exclusão: remove nome, telefone, e-mail, CPF e observações, inclusive da auditoria. O histórico técnico dos veículos continua.</p>
          <button className="btn btn-danger-ghost" onClick={() => setAnon(true)}>Anonimizar este cliente</button>
        </section>
      )}
      <ConfirmDialog open={anon} title={`Anonimizar ${customer.full_name}?`} confirmLabel="Anonimizar definitivamente" danger busy={busy}
        onClose={() => setAnon(false)} onConfirm={anonymize}>
        <p>Esta ação não pode ser desfeita. Os dados pessoais serão apagados de todas as ordens de serviço e da auditoria.</p>
      </ConfirmDialog>
    </div>
  );
}
