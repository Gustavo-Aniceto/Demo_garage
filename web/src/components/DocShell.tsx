import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { signedUrls } from "../lib/photos";
import { formatDateTime } from "../lib/format";
import { OFICINA } from "../lib/oficina";
import type { PhotoCategory, VehiclePhoto } from "../lib/types";

const NO_PHOTOS: VehiclePhoto[] = [];
const NO_CATEGORIES: PhotoCategory[] = [];

/** Moldura de documento: cabeçalho da oficina, barra de ações (some na impressão) e seleção de fotos. */
export function DocShell({ title, number, children, photos = NO_PHOTOS, categories = NO_CATEGORIES, defaultSelected }: {
  title: string; number?: string; children: ReactNode; photos?: VehiclePhoto[]; categories?: PhotoCategory[];
  defaultSelected?: (p: VehiclePhoto) => boolean;
}) {
  const navigate = useNavigate();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSel(new Set(photos.filter((p) => (defaultSelected ? defaultSelected(p) : p.include_in_report)).map((p) => p.id)));
    if (photos.length) signedUrls(photos.map((p) => p.storage_path)).then(setUrls).catch(() => undefined);
  }, [photos, defaultSelected]);
  useEffect(() => {
    const prev = document.title;
    document.title = `${title}${number ? ` ${number}` : ""} - ${OFICINA.nome}`;
    return () => { document.title = prev; };
  }, [title, number]);
  const label = Object.fromEntries(categories.map((c) => [c.code, c.label]));
  const chosen = photos.filter((p) => sel.has(p.id));

  return (
    <div className="doc-page">
      <div className="doc-toolbar no-print">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>Voltar</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Salvar em PDF / imprimir</button>
        <span className="muted small">Na janela de impressão, escolha "Salvar como PDF".</span>
      </div>
      {photos.length > 0 && (
        <details className="doc-photo-pick no-print">
          <summary>Fotos no documento: {chosen.length} de {photos.length}</summary>
          <div className="photo-strip">
            {photos.map((p) => (
              <label key={p.id} className={`thumb thumb-pick${sel.has(p.id) ? " thumb-selected" : ""}`}>
                {urls[p.storage_path] ? <img src={urls[p.storage_path]} alt="" /> : <div className="thumb-ph" />}
                <span><input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /> {label[p.category] ?? p.category}</span>
              </label>
            ))}
          </div>
        </details>
      )}
      <article className="doc">
        <header className="doc-head">
          <div className="doc-brand"><span className="brand-mark" aria-hidden>IA</span>
            <div><strong>{OFICINA.nome}</strong> {OFICINA.subtitulo}<br />{OFICINA.endereco}, {OFICINA.bairro}, CEP {OFICINA.cep}<br />Telefone e WhatsApp {OFICINA.telefone}</div>
          </div>
          <div className="doc-title"><h1>{title}</h1>{number && <p className="doc-number">{number}</p>}<p className="small">Emitido em {formatDateTime(new Date().toISOString())}</p></div>
        </header>
        {children}
        {chosen.length > 0 && (
          <section className="doc-section">
            <h2>Fotografias</h2>
            <div className="doc-photos">
              {chosen.map((p) => (
                <figure key={p.id}>{urls[p.storage_path] && <img src={urls[p.storage_path]} alt="" />}
                  <figcaption>{label[p.category] ?? p.category}, {formatDateTime(p.taken_at)}{p.description ? `. ${p.description}` : ""}</figcaption></figure>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}

export function DocRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="doc-row"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="doc-sign">
      <div><span />{left}</div>
      <div><span />{right}</div>
    </div>
  );
}
