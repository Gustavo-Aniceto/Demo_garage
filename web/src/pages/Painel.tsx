import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { friendlyError } from "../lib/errors";
import { formatDateTime, formatPlate } from "../lib/format";
import type { ActivityRow, DashboardSummary } from "../lib/types";
import { PlateSearch } from "../components/PlateSearch";
import { StatusBadge } from "../components/StatusBadge";

const TILES: { key: keyof DashboardSummary; label: string; tone: string }[] = [
  { key: "em_atendimento", label: "Veículos em atendimento", tone: "neutral" },
  { key: "aguardando_diagnostico", label: "Aguardando diagnóstico", tone: "wait" },
  { key: "orcamentos_pendentes", label: "Orçamentos pendentes", tone: "wait" },
  { key: "orcamentos_aprovados", label: "Orçamentos aprovados", tone: "work" },
  { key: "em_execucao", label: "Serviços em execução", tone: "work" },
  { key: "prontos_retirada", label: "Prontos para entrega", tone: "ready" },
  { key: "concluidas", label: "OS concluídas", tone: "done" },
];

export function Painel() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [s, a] = await Promise.all([
      supabase.rpc("dashboard_summary"),
      supabase.rpc("recent_activity", { p_limit: 12 }),
    ]);
    if (s.error || a.error) { setError(friendlyError(s.error ?? a.error)); return; }
    setSummary((s.data as DashboardSummary[])[0] ?? null);
    setActivity(a.data as ActivityRow[]);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Bom trabalho, {profile?.full_name.split(" ")[0]}</h1>
      </header>

      <section className="panel panel-plate">
        <PlateSearch />
      </section>

      {error && (
        <div className="form-error" role="alert">
          {error} <button className="btn btn-link" onClick={load}>Tentar de novo</button>
        </div>
      )}

      <section aria-labelledby="h-patio">
        <h2 id="h-patio" className="section-title">Pátio agora</h2>
        <div className="board">
          {TILES.map((t) => (
            <div key={t.key} className={`tile tile-${t.tone}`}>
              <span className="tile-value">{summary ? summary[t.key] : "–"}</span>
              <span className="tile-label">{t.label}</span>
            </div>
          ))}
        </div>
        {summary && summary.checkins_rascunho > 0 && (
          <p className="muted small">{summary.checkins_rascunho} check-in(s) iniciados e ainda não concluídos não entram na contagem.</p>
        )}
      </section>

      <section aria-labelledby="h-mov">
        <h2 id="h-mov" className="section-title">Últimas movimentações</h2>
        {activity.length === 0 ? (
          <p className="empty">Nenhuma movimentação ainda. Os check-ins e mudanças de status aparecerão aqui.</p>
        ) : (
          <ul className="feed">
            {activity.map((a, i) => (
              <li key={`${a.service_order_id}-${a.created_at}-${i}`} className="feed-item">
                <span className="plate-chip">{formatPlate(a.plate)}</span>
                <div className="feed-main">
                  <p><strong>{a.os_number}</strong> {a.vehicle}</p>
                  <p className="muted small">{formatDateTime(a.created_at)}{a.actor_name ? `, por ${a.actor_name}` : ""}</p>
                </div>
                <StatusBadge status={a.to_status} />
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
