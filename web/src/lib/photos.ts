import { anonKey, supabase, url } from "./supabase";

export const BUCKET = "vehicle-photos";
const MAX_SIDE = 1920;     // mantém detalhes legíveis (riscos, painel)
const QUALITY = 0.82;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** Reduz e converte para JPEG. Fotos de celular (5–12 MB) ficam em ~300–700 KB. */
export async function compressImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && file.type !== "") {
    throw new Error("Formato não suportado. Use foto JPG, PNG ou WEBP.");
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error("Foto muito grande (máx. 25 MB).");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Não foi possível ler esta imagem."); });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao comprimir a foto."))), "image/jpeg", QUALITY));
  return { blob, width, height };
}

export function newPhotoPath(osId: string, stage: string): string {
  return `os/${osId}/${stage}/${crypto.randomUUID()}.jpg`;
}

/** Envio com barra de progresso (XHR). Só resolve quando o Storage confirma o arquivo. */
export async function uploadWithProgress(path: string, blob: Blob, onProgress: (pct: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey ?? "");
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 409) return resolve(); // já estava salvo (reenvio)
      let msg = "O servidor recusou a foto.";
      try { msg = JSON.parse(xhr.responseText).message ?? msg; } catch { /* ignora */ }
      if (/row-level security|Unauthorized|403/i.test(msg) || xhr.status === 403) msg = "Sem permissão para enviar fotos nesta OS (ela pode estar encerrada).";
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Sem conexão. A foto ficou guardada neste aparelho para reenvio."));
    xhr.send(blob);
  });
}

const cache = new Map<string, { url: string; exp: number }>();
/** URLs temporárias (1 h) — as fotos nunca ficam públicas. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const missing = paths.filter((p) => (cache.get(p)?.exp ?? 0) <= now);
  if (missing.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 3600);
    if (error) throw error;
    for (const d of data ?? []) if (d.path && d.signedUrl) cache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60 * 1000 });
  }
  return Object.fromEntries(paths.filter((p) => cache.has(p)).map((p) => [p, cache.get(p)!.url]));
}
