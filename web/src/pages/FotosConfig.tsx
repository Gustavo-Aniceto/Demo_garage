import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/errors";
import type { PhotoCategory, PhotoStage } from "../lib/types";
import { SelectField, TextField } from "../components/Field";
import { useToast } from "../components/Toast";

const STAGES: { value: PhotoStage; label: string; hint: string }[] = [
  { value: "checkin", label: "Entrada (check-in)", hint: "As obrigatórias precisam estar na nuvem para concluir o check-in." },
  { value: "checkup", label: "Diagnóstico", hint: "Fotos técnicas, sempre opcionais." },
  { value: "checkout", label: "Saída (check-out)", hint: "Fotos após o serviço." },
];

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 36);

/** MasterAdm define quais fotos existem e quais são obrigatórias. O banco valida cada regra. */
export function FotosConfig() {
  const toast = useToast();
  const [cats, setCats] = useState<PhotoCategory[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState({ label: "", stage: "checkin" as PhotoStage, required: false });
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("photo_categories").select("*").order("sort_order");
    if (error) { toast("error", friendlyError(error)); return; }
    setCats(data as PhotoCategory[]);
    setLabels({});
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(c: PhotoCategory, p: Partial<PhotoCategory>, ok: string) {
    setCats((cs) => cs && cs.map((x) => (x.code === c.code ? { ...x, ...p } : x))); // otimista
    const { error } = await supabase.from("photo_categories").update(p).eq("code", c.code);
    if (error) toast("error", friendlyError(error)); else toast("ok", ok);
    load(); // confirma o estado real do banco (desfaz se recusado)
  }
  async function move(list: PhotoCategory[], i: number, dir: -1 | 1) {
    const a = list[i], b = list[i + dir];
    if (!b) return;
    const r1 = await supabase.from("photo_categories").update({ sort_order: b.sort_order }).eq("code", a.code);
    const r2 = await supabase.from("photo_categories").update({ sort_order: a.sort_order }).eq("code", b.code);
    if (r1.error || r2.error) toast("error", friendlyError(r1.error ?? r2.error)); else load();
  }
  async function create() {
    const code = slug(novo.label);
    if (code.length < 2) { toast("error", "Nome muito curto."); return; }
    setBusy(true);
    const max = Math.max(0, ...(cats ?? []).map((c) => c.sort_order));
    const { error } = await supabase.from("photo_categories").insert({ code: (cats ?? []).some((c) => c.code === code) ? `${code}_${novo.stage}` : code,
      label: novo.label.trim(), stage: novo.stage, required: novo.stage === "checkin" && novo.required, sort_order: max + 1 });
    setBusy(false);
    if (error) toast("error", friendlyError(error)); else { toast("ok", "Categoria criada."); setNovo({ ...novo, label: "", required: false }); load(); }
  }

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>Fotos do atendimento</h1>
        <p className="muted">Defina quais fotos aparecem em cada etapa e quais são obrigatórias. Fotos já tiradas não são afetadas.</p>
      </header>
      {!cats && <p className="muted">Carregando…</p>}
      {cats && STAGES.map((st) => {
        const list = cats.filter((c) => c.stage === st.value);
        return (
          <section key={st.value} className="panel">
            <h2 className="section-title">{st.label}</h2>
            <p className="muted small">{st.hint}</p>
            <ul className="cat-list">
              {list.map((c, i) => (
                <li key={c.code} className={c.active ? "" : "cat-off"}>
                  <div className="cat-order">
                    <button className="btn btn-secondary btn-sm" aria-label={`Subir ${c.label}`} disabled={i === 0} onClick={() => move(list, i, -1)}>↑</button>
                    <button className="btn btn-secondary btn-sm" aria-label={`Descer ${c.label}`} disabled={i === list.length - 1} onClick={() => move(list, i, 1)}>↓</button>
                  </div>
                  <div className="field cat-name">
                    <label htmlFor={`cat-${c.code}`} className="sr-only">Nome</label>
                    <input id={`cat-${c.code}`} value={labels[c.code] ?? c.label} onChange={(e) => setLabels({ ...labels, [c.code]: e.target.value })}
                      onBlur={() => { const v = (labels[c.code] ?? c.label).trim(); if (v && v !== c.label) patch(c, { label: v }, "Nome atualizado."); }} />
                  </div>
                  {st.value === "checkin" && (
                    <label className="check"><input type="checkbox" checked={c.required} disabled={!c.active}
                      onChange={(e) => patch(c, { required: e.target.checked }, e.target.checked ? `"${c.label}" agora é obrigatória.` : `"${c.label}" agora é opcional.`)} /> Obrigatória</label>
                  )}
                  <label className="check"><input type="checkbox" checked={c.active} disabled={c.required}
                    onChange={(e) => patch(c, { active: e.target.checked }, e.target.checked ? "Categoria reativada." : "Categoria oculta.")} /> Em uso</label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="panel form">
        <h2 className="section-title">Nova categoria</h2>
        <div className="grid-2">
          <TextField label="Nome" value={novo.label} onChange={(e) => setNovo({ ...novo, label: e.target.value })} placeholder="Ex.: Estepe" />
          <SelectField label="Etapa" value={novo.stage} onChange={(e) => setNovo({ ...novo, stage: e.target.value as PhotoStage })}>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
        </div>
        {novo.stage === "checkin" && <label className="check"><input type="checkbox" checked={novo.required} onChange={(e) => setNovo({ ...novo, required: e.target.checked })} /> Obrigatória</label>}
        <div className="form-actions"><button className="btn btn-primary" disabled={busy || novo.label.trim().length < 2} onClick={create}>Criar categoria</button></div>
      </section>
      <p className="muted small">Uma foto obrigatória não pode ficar fora de uso. Para retirar, desmarque "Obrigatória" primeiro. Categorias não são excluídas, para preservar o histórico.</p>
    </div>
  );
}
