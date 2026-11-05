import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useDebounced } from "../lib/hooks";
import { friendlyError } from "../lib/errors";
import { formatDateTime, formatPlate } from "../lib/format";
import { OS_STATUS, type OsSearchRow, type OsStatus } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";

const PAGE = 30;

export function Ordens() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<OsStatus | "">("");
  const [order, setOrder] = useState<"recentes" | "antigas">("recentes");
  const [page, setPage] = useState(0);
  const dq = useDebounced(q, 300);
  const [rows, setRows] = useState<OsSearchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setPage(0); }, [dq, status]);
  useEffect(() => {
    let alive = true;
    supabase.rpc("search_service_orders", { p_query: dq, p_status: status || null, p_limit: PAGE + 1, p_offset: page * PAGE })
      .then(({ data, error: e }) => { if (!alive) return; if (e) setError(friendlyError(e)); else { setError(null); setRows(data as OsSearchRow[]); } });
    return () => { alive = false; };
  }, [dq, status, page]);

  const list = (rows ?? []).slice(0, PAGE);
  const sorted = order === "recentes" ? list : [...list].reverse();

  return (
    <div className="page">
      <header className="page-head"><h1>Ordens de serviço</h1></header>
      <div className="filters">
        <div className="field filters-grow">
          <label htmlFor="busca-os">Buscar por número, placa ou cliente</label>
          <input id="busca-os" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: 000014, ABC1D23 ou Maria" />
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value as OsStatus)}>
            <option value="">Todos</option>
            {(Object.keys(OS_STATUS) as OsStatus[]).map((s) => <option key={s} value={s}>{OS_STATUS[s].label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-ord">Ordem</label>
          <select id="f-ord" value={order} onChange={(e) => setOrder(e.target.value as "recentes" | "antigas")}>
            <option value="recentes">Mais recentes primeiro</option><option value="antigas">Mais antigas primeiro</option>
          </select>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {rows && list.length === 0 && <p className="empty">Nenhuma OS encontrada. Para abrir uma nova, busque a placa no painel.</p>}
      <ul className="list">
        {sorted.map((o) => (
          <li key={o.id}>
            <Link className="list-row" to={o.checkin_completed_at || o.status === "cancelado" ? `/sistema/os/${o.id}` : `/sistema/checkin/${o.id}`}>
              <span className="plate-chip">{formatPlate(o.plate)}</span>
              <div className="list-grow">
                <p className="list-title">{o.number} <span className="muted">{o.vehicle}</span></p>
                <p className="muted small">{o.customer_name}, aberta em {formatDateTime(o.opened_at)}{!o.checkin_completed_at && o.status !== "cancelado" ? ", check-in em andamento" : ""}</p>
              </div>
              <StatusBadge status={o.status} />
            </Link>
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anteriores</button>
        <button className="btn btn-secondary" disabled={(rows?.length ?? 0) <= PAGE} onClick={() => setPage(page + 1)}>Próximas</button>
      </div>
    </div>
  );
}
