/**
 * Fila de fotos pendentes (IndexedDB). Uma foto só sai da fila quando o Storage
 * confirmou o arquivo E o banco registrou os metadados. Até lá ela aparece como
 * "Não enviada" — nunca como salva na nuvem.
 */
import { supabase } from "./supabase";
import { compressImage, newPhotoPath, uploadWithProgress } from "./photos";
import type { PhotoStage } from "./types";

export interface PendingPhoto {
  id: string; osId: string; vehicleId: string; stage: PhotoStage; category: string; description: string;
  path: string; blob: Blob; width: number; height: number; takenAt: string;
  state: "pending" | "uploading" | "error"; progress: number; error?: string;
}

const DB = "oficina-offline", STORE = "pending-photos";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

type Listener = () => void;
const listeners = new Set<Listener>();
export const onQueueChange = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const notify = () => listeners.forEach((l) => l());
const live = new Map<string, Partial<PendingPhoto>>(); // progresso em memória

export async function listPending(osId?: string): Promise<PendingPhoto[]> {
  const all = await tx<PendingPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<PendingPhoto[]>);
  return all.filter((p) => !osId || p.osId === osId).map((p) => ({ ...p, ...live.get(p.id) }) as PendingPhoto)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

export async function enqueuePhoto(input: { file: File; osId: string; vehicleId: string; stage: PhotoStage; category: string; description?: string }) {
  const { blob, width, height } = await compressImage(input.file);
  const item: PendingPhoto = {
    id: crypto.randomUUID(), osId: input.osId, vehicleId: input.vehicleId, stage: input.stage, category: input.category,
    description: input.description ?? "", path: newPhotoPath(input.osId, input.stage), blob, width, height,
    takenAt: new Date().toISOString(), state: "pending", progress: 0,
  };
  await tx("readwrite", (s) => s.put(item));
  notify();
  void processQueue(input.osId);
  return item.id;
}

export async function updatePendingDescription(id: string, description: string) {
  const item = await tx<PendingPhoto | undefined>("readonly", (s) => s.get(id) as IDBRequest<PendingPhoto | undefined>);
  if (item) { await tx("readwrite", (s) => s.put({ ...item, description })); notify(); }
}

export async function discardPending(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  live.delete(id); notify();
}

let running = false;
let rerun = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function processQueue(_osId?: string): Promise<void> {
  if (!navigator.onLine) return;
  if (running) { rerun = true; return; } // foto chegou durante um envio: processa ao terminar
  running = true;
  const tried = new Set<string>();
  try {
    for (;;) {
      rerun = false;
      const batch = (await listPending()).filter((p) => !tried.has(p.id)); // todas as OS pendentes
      if (!batch.length) break;
      for (const p of batch) {
      tried.add(p.id);
      if (!navigator.onLine) break;
      live.set(p.id, { state: "uploading", progress: 0, error: undefined }); notify();
      try {
        await uploadWithProgress(p.path, p.blob, (pct) => { live.set(p.id, { state: "uploading", progress: pct }); notify(); });
        const { error } = await supabase.from("vehicle_photos").insert({
          service_order_id: p.osId, vehicle_id: p.vehicleId, stage: p.stage, category: p.category,
          description: p.description || null, storage_path: p.path, mime_type: "image/jpeg",
          size_bytes: p.blob.size, width: p.width, height: p.height, taken_at: p.takenAt,
        });
        if (error && error.code !== "23505") throw new Error(error.message);
        await tx("readwrite", (s) => s.delete(p.id));
        live.delete(p.id);
        window.dispatchEvent(new CustomEvent("oficina:photo-saved", { detail: { osId: p.osId } }));
      } catch (e) {
        live.set(p.id, { state: "error", progress: 0, error: (e as Error).message });
      }
      notify();
      }
      if (!rerun) break;
    }
  } finally {
    running = false;
  }
}

window.addEventListener("online", () => void processQueue());
