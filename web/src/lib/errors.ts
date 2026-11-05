import { FunctionsHttpError } from "@supabase/supabase-js";

interface PgLikeError { code?: string; message?: string; details?: string }

/** Traduz erros do Supabase/Postgres para mensagens que orientam o usuário. */
export function friendlyError(err: unknown): string {
  if (!navigator.onLine) return "Sem conexão com a internet. Nada foi salvo — tente de novo quando a conexão voltar.";
  const e = (err ?? {}) as PgLikeError;
  const msg = e.message ?? String(err ?? "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return "Não foi possível falar com o servidor. Nada foi salvo — verifique a conexão e tente de novo.";
  }
  switch (e.code) {
    case "23505":
      if (/plate/.test(msg)) return "Esta placa já está cadastrada.";
      if (/client_request_id/.test(msg)) return "Este registro já foi enviado.";
      return "Já existe um registro com esses dados.";
    case "42501":
      return /permission denied|row-level security/i.test(msg)
        ? "Seu usuário não tem permissão para esta ação."
        : msg; // mensagens das regras do banco já estão em português
    case "23514":
      if (/vehicles_plate_format/.test(msg)) return "Placa inválida. Use o formato ABC1234 ou ABC1D23.";
      if (/customers_phone_len|phone/.test(msg)) return "Telefone inválido. Informe DDD + número.";
      if (/cpf/.test(msg)) return "CPF inválido.";
      if (/email/.test(msg)) return "E-mail inválido.";
      return msg.startsWith("new row") ? "Algum campo está fora do formato esperado." : msg;
    case "PGRST301":
    case "401":
      return "Sua sessão expirou. Entre novamente.";
  }
  if (/Invalid login credentials/i.test(msg)) return "Login ou senha incorretos.";
  if (/banned/i.test(msg)) return "Esta conta está desativada. Fale com o administrador.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas seguidas. Aguarde alguns minutos.";
  return msg || "Algo deu errado. Tente novamente.";
}

/** Lê a mensagem de erro devolvida pelas Edge Functions. */
export async function functionError(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json();
      if (body?.error) return String(body.error);
    } catch { /* corpo não-JSON */ }
  }
  return friendlyError(err);
}
