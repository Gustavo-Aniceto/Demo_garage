import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { formatDate, formatDateTime, formatPlate, maskCpf } from "../lib/format";
import { brl, usePhotoCategories, useStaff } from "../lib/data";
import {
  APPROVAL_METHODS, DEFECT_CATEGORIES, EXECUTION_STATUS, FUEL_LEVELS, INSPECTION_ITEMS, INSPECTION_RESULTS, ITEM_KINDS,
  OS_STATUS, QUOTE_STATUS, SEVERITIES, VEHICLE_TYPES, type Quote, type VehiclePhoto,
} from "../lib/types";
import { DocRow, DocShell, Signatures } from "../components/DocShell";
import { useOs, type OsBundle } from "./os/useOs";
import { OFICINA } from "../lib/oficina";

const TITLES: Record<string, string> = {
  checkin: "Ficha de entrada", inspecao: "Relatório de inspeção e diagnóstico", orcamento: "Orçamento",
  os: "Ordem de serviço", checkout: "Relatório de saída",
};

export function Documento() {
  const { id, tipo = "os" } = useParams();
  const { data: b, error } = useOs(id);
  const staff = useStaff();
  const categories = usePhotoCategories();
  const stagesFor: Record<string, string[]> = { checkin: ["checkin"], inspecao: ["checkin", "checkup"], orcamento: [], os: ["checkin", "checkup", "checkout"], checkout: ["checkout"] };
  const defaultSelected = useCallback((p: VehiclePhoto) => p.include_in_report && (tipo !== "os" || p.stage !== "checkup"), [tipo]);

  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!b) return <div className="page"><p className="muted">Carregando…</p></div>;
  const photos = b.photos.filter((p) => (stagesFor[tipo] ?? []).includes(p.stage));
  const quote = b.quotes.find((q) => q.status === "aprovado") ?? b.quotes[b.quotes.length - 1];

  return (
    <DocShell title={TITLES[tipo] ?? "Documento"} number={b.os.number} photos={photos} categories={categories} defaultSelected={defaultSelected}>
      <Partes b={b} />
      {(tipo === "checkin" || tipo === "inspecao" || tipo === "os") && <Entrada b={b} staff={staff} />}
      {(tipo === "inspecao" || tipo === "os") && <Diagnosticos b={b} staff={staff} />}
      {(tipo === "orcamento" || tipo === "os") && quote && <OrcamentoDoc q={quote} staff={staff} />}
      {(tipo === "os" || tipo === "checkout") && <Servicos b={b} />}
      {(tipo === "os" || tipo === "checkout") && <SaidaDoc b={b} staff={staff} />}
      {tipo === "checkout" && quote?.status === "aprovado" && <OrcamentoTotal q={quote} />}
      {tipo === "checkin" && <>
        <p className="doc-note">O cliente declara ciência das condições do veículo descritas acima no momento do recebimento. Este documento não é orçamento nem autorização de serviço.</p>
        <Signatures left="Cliente" right={`Responsável ${OFICINA.nome}`} />
      </>}
      {tipo === "orcamento" && <>
        <p className="doc-note">Nenhum serviço é executado sem autorização registrada. Serviços adicionais exigem nova aprovação.</p>
        <Signatures left="Cliente (aprovação)" right={`Responsável ${OFICINA.nome}`} />
      </>}
      {tipo === "checkout" && <Signatures left="Cliente (retirada)" right="Responsável pela liberação" />}
    </DocShell>
  );
}

function Partes({ b }: { b: OsBundle }) {
  const v = b.os.vehicles, c = b.os.customers;
  return (
    <section className="doc-section doc-grid2">
      <div><h2>Cliente</h2><dl>
        <DocRow label="Nome" value={c.full_name} /><DocRow label="Telefone" value={c.phone} />
        <DocRow label="E-mail" value={c.email} /><DocRow label="CPF" value={c.cpf ? maskCpf(c.cpf) : null} />
      </dl></div>
      <div><h2>Veículo</h2><dl>
        <DocRow label="Placa" value={formatPlate(v.plate_normalized)} /><DocRow label="Marca / modelo" value={`${v.brand} ${v.model}`} />
        <DocRow label="Ano" value={v.year_manufacture || v.year_model ? `${v.year_manufacture ?? "—"}/${v.year_model ?? "—"}` : null} />
        <DocRow label="Cor" value={v.color} /><DocRow label="Tipo" value={VEHICLE_TYPES.find((t) => t.value === v.vehicle_type)?.label} />
        <DocRow label="Status da OS" value={OS_STATUS[b.os.status].label} />
      </dl></div>
    </section>
  );
}

