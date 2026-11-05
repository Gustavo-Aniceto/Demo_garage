-- =====================================================================
-- OFICINA MODELO — Migração 4: revisão da fase 1 + suporte ao app (fase 2)
-- =====================================================================

-- 1) Supabase concede, por padrão, acesso de anon/authenticated a TODO objeto
--    novo no schema public. Fechamos isso: cada objeto novo precisa de grant explícito.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 2) Nomes da equipe (para histórico/movimentações) sem expor perfis completos
create or replace function public.staff_directory()
returns table (id uuid, full_name text, role public.app_role, active boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role, p.active from public.profiles p
  where public.is_staff()
  order by p.full_name
$$;

-- 3) Indicadores do painel, calculados dos dados reais
create or replace function public.dashboard_summary()
returns table (
  em_atendimento int, aguardando_diagnostico int, orcamentos_pendentes int, orcamentos_aprovados int,
  em_execucao int, prontos_retirada int, concluidas int, checkins_rascunho int)
language sql stable security invoker set search_path = public as $$
  with os as (select * from public.service_orders),
  open_os as (select * from os where status not in ('entregue', 'cancelado') and checkin_completed_at is not null)
  select
    (select count(*) from open_os)::int,
    (select count(*) from open_os where status in ('aguardando_diagnostico', 'em_diagnostico'))::int,
    (select count(*) from public.quotes q join open_os o on o.id = q.service_order_id where q.status = 'pendente_aprovacao')::int,
    (select count(*) from public.quotes q join open_os o on o.id = q.service_order_id where q.status = 'aprovado')::int,
    (select count(*) from open_os where status in ('aguardando_execucao', 'em_execucao', 'aguardando_conferencia'))::int,
    (select count(*) from open_os where status = 'pronto_retirada')::int,
    (select count(*) from os where status = 'entregue')::int,
    (select count(*) from os where checkin_completed_at is null and status <> 'cancelado')::int
  where public.is_staff()
$$;

-- 4) Últimas movimentações (com placa, OS e nome do responsável)
create or replace function public.recent_activity(p_limit int default 15)
returns table (created_at timestamptz, service_order_id uuid, os_number text, plate text,
               vehicle text, from_status public.os_status, to_status public.os_status, actor_name text)
language sql stable security definer set search_path = public as $$
  select e.created_at, so.id, so.number, v.plate_normalized, v.brand || ' ' || v.model,
         e.from_status, e.to_status, p.full_name
  from public.service_order_events e
  join public.service_orders so on so.id = e.service_order_id
  join public.vehicles v on v.id = so.vehicle_id
  left join public.profiles p on p.id = e.actor_id
  where public.is_staff()
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 15), 1), 50)
$$;

-- 5) Busca única de clientes: nome, telefone ou placa
create or replace function public.search_customers(p_query text, p_limit int default 30)
returns table (id uuid, full_name text, phone text, email text, created_at timestamptz, plates text[])
language sql stable security invoker set search_path = public as $$
  with q as (
    select btrim(coalesce(p_query, '')) as raw,
           regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits,
           upper(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9]', '', 'g')) as plate
  )
  select c.id, c.full_name, c.phone, c.email, c.created_at,
         coalesce(array_agg(v.plate_normalized order by v.plate_normalized) filter (where v.id is not null), '{}')
  from public.customers c
  left join public.vehicles v on v.customer_id = c.id
  cross join q
  where q.raw = ''
     or c.full_name ilike '%' || replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     or (length(q.digits) >= 4 and c.phone_digits like '%' || q.digits || '%')
     or (length(q.plate) >= 3 and exists (select 1 from public.vehicles v2
                                          where v2.customer_id = c.id and v2.plate_normalized like '%' || q.plate || '%'))
  group by c.id
  order by c.full_name
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

grant execute on function public.staff_directory(), public.dashboard_summary(),
  public.recent_activity(int), public.search_customers(text, int) to authenticated;
