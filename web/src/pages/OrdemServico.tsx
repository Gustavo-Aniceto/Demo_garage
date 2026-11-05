import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatDateTime, formatPlate } from "../lib/format";
import { usePhotoCategories, useStaff } from "../lib/data";
import { OS_STATUS } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { PendingBanner } from "../components/PhotoCapture";
import { PhotoGallery } from "../components/PhotoGallery";
import { useOs } from "./os/useOs";
import { Resumo } from "./os/Resumo";
import { Diagnostico } from "./os/Diagnostico";
import { Orcamento } from "./os/Orcamento";
import { Execucao } from "./os/Execucao";
import { Saida } from "./os/Saida";

const TABS = [
  { id: "resumo", label: "Resumo" }, { id: "diagnostico", label: "Diagnóstico" }, { id: "orcamento", label: "Orçamento" },
  { id: "execucao", label: "Execução" }, { id: "saida", label: "Saída" }, { id: "fotos", label: "Fotos" },
  { id: "historico", label: "Histórico" }, { id: "documentos", label: "Documentos" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function OrdemServico() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "resumo";
  const { data: b, error, reload } = useOs(id);
  const staff = useStaff();
  const categories = usePhotoCategories();
  const [, force] = useState(0);

  if (error) return <div className="page"><p className="form-error">{error}</p></div>;
  if (!b) return <div className="page"><p className="muted">Carregando…</p></div>;
  const v = b.os.vehicles;

  return (
    <div className="page">
      <header className="os-head">
        <div>
          <h1>{b.os.number}</h1>
          <p className="muted">
            <Link to={`/sistema/veiculos/${v.id}`} className="plate-chip">{formatPlate(v.plate_normalized)}</Link>{" "}
            {v.brand} {v.model}, <Link to={`/sistema/clientes/${b.os.customers.id}`}>{b.os.customers.full_name}</Link>
          </p>
          <p className="muted small">Aberta em {formatDateTime(b.os.opened_at)}{b.os.closed_at ? `, encerrada em ${formatDateTime(b.os.closed_at)}` : ""}</p>
        </div>
        <StatusBadge status={b.os.status} />
      </header>

      {!b.os.checkin_completed_at && b.os.status !== "cancelado" && (
        <div className="notice notice-warn">Check-in não concluído. <Link to={`/sistema/checkin/${b.os.id}`}>Continuar check-in</Link></div>
      )}
      <PendingBanner osId={b.os.id} />

      <nav className="tabs" aria-label="Seções da OS">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}
            onClick={() => { setParams({ aba: t.id }, { replace: true }); force((n) => n + 1); }}>{t.label}</button>
        ))}
      </nav>

      {tab === "resumo" && <Resumo b={b} staff={staff} reload={reload} />}
      {tab === "diagnostico" && <Diagnostico b={b} staff={staff} reload={reload} />}
      {tab === "orcamento" && <Orcamento b={b} staff={staff} reload={reload} />}
      {tab === "execucao" && <Execucao b={b} staff={staff} reload={reload} />}
      {tab === "saida" && <Saida b={b} staff={staff} reload={reload} />}
      {tab === "fotos" && <PhotoGallery photos={b.photos} categories={categories} staff={staff} />}
      {tab === "historico" && (
        <ol className="timeline">
          {b.events.map((e) => (
            <li key={e.id}>
              <span className="muted small">{formatDateTime(e.created_at)}</span>
              <span>{e.from_status ? `${OS_STATUS[e.from_status].label} para ` : "Aberta como "}<strong>{OS_STATUS[e.to_status].label}</strong></span>
              <span className="muted small">{e.actor_id ? staff[e.actor_id] ?? "" : ""}</span>
            </li>
          ))}
        </ol>
      )}
      {tab === "documentos" && (
        <ul className="list">
          {[["checkin", "Ficha de entrada (check-in)"], ["inspecao", "Relatório de inspeção e diagnóstico"], ["orcamento", "Orçamento"],
            ["os", "Ordem de serviço completa"], ["checkout", "Relatório de saída (check-out)"]].map(([k, l]) => (
            <li key={k}><Link className="list-row" to={`/sistema/os/${b.os.id}/documento/${k}`}><span className="list-title">{l}</span><span className="muted small">Abrir para PDF</span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
