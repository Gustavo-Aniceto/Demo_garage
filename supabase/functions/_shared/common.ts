// Utilidades compartilhadas pelas Edge Functions da Oficina Modelo.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const LOGIN_EMAIL_DOMAIN = Deno.env.get("LOGIN_EMAIL_DOMAIN") ?? "usuarios.oficinamodelo.internal";

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  // Sem APP_ALLOWED_ORIGINS configurado, devolve a própria origem: as funções exigem
  // o token (JWT) do usuário logado, então CORS não é a barreira de segurança aqui.
  // Configure o secret para restringir aos domínios oficiais.
  const allowed = ALLOWED_ORIGINS.length === 0 ? origin
    : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Cliente com privilégios totais — NUNCA sai do servidor. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Identifica o usuário a partir do JWT enviado pelo app. */
export async function getCaller(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export const LOGIN_RE = /^[A-Za-z0-9._-]{3,40}$/;

export function loginToEmail(login: string): string {
  return `${login.trim().toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;
}

/** Política de senha: 10+ caracteres, maiúscula, minúscula, número e símbolo. */
export function passwordProblems(pw: unknown): string | null {
  if (typeof pw !== "string") return "Senha inválida.";
  if (pw.length < 10) return "A senha deve ter pelo menos 10 caracteres.";
  if (pw.length > 72) return "A senha deve ter no máximo 72 caracteres.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
    return "A senha precisa de letra maiúscula, minúscula, número e símbolo.";
  }
  return null;
}

export async function audit(
  admin: SupabaseClient,
  entry: { actor_id: string | null; action: string; entity?: string; entity_id?: string;
           result?: "sucesso" | "negado" | "erro"; details?: Record<string, unknown> },
) {
  // Nunca registrar senhas, tokens ou segredos em "details".
  await admin.from("audit_logs").insert({ result: "sucesso", details: {}, ...entry });
}