function Entrada({ b, staff }: { b: OsBundle; staff: Record<string, string> }) {
  const i = b.inspection;
  if (!i) return null;
  return (
    <section className="doc-section">
      <h2>Entrada</h2>
      <dl className="doc-grid2">
        <DocRow label="Data e hora" value={formatDateTime(i.entered_at)} />
        <DocRow label="Quilometragem" value={`${i.km_in.toLocaleString("pt-BR")} km`} />
        <DocRow label="Combustível" value={FUEL_LEVELS.find((f) => f.value === i.fuel_level)?.label ?? "Não verificado"} />
        <DocRow label="Responsável" value={staff[i.responsible_id]} />
      </dl>
      <dl>
        <DocRow label="Motivo da visita" value={i.visit_reason} />
        <DocRow label="Relato do cliente" value={i.customer_complaint} />
        <DocRow label="Luzes no painel" value={i.dashboard_lights.join(", ")} />
        <DocRow label="Alertas informados pelo cliente" value={i.customer_reported_alerts} />
        <DocRow label="Dificuldade na partida (cliente)" value={i.starting_difficulty == null ? null : i.starting_difficulty ? "Sim" : "Não"} />
        <DocRow label="Ruídos relatados" value={i.noises_reported} />
        <DocRow label="Vibrações relatadas" value={i.vibrations_reported} />
        <DocRow label="Vazamentos (constatado)" value={i.leaks_observed} />
        <DocRow label="Constatações do funcionário" value={i.staff_observations} />
        <DocRow label="Itens recebidos" value={i.accessories_received} />
        <DocRow label="Ciência do cliente" value={i.customer_ack ? `${i.customer_ack_name}, via ${APPROVAL_METHODS.find((m) => m.value === i.customer_ack_method)?.label}` : "Não registrada"} />
      </dl>
      <table className="doc-table"><thead><tr><th>Item inspecionado</th><th>Resultado</th><th>Observação</th></tr></thead>
        <tbody>{INSPECTION_ITEMS.map((d) => {
          const it = i.checkin_inspection_items.find((x) => x.item_code === d.code);
          return it ? <tr key={d.code} className={it.result === "com_avaria" ? "doc-alert" : ""}><td>{d.label}</td>
            <td>{INSPECTION_RESULTS.find((r) => r.value === it.result)?.label}</td><td>{it.notes}</td></tr> : null;
        })}</tbody></table>
    </section>
  );
}

function Diagnosticos({ b, staff }: { b: OsBundle; staff: Record<string, string> }) {
  if (!b.diagnostics.length) return <section className="doc-section"><h2>Diagnóstico</h2><p>Não registrado.</p></section>;
  return (
    <section className="doc-section">
      <h2>Diagnóstico</h2>
      {b.diagnostics.map((d) => (
        <div key={d.id} className="doc-block">
          <p className="small">{formatDateTime(d.performed_at)}, {staff[d.mechanic_id] ?? ""}</p>
          {d.diagnostic_defects && d.diagnostic_defects.length > 0 && (
            <ul>{d.diagnostic_defects.map((x) => <li key={x.id}><strong>{DEFECT_CATEGORIES.find((c) => c.value === x.category)?.label}</strong> ({SEVERITIES.find((s) => s.value === x.severity)?.label}): {x.description}</li>)}</ul>
          )}
          <dl>
            <DocRow label="Sintomas" value={d.symptoms} /><DocRow label="Testes realizados" value={d.tests_performed} />
            <DocRow label="Diagnóstico técnico" value={d.technical_diagnosis} /><DocRow label="Serviços recomendados" value={d.recommended_services} />
            <DocRow label="Peças necessárias" value={d.required_parts} /><DocRow label="Observações" value={d.notes} />
            <DocRow label="Nova avaliação" value={d.needs_reevaluation ? "Necessária" : null} />
          </dl>
        </div>
      ))}
    </section>
  );
}

