import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useDebounced } from "../lib/hooks";
import { friendlyError } from "../lib/errors";
import { formatPlate, isValidPlate } from "../lib/format";
import type { CustomerSearchRow } from "../lib/types";

export function Clientes() {
  const [params] = useSearchParams();
  const placa = params.get("placa");
  const pendingPlate = placa && isValidPlate(placa) ? placa : null;
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [rows, setRows] = useState<CustomerSearchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    supabase.rpc("search_customers", { p_query: dq, p_limit: 50 }).then(({ data, error: err }) => {
      if (!alive) return;
      if (err) { setError(friendlyError(err)); return; }
      setError(null);
      setRows(data as CustomerSearchRow[]);
    });
    return () => { alive = false; };
  }, [dq]);

  const target = (id: string) =>
    pendingPlate ? `/sistema/clientes/${id}/veiculos/novo?placa=${pendingPlate}` : `/sistema/clientes/${id}`;

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <h1>Clientes</h1>
        <button className="btn btn-primary" onClick={() => navigate(`/sistema/clientes/novo${pendingPlate ? `?placa=${pendingPlate}` : ""}`)}>
          Novo cliente
        </button>
      </header>

      {pendingPlate && (
        <div className="notice">
          Para cadastrar a placa <span className="plate-chip">{formatPlate(pendingPlate)}</span>, escolha o dono abaixo ou cadastre um novo cliente.
        </div>
      )}

      <div className="field">
        <label htmlFor="busca-cliente">Buscar por nome, telefone ou placa</label>
        <input id="busca-cliente" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Maria, 90000 ou ABC1D23" autoFocus />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {rows === null && !error && <p className="muted">Carregando…</p>}
      {rows?.length === 0 && (
        <p className="empty">{dq ? "Nenhum cliente encontrado. Confira a grafia ou cadastre um novo cliente." : "Nenhum cliente cadastrado ainda."}</p>
      )}

      {rows && rows.length > 0 && (
        <ul className="list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link to={target(c.id)} className="list-row">
                <div>
                  <p className="list-title">{c.full_name}</p>
                  <p className="muted small">{c.phone}</p>
                </div>
                <div className="chips">
                  {c.plates.map((p) => <span key={p} className="plate-chip">{formatPlate(p)}</span>)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
