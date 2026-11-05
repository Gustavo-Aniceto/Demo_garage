import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import type {
  CheckinInspection, CheckoutRow, Diagnostic, InspectionItemRow, OsEvent, PerformedService, Quote,
  ServiceOrderFull, VehiclePhoto,
} from "../../lib/types";

export interface OsBundle {
  os: ServiceOrderFull;
  inspection: (CheckinInspection & { checkin_inspection_items: InspectionItemRow[] }) | null;
  diagnostics: Diagnostic[];
  quotes: Quote[];
  services: PerformedService[];
  checkout: CheckoutRow | null;
  events: OsEvent[];
  photos: VehiclePhoto[];
}

export async function fetchOs(id: string): Promise<OsBundle> {
  const [os, ins, dia, quo, ser, chk, ev, ph] = await Promise.all([
    supabase.from("service_orders").select("*, vehicles(*), customers(*)").eq("id", id).single(),
    supabase.from("checkin_inspections").select("*, checkin_inspection_items(*)").eq("service_order_id", id).maybeSingle(),
    supabase.from("diagnostics").select("*, diagnostic_defects(*)").eq("service_order_id", id).order("performed_at"),
    supabase.from("quotes").select("*, quote_items(*)").eq("service_order_id", id).order("version"),
    supabase.from("performed_services").select("*").eq("service_order_id", id).order("performed_at"),
    supabase.from("checkouts").select("*").eq("service_order_id", id).maybeSingle(),
    supabase.from("service_order_events").select("*").eq("service_order_id", id).order("created_at"),
    supabase.from("vehicle_photos").select("*").eq("service_order_id", id).order("taken_at"),
  ]);
  const err = [os, ins, dia, quo, ser, chk, ev, ph].find((r) => r.error)?.error;
  if (err) throw err;
  const quotes = (quo.data as Quote[]).map((q) => ({
    ...q, quote_items: [...(q.quote_items ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.description.localeCompare(b.description)),
  }));
  return {
    os: os.data as ServiceOrderFull,
    inspection: ins.data as OsBundle["inspection"],
    diagnostics: dia.data as Diagnostic[],
    quotes,
    services: ser.data as PerformedService[],
    checkout: chk.data as CheckoutRow | null,
    events: ev.data as OsEvent[],
    photos: ph.data as VehiclePhoto[],
  };
}

export function useOs(id: string | undefined) {
  const [data, setData] = useState<OsBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!id) return;
    try { setData(await fetchOs(id)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [id]);
  useEffect(() => {
    reload();
    const h = (e: Event) => { if ((e as CustomEvent).detail?.osId === id) reload(); };
    window.addEventListener("oficina:photo-saved", h);
    return () => window.removeEventListener("oficina:photo-saved", h);
  }, [id, reload]);
  return { data, error, reload };
}

export const isClosed = (s: string) => s === "entregue" || s === "cancelado";