function OrcamentoDoc({ q, staff }: { q: Quote; staff: Record<string, string> }) {
  const items = q.quote_items ?? [];
  return (
    <section className="doc-section">
      <h2>Orçamento (versão {q.version}): {QUOTE_STATUS[q.status].label}</h2>
      <p className="small">Elaborado em {formatDate(q.prepared_at)} por {staff[q.prepared_by] ?? "—"}</p>
      <table className="doc-table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th>{q.status === "aprovado" && <th>Aprovado</th>}</tr></thead>
        <tbody>{items.map((i) => <tr key={i.id}><td>{ITEM_KINDS.find((k) => k.value === i.kind)?.label}</td><td>{i.description}</td>
          <td>{Number(i.quantity).toLocaleString("pt-BR")}</td><td>{brl(Number(i.unit_price))}</td><td>{brl(Number(i.total))}</td>
          {q.status === "aprovado" && <td>{i.approved ? "Sim" : "Não"}</td>}</tr>)}</tbody></table>
      <OrcamentoTotal q={q} />
      {q.status === "aprovado" && <p className="small">Aprovado por {q.approved_by_name} via {APPROVAL_METHODS.find((m) => m.value === q.approval_method)?.label} em {formatDateTime(q.approved_at)}.</p>}
    </section>
  );
}

function OrcamentoTotal({ q }: { q: Quote }) {
  const items = q.quote_items ?? [];
  const base = items.filter((i) => q.status !== "aprovado" || i.approved).reduce((s, i) => s + Number(i.total), 0);
  return (
    <dl className="doc-totals">
      <DocRow label={q.status === "aprovado" ? "Subtotal aprovado" : "Subtotal"} value={brl(base)} />
      {Number(q.discount_amount) > 0 && <DocRow label="Desconto" value={`− ${brl(Number(q.discount_amount))}`} />}
      <DocRow label="Total" value={<strong>{brl(Math.max(base - Number(q.discount_amount), 0))}</strong>} />
    </dl>
  );
}

function Servicos({ b }: { b: OsBundle }) {
  const by = (st: string) => b.services.filter((s) => s.status === st);
  const parts = by("executado").filter((s) => s.kind === "peca");
  return (
    <section className="doc-section">
      <h2>Serviços</h2>
      {b.services.length === 0 ? <p>Nenhum serviço registrado.</p> : (
        <table className="doc-table"><thead><tr><th>Descrição</th><th>Tipo</th><th>Qtd.</th><th>Situação</th><th>Obs.</th></tr></thead>
          <tbody>{b.services.map((s) => <tr key={s.id} className={s.status !== "executado" ? "doc-alert" : ""}><td>{s.description}</td>
            <td>{ITEM_KINDS.find((k) => k.value === s.kind)?.label}</td><td>{Number(s.quantity).toLocaleString("pt-BR")}</td>
            <td>{EXECUTION_STATUS.find((x) => x.value === s.status)?.label}</td><td>{s.notes}</td></tr>)}</tbody></table>
      )}
      {parts.length > 0 && <p className="small">Peças substituídas: {parts.map((p) => p.description).join(", ")}.</p>}
    </section>
  );
}

function SaidaDoc({ b, staff }: { b: OsBundle; staff: Record<string, string> }) {
  const c = b.checkout;
  if (!c) return <section className="doc-section"><h2>Saída</h2><p>Ainda não registrada.</p></section>;
  return (
    <section className="doc-section">
      <h2>Saída</h2>
      <dl className="doc-grid2">
        <DocRow label="Data de entrega" value={formatDateTime(c.checked_out_at)} />
        <DocRow label="Km entrada / saída" value={`${(b.inspection?.km_in ?? 0).toLocaleString("pt-BR")} / ${c.km_out.toLocaleString("pt-BR")} km`} />
        <DocRow label="Mecânico responsável" value={staff[c.mechanic_id]} />
        <DocRow label="Liberado por" value={staff[c.released_by]} />
        <DocRow label="Entregue a" value={c.delivered_to_name} />
      </dl>
      <dl>
        <DocRow label="Pendências / não executados" value={c.pending_items && <span className="pre">{c.pending_items}</span>} />
        <DocRow label="Recomendações futuras" value={c.future_recommendations && <span className="pre">{c.future_recommendations}</span>} />
        <DocRow label="Observações finais" value={c.final_notes && <span className="pre">{c.final_notes}</span>} />
      </dl>
    </section>
  );
}
