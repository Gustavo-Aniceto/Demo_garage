# Oficina Modelo — sistema de demonstração

Versão neutra do sistema de gestão para oficinas mecânicas. Mesmo backend completo (Supabase),
só a camada visual e os dados da oficina são genéricos.

## Estrutura
- `web/` — front-end React + Vite + TypeScript (PWA). Dados da oficina em `web/src/lib/oficina.ts`
  e variáveis `VITE_OFICINA_*`; cores em `web/src/styles.css` (bloco `:root`).
- `supabase/migrations/` — 7 migrações (schema, segurança/RLS, storage, retenção).
- `supabase/functions/` — Edge Functions `admin-users` e `change-password`.
- `scripts/` — criação do MasterAdm, backup de fotos.

## Publicação na Cloudflare (front)
1. Variáveis (Settings > Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_LOGIN_EMAIL_DOMAIN` e, se quiser, `VITE_OFICINA_*` (veja `web/.env.example`).
2. Build: `npm install && npm run build` dentro de `web/`; pasta de saída: `dist`.
3. `web/wrangler.jsonc` já trata as rotas do app (SPA) e `web/public/_headers` aplica os
   cabeçalhos de segurança.

## Banco (Supabase)
Aplicar as migrações em ordem e publicar as duas Edge Functions. Segredos e senhas nunca
ficam neste repositório; o MasterAdm é criado com `npm run provision:master`
(a senha é digitada no terminal).

## Pendências
Seed/reset de dados fictícios, passo a passo de nova oficina e script de atualização em lote.
