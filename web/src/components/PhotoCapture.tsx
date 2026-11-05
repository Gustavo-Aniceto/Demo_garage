import { useEffect, useRef, useState } from "react";
import { discardPending, enqueuePhoto, listPending, onQueueChange, processQueue, updatePendingDescription, type PendingPhoto } from "../lib/queue";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import { signedUrls } from "../lib/photos";
import type { PhotoCategory, PhotoStage, VehiclePhoto } from "../lib/types";
import { useToast } from "./Toast";

interface Props {
  osId: string;
  vehicleId: string;
  stage: PhotoStage;
  categories: PhotoCategory[];
  saved: VehiclePhoto[];
  disabled?: boolean;
}

/** Captura por categoria: câmera ou galeria, com estado claro de cada foto (na nuvem / enviando / não enviada). */
export function PhotoCapture({ osId, vehicleId, stage, categories, saved, disabled }: Props) {
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const toast = useToast();

  useEffect(() => {
    const load = () => listPending(osId).then(setPending);
    load();
    return onQueueChange(load);
  }, [osId]);

  useEffect(() => {
    const paths = saved.map((p) => p.storage_path);
    if (paths.length) signedUrls(paths).then(setThumbs).catch(() => undefined);
  }, [saved]);

  const cats = categories.filter((c) => c.stage === stage);

  async function add(files: FileList | null, category: string) {
    if (!files) return;
    for (const f of Array.from(files)) {
      try { await enqueuePhoto({ file: f, osId, vehicleId, stage, category }); }
      catch (e) { toast("error", (e as Error).message); }
    }
  }

  return (
    <div className="photo-cats">
      {cats.map((c) => {
        const mine = saved.filter((p) => p.category === c.code);
        const queued = pending.filter((p) => p.category === c.code && p.stage === stage);
        const ok = mine.length > 0;
        return (
          <section key={c.code} className={`photo-cat${c.required && !ok ? " photo-cat-missing" : ""}`}>
            <header className="photo-cat-head">
              <h3>{c.label}</h3>
              {c.required && <span className={`badge ${ok ? "badge-ready" : "badge-wait"}`}>{ok ? "Obrigatória: ok" : "Obrigatória"}</span>}
            </header>
            <div className="photo-strip">
              {mine.map((p) => (
                <figure key={p.id} className="thumb">
                  {thumbs[p.storage_path] ? <img src={thumbs[p.storage_path]} alt={c.label} loading="lazy" /> : <div className="thumb-ph" />}
                  <figcaption className="thumb-ok">Na nuvem</figcaption>
                  {!disabled && <DescInput initial={p.description ?? ""} onSave={async (v) => {
                    const { error } = await supabase.from("vehicle_photos").update({ description: v || null }).eq("id", p.id);
                    if (error) toast("error", friendlyError(error)); else toast("ok", "Descrição salva.");
                  }} />}
                  {disabled && p.description && <small>{p.description}</small>}
                </figure>
              ))}
              {queued.map((p) => <PendingThumb key={p.id} p={p} />)}
            </div>
            {!disabled && <CaptureButtons onFiles={(f) => add(f, c.code)} />}
          </section>
        );
      })}
    </div>
  );
}

function PendingThumb({ p }: { p: PendingPhoto }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => { const u = URL.createObjectURL(p.blob); setSrc(u); return () => URL.revokeObjectURL(u); }, [p.blob]);
  return (
    <figure className="thumb thumb-pending">
      {src && <img src={src} alt="" />}
      <DescInput initial={p.description} onSave={(v) => updatePendingDescription(p.id, v)} />
      {p.state === "uploading" ? (
        <figcaption><span className="bar"><span style={{ width: `${p.progress}%` }} /></span>Enviando {p.progress}%</figcaption>
      ) : (
        <figcaption className="thumb-err">
          {p.state === "error" ? "Não enviada" : "Na fila"}
          {p.error && <small>{p.error}</small>}
          <span className="thumb-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => processQueue(p.osId)}>Tentar de novo</button>
            <button type="button" className="btn btn-link" onClick={() => { if (confirm("Descartar esta foto não enviada?")) discardPending(p.id); }}>Descartar</button>
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/** Descrição curta da foto; salva ao sair do campo. */
function DescInput({ initial, onSave }: { initial: string; onSave: (v: string) => void | Promise<void> }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  return (
    <input className="thumb-desc" value={v} maxLength={200} placeholder="Descrição (opcional)" aria-label="Descrição da foto"
      onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== initial.trim()) onSave(v.trim()); }} />
  );
}

function CaptureButtons({ onFiles }: { onFiles: (f: FileList | null) => void }) {
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null);
  return (
    <div className="capture-btns">
      <button type="button" className="btn btn-primary" onClick={() => cam.current?.click()}>Tirar foto</button>
      <button type="button" className="btn btn-secondary" onClick={() => gal.current?.click()}>Da galeria</button>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={gal} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

/** Aviso fixo quando há fotos que ainda não estão na nuvem. */
export function PendingBanner({ osId }: { osId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => listPending(osId).then((l) => setN(l.length));
    load();
    return onQueueChange(load);
  }, [osId]);
  if (!n) return null;
  return (
    <div className="notice notice-warn" role="status">
      {n} foto(s) ainda <strong>não estão na nuvem</strong> e só existem neste aparelho. Não feche o navegador nem limpe os dados até o envio terminar.
      <button className="btn btn-secondary btn-sm" onClick={() => processQueue(osId)}>Enviar agora</button>
    </div>
  );
}
