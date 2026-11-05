#!/usr/bin/env node
// =====================================================================
// Backup incremental das fotos (bucket privado "vehicle-photos").
// O backup do banco NÃO inclui os arquivos do Storage — por isso este script.
//
//   npm run backup:fotos
//
// Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
// Opcional: BACKUP_DIR (padrão ./backups/fotos).
// Baixa só o que ainda não existe localmente (ou mudou de tamanho) e grava um
// manifesto com data, totais e falhas. Nunca apaga arquivos locais.
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const BUCKET = "vehicle-photos";
const DIR = process.env.BACKUP_DIR ?? path.resolve("backups", "fotos");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."); process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function* walk(prefix = "") {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data.length) return;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) yield* walk(full);            // pasta
      else yield { name: full, size: item.metadata?.size ?? null };
    }
    if (data.length < 1000) return;
  }
}

const started = new Date();
const stats = { total: 0, baixados: 0, existentes: 0, falhas: [] };
fs.mkdirSync(DIR, { recursive: true });

try {
for await (const obj of walk()) {
  stats.total++;
  const dest = path.join(DIR, ...obj.name.split("/"));
  if (fs.existsSync(dest) && (obj.size == null || fs.statSync(dest).size === obj.size)) { stats.existentes++; continue; }
  const { data, error } = await db.storage.from(BUCKET).download(obj.name);
  if (error) { stats.falhas.push({ arquivo: obj.name, erro: error.message }); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + ".part", Buffer.from(await data.arrayBuffer()));
  fs.renameSync(dest + ".part", dest);                     // só aparece quando completo
  stats.baixados++;
  if (stats.baixados % 50 === 0) console.log(`… ${stats.baixados} baixados`);
}
} catch (e) {
  const msg = e?.message || String(e);
  console.error(`Backup interrompido: não foi possível listar o Storage (${msg || "acesso negado"}). Confira SUPABASE_URL e a chave service_role.`);
  process.exit(1);
}

const manifest = { inicio: started.toISOString(), fim: new Date().toISOString(), bucket: BUCKET, destino: DIR, ...stats };
fs.writeFileSync(path.join(DIR, `_manifesto-${started.toISOString().slice(0, 10)}.json`), JSON.stringify(manifest, null, 2));
console.log(`Fotos no Storage: ${stats.total} | baixadas agora: ${stats.baixados} | já existiam: ${stats.existentes} | falhas: ${stats.falhas.length}`);
if (stats.falhas.length) process.exit(2);
