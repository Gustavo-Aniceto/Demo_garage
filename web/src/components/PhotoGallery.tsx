import { useEffect, useMemo, useRef, useState } from "react";
import { signedUrls } from "../lib/photos";
import { formatDateTime } from "../lib/format";
import type { PhotoCategory, VehiclePhoto } from "../lib/types";

const STAGE_LABEL = { checkin: "Entrada", checkup: "Diagnóstico", checkout: "Saída" } as const;

interface Props {
  photos: (VehiclePhoto & { os_number?: string })[];
  categories: PhotoCategory[];
  staff?: Record<string, string>;
  groupBy?: "stage" | "os";
}

/** Galeria com ampliação e comparação lado a lado (ex.: entrada x saída, ou atendimentos diferentes). */
export function PhotoGallery({ photos, categories, staff = {}, groupBy = "stage" }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<VehiclePhoto | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const dlg = useRef<HTMLDialogElement>(null);
  const catLabel = useMemo(() => Object.fromEntries(categories.map((c) => [c.code, c.label])), [categories]);

  useEffect(() => {
    if (photos.length) signedUrls(photos.map((p) => p.storage_path)).then(setUrls).catch(() => undefined);
  }, [photos]);
  useEffect(() => {
    const d = dlg.current; if (!d) return;
    if ((open || compare.length === 2) && !d.open) d.showModal();
    if (!open && compare.length < 2 && d.open) d.close();
  }, [open, compare]);

  if (!photos.length) return <p className="empty">Nenhuma foto registrada.</p>;

  const groups = new Map<string, typeof photos>();
  for (const p of photos) {
    const k = groupBy === "os" ? `${p.os_number ?? ""} (${STAGE_LABEL[p.stage]})` : STAGE_LABEL[p.stage];
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  const cmp = compare.map((id) => photos.find((p) => p.id === id)!).filter(Boolean);
  const meta = (p: VehiclePhoto) =>
    `${catLabel[p.category] ?? p.category}, ${formatDateTime(p.taken_at)}${p.created_by && staff[p.created_by] ? `, por ${staff[p.created_by]}` : ""}`;

  return (
    <div className="gallery">
      <p className="muted small">Toque numa foto para ampliar. Marque duas para comparar lado a lado.</p>
      {[...groups.entries()].map(([g, list]) => (
        <section key={g}>
          <h3 className="gallery-group">{g}</h3>
          <div className="photo-strip">
            {list.map((p) => (
              <figure key={p.id} className={`thumb${compare.includes(p.id) ? " thumb-selected" : ""}`}>
                <button type="button" className="thumb-btn" onClick={() => setOpen(p)} aria-label={`Ampliar ${catLabel[p.category] ?? ""}`}>
                  {urls[p.storage_path] ? <img src={urls[p.storage_path]} alt="" loading="lazy" /> : <div className="thumb-ph" />}
                </button>
                <figcaption>
                  {catLabel[p.category] ?? p.category}
                  <label className="check check-sm"><input type="checkbox" checked={compare.includes(p.id)} onChange={() => toggle(p.id)} /> Comparar</label>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      <dialog ref={dlg} className="dialog dialog-photo" onClose={() => { setOpen(null); setCompare((c) => (c.length === 2 ? [] : c)); }}>
        {open && !(compare.length === 2) && (
          <figure className="photo-full">
            <img src={urls[open.storage_path]} alt="" />
            <figcaption>{meta(open)}{open.description ? `. ${open.description}` : ""}</figcaption>
          </figure>
        )}
        {compare.length === 2 && (
          <div className="photo-compare">
            {cmp.map((p) => (
              <figure key={p.id} className="photo-full">
                <img src={urls[p.storage_path]} alt="" />
                <figcaption>{STAGE_LABEL[p.stage]}{p.os_number ? ` (${p.os_number})` : ""}: {meta(p)}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={() => dlg.current?.close()}>Fechar</button></div>
      </dialog>
    </div>
  );
}
