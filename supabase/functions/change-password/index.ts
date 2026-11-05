// =====================================================================
// Troca de senha (obrigatória no primeiro acesso).
// Confere a senha atual, aplica a política e libera o acesso ao sistema.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { adminClient, audit, corsHeaders, getCaller, json, passwordProblems } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Método não permitido." });

  const caller = await getCaller(req);
  if (!caller?.email) return json(req, 401, { error: "Sessão inválida. Entre novamente." });
  const admin = adminClient();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, 400, { error: "Requisição inválida." }); }
  const current = body.current_password, next = body.new_password;

  const { data: profile } = await admin.from("profiles").select("id, active").eq("id", caller.id).maybeSingle();
  if (!profile?.active) return json(req, 403, { error: "Conta desativada." });

  const pwErr = passwordProblems(next);
  if (pwErr) return json(req, 400, { error: pwErr });
  if (current === next) return json(req, 400, { error: "A nova senha deve ser diferente da atual." });

  // Confere a senha atual sem criar sessão persistente
  const verifier = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await verifier.auth.signInWithPassword({ email: caller.email, password: String(current ?? "") });
  if (signErr) {
    await audit(admin, { actor_id: caller.id, action: "senha.troca", entity: "profiles", entity_id: caller.id, result: "negado" });
    return json(req, 403, { error: "Senha atual incorreta." });
  }
  await verifier.auth.signOut({ scope: "local" }); // encerra SÓ a sessão de verificação (global derrubaria a sessão do usuário)

  // Troca pela via do PRÓPRIO usuário (com o token dele): o Supabase mantém a sessão atual e
  // encerra as demais. A via administrativa (updateUserById) derrubaria também a sessão atual.
  const upd = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: req.headers.get("Authorization")!, "Content-Type": "application/json" },
    body: JSON.stringify({ password: String(next) }),
  });
  if (!upd.ok) {
    const detail = await upd.json().catch(() => ({}));
    console.error("change-password", upd.status, detail);
    const weak = /weak|pwned|characters/i.test(JSON.stringify(detail));
    return json(req, weak ? 400 : 500, { error: weak ? "Senha recusada pelo servidor: escolha uma senha mais forte e diferente das anteriores." : "Não foi possível alterar a senha." });
  }
  const { error: e2 } = await admin.from("profiles").update({ must_change_password: false }).eq("id", caller.id);
  if (e2) return json(req, 500, { error: "Senha alterada, mas o perfil não foi atualizado. Contate o administrador." });

  await audit(admin, { actor_id: caller.id, action: "senha.trocada", entity: "profiles", entity_id: caller.id });
  return json(req, 200, { ok: true });
});
