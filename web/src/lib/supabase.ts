import { createClient } from "@supabase/supabase-js";

export const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Mensagem exibida quando o app foi publicado sem as variáveis de ambiente. */
export const configError =
  !url || !anonKey ? "Configuração incompleta: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY." : null;

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "oficina-auth" },
});

const LOGIN_DOMAIN = (import.meta.env.VITE_LOGIN_EMAIL_DOMAIN as string | undefined) ?? "usuarios.oficinamodelo.internal";

/** O usuário digita só o login (ex.: MasterAdm); o Supabase Auth recebe um e-mail técnico. */
export function loginToEmail(login: string): string {
  return `${login.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
}
