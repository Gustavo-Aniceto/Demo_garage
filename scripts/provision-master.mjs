#!/usr/bin/env node
// =====================================================================
// Provisionamento seguro do MasterAdm (executar UMA vez, na sua máquina).
//
//   Criar:     node scripts/provision-master.mjs
//   Recuperar: node scripts/provision-master.mjs --reset
//
// A senha é digitada no terminal (oculta) — não fica em arquivo, histórico
// nem no repositório. Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const LOGIN = process.env.MASTER_LOGIN ?? "MasterAdm";
const FULL_NAME = process.env.MASTER_FULL_NAME ?? "Administrador Master";
const DOMAIN = process.env.LOGIN_EMAIL_DOMAIN ?? "usuarios.oficinamodelo.internal";
const RESET = process.argv.includes("--reset");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente."); process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "");
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

function problems(pw) {
  if (pw.length < 10) return "mínimo 10 caracteres";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
    return "precisa de maiúscula, minúscula, número e símbolo";
  return null;
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `${LOGIN.toLowerCase()}@${DOMAIN}`;

const pw1 = await askHidden(`Senha ${RESET ? "temporária de recuperação" : "inicial"} do ${LOGIN}: `);
const pw2 = await askHidden("Confirme a senha: ");
if (pw1 !== pw2) { console.error("As senhas não conferem."); process.exit(1); }
const p = problems(pw1);
if (p) { console.error(`Senha fraca: ${p}.`); process.exit(1); }

const { data: existing } = await db.from("profiles").select("id, login").eq("role", "master").maybeSingle();

if (RESET) {
  if (!existing) { console.error("Nenhum MasterAdm encontrado."); process.exit(1); }
  const { error } = await db.auth.admin.updateUserById(existing.id, { password: pw1, ban_duration: "none" });
  if (error) { console.error("Falha:", error.message); process.exit(1); }
  await db.from("profiles").update({ must_change_password: true, active: true }).eq("id", existing.id);
  await db.rpc("admin_revoke_sessions", { p_user: existing.id });
  await db.from("audit_logs").insert({ actor_id: null, action: "master.recuperacao", entity: "profiles", entity_id: existing.id });
  console.log("Senha do MasterAdm redefinida. Sessões anteriores revogadas. Troca obrigatória no próximo acesso.");
  process.exit(0);
}

if (existing) { console.error("O MasterAdm já existe. Use --reset para recuperação."); process.exit(1); }

const { data: created, error } = await db.auth.admin.createUser({
  email, password: pw1, email_confirm: true,
  app_metadata: { app_role: "master" }, user_metadata: { full_name: FULL_NAME, login: LOGIN },
});
if (error) { console.error("Falha ao criar usuário:", error.message); process.exit(1); }

const { error: profErr } = await db.from("profiles").insert({
  id: created.user.id, full_name: FULL_NAME, login: LOGIN, role: "master",
  active: true, must_change_password: true, can_checkout: true,
});
if (profErr) {
  await db.auth.admin.deleteUser(created.user.id);
  console.error("Falha ao criar perfil (operação desfeita):", profErr.message); process.exit(1);
}
await db.from("audit_logs").insert({ actor_id: null, action: "master.provisionado", entity: "profiles", entity_id: created.user.id });
console.log(`MasterAdm criado (login: ${LOGIN}). Troca de senha obrigatória no primeiro acesso.`);
