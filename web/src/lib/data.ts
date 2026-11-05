import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { PhotoCategory, StaffMember, VehiclePhoto } from "./types";

let staffCache: StaffMember[] | null = null;
export function useStaff(): Record<string, string> {
  const [list, setList] = useState<StaffMember[]>(staffCache ?? []);
  useEffect(() => {
    if (staffCache) return;
    supabase.rpc("staff_directory").then(({ data }) => { staffCache = (data ?? []) as StaffMember[]; setList(staffCache); });
  }, []);
  return Object.fromEntries(list.map((s) => [s.id, s.full_name]));
}
export function useStaffList(): StaffMember[] {
  const [list, setList] = useState<StaffMember[]>(staffCache ?? []);
  useEffect(() => {
    supabase.rpc("staff_directory").then(({ data }) => { staffCache = (data ?? []) as StaffMember[]; setList(staffCache); });
  }, []);
  return list;
}

let catCache: PhotoCategory[] | null = null;
export function usePhotoCategories(): PhotoCategory[] {
  const [cats, setCats] = useState<PhotoCategory[]>(catCache ?? []);
  useEffect(() => {
    if (catCache) return;
    supabase.from("photo_categories").select("*").eq("active", true).order("sort_order").then(({ data }) => {
      catCache = (data ?? []) as PhotoCategory[]; setCats(catCache);
    });
  }, []);
  return cats;
}

/** Fotos já salvas na nuvem para uma OS (recarrega quando a fila confirma um envio). */
export function useOsPhotos(osId: string | null) {
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const reload = useCallback(async () => {
    if (!osId) return;
    const { data } = await supabase.from("vehicle_photos").select("*").eq("service_order_id", osId).order("taken_at");
    setPhotos((data ?? []) as VehiclePhoto[]);
  }, [osId]);
  useEffect(() => {
    reload();
    const h = (e: Event) => { if ((e as CustomEvent).detail?.osId === osId) reload(); };
    window.addEventListener("oficina:photo-saved", h);
    return () => window.removeEventListener("oficina:photo-saved", h);
  }, [osId, reload]);
  return { photos, reload };
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
