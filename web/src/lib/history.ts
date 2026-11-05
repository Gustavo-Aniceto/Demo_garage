import { supabase } from "./supabase";
import type { DefectCategory, ExecutionStatus, ItemKind, OsStatus, QuoteStatus } from "./types";

export interface HistoryOs {
  id: string; number: string; status: OsStatus; opened_at: string; closed_at: string | null; checkin_completed_at: string | null;
  opened_by: string | null;
  checkin_inspections: { km_in: number; entered_at: string; customer_complaint: string | null; visit_reason: string | null; responsible_id: string } | null;
  checkouts: { km_out: number; checked_out_at: string; pending_items: string | null; future_recommendations: string | null; mechanic_id: string } | null;
  diagnostics: { technical_diagnosis: string | null; mechanic_id: string; diagnostic_defects: { category: DefectCategory; description: string }[] }[];
  performed_services: { description: string; kind: ItemKind; status: ExecutionStatus; quantity: number }[];
  quotes: { status: QuoteStatus; version: number; discount_amount: number; quote_items: { total: number; approved: boolean }[] }[];
}

const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);

/** Histórico completo de um veículo: todas as OS com entrada, diagnóstico, serviços, orçamento e saída. */
export async function vehicleHistory(vehicleId: string): Promise<HistoryOs[]> {
  const { data, error } = await supabase.from("service_orders").select(`
    id, number, status, opened_at, closed_at, checkin_completed_at, opened_by,
    checkin_inspections(km_in, entered_at, customer_complaint, visit_reason, responsible_id),
    checkouts(km_out, checked_out_at, pending_items, future_recommendations, mechanic_id),
    diagnostics(technical_diagnosis, mechanic_id, diagnostic_defects(category, description)),
    performed_services(description, kind, status, quantity),
    quotes(status, version, discount_amount, quote_items(total, approved))`)
    .eq("vehicle_id", vehicleId).order("opened_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...(r as unknown as HistoryOs),
    checkin_inspections: one(r.checkin_inspections as never),
    checkouts: one(r.checkouts as never),
  }));
}

export function approvedTotal(os: HistoryOs): number | null {
  const q = os.quotes.find((x) => x.status === "aprovado");
  if (!q) return null;
  const s = q.quote_items.filter((i) => i.approved).reduce((a, i) => a + Number(i.total), 0);
  return Math.max(s - Number(q.discount_amount), 0);
}
