-- =====================================================================
-- OFICINA MODELO — Migração 2: regras de negócio, auditoria e RLS
-- Toda permissão é validada AQUI (banco), não apenas na interface.
-- =====================================================================

-- ---------- Funções auxiliares de permissão ----------
-- Usuário ativo, com perfil e que JÁ trocou a senha temporária.
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = auth.uid() and active and not must_change_password
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() is not null
$$;

create or replace function public.is_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'master', false)
$$;

create or replace function public.can_checkout()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_master() or exists (
    select 1 from public.profiles
    where id = auth.uid() and active and not must_change_password and can_checkout)
$$;

create or replace function public.os_is_closed(p_os uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status in ('entregue', 'cancelado') from public.service_orders where id = p_os), false)
$$;

-- ---------- updated_at + autoria (não pode ser falsificada pelo cliente) ----------
create or replace function public.tg_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);  -- service_role (sem uid) pode informar
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- Auditoria genérica ----------
create or replace function public.tg_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_diff jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('de', v_old -> n.key, 'para', n.value))
      into v_diff
      from jsonb_each(v_new) n
     where n.value is distinct from (v_old -> n.key)
       and n.key not in ('updated_at', 'last_access_at');
    if v_diff is null then return null; end if;
  else
    v_diff := coalesce(v_new, v_old);
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), v_diff);
  return null;
end $$;

-- Auditoria é somente-inserção
create or replace function public.tg_audit_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Registros de auditoria não podem ser alterados ou excluídos' using errcode = '42501';
end $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.tg_audit_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.tg_audit_immutable();

-- ---------- Proteção da conta master e de perfis ----------
create or replace function public.tg_profiles_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'master' then
      raise exception 'A conta MasterAdm não pode ser excluída' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.role = 'master' then
    if new.role <> 'master' then raise exception 'O perfil do MasterAdm não pode ser alterado' using errcode = '42501'; end if;
    if not new.active then raise exception 'O MasterAdm não pode ser desativado' using errcode = '42501'; end if;
    if new.login <> old.login then raise exception 'O login do MasterAdm não pode ser alterado' using errcode = '42501'; end if;
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  return new;
end $$;
create trigger profiles_guard before insert or update or delete on public.profiles
  for each row execute function public.tg_profiles_guard();

-- ---------- Regras da ordem de serviço ----------
create or replace function public.tg_service_orders_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_missing text;
begin
  if tg_op = 'INSERT' then
    new.number := 'OS-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-'
                  || lpad(nextval('public.service_order_seq')::text, 6, '0');
    new.status := 'aguardando_diagnostico';
    new.checkin_completed_at := null;
    new.closed_at := null; new.closed_by := null;
    new.opened_by := coalesce(auth.uid(), new.opened_by);
    new.opened_at := now();
    if not exists (select 1 from public.vehicles where id = new.vehicle_id and customer_id = new.customer_id) then
      raise exception 'O veículo informado não pertence ao cliente informado' using errcode = '23514';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status in ('entregue', 'cancelado') and not public.is_master() then
    raise exception 'OS % encerrada: correções somente pelo MasterAdm (com auditoria)', old.number using errcode = '42501';
  end if;
  if new.number <> old.number or new.vehicle_id <> old.vehicle_id or new.customer_id <> old.customer_id
     or new.opened_at <> old.opened_at or new.opened_by is distinct from old.opened_by
     or new.client_request_id is distinct from old.client_request_id then
    raise exception 'Campos de identificação da OS não podem ser alterados' using errcode = '42501';
  end if;

  -- Conclusão do check-in: exige inspeção e todas as fotos obrigatórias JÁ salvas
  if new.checkin_completed_at is distinct from old.checkin_completed_at then
    if old.checkin_completed_at is not null then
      raise exception 'O check-in já foi concluído' using errcode = '42501';
    end if;
    if not exists (select 1 from public.checkin_inspections where service_order_id = new.id) then
      raise exception 'Preencha a inspeção de entrada antes de concluir o check-in' using errcode = '23514';
    end if;
    select string_agg(c.label, ', ' order by c.sort_order) into v_missing
      from public.photo_categories c
     where c.stage = 'checkin' and c.required and c.active
       and not exists (select 1 from public.vehicle_photos p
                        where p.service_order_id = new.id and p.category = c.code);
    if v_missing is not null then
      raise exception 'Fotos obrigatórias pendentes: %', v_missing using errcode = '23514';
    end if;
    new.checkin_completed_at := now();
  end if;

  if new.status is distinct from old.status then
    if new.checkin_completed_at is null and new.status <> 'cancelado' then
      raise exception 'Conclua o check-in antes de avançar o atendimento' using errcode = '23514';
    end if;
    -- Execução só com orçamento aprovado
    if new.status in ('aguardando_execucao', 'em_execucao', 'aguardando_conferencia')
       and not exists (select 1 from public.quotes where service_order_id = new.id and status = 'aprovado') then
      raise exception 'Execução exige um orçamento aprovado e registrado' using errcode = '23514';
    end if;
    if new.status = 'entregue' then
      if not exists (select 1 from public.checkouts where service_order_id = new.id and delivery_confirmed) then
        raise exception 'Registre o check-out com confirmação de entrega antes de encerrar' using errcode = '23514';
      end if;
    end if;
    if new.status in ('entregue', 'cancelado') then
      new.closed_at := now();
      new.closed_by := auth.uid();
    elsif old.status in ('entregue', 'cancelado') then   -- reabertura pelo master
      new.closed_at := null; new.closed_by := null;
    end if;
  else
    new.closed_at := old.closed_at; new.closed_by := old.closed_by;
  end if;

  new.updated_at := now();
  new.created_at := old.created_at; new.created_by := old.created_by;
  return new;
end $$;
create trigger service_orders_rules before insert or update on public.service_orders
  for each row execute function public.tg_service_orders_rules();

create or replace function public.tg_service_orders_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.service_order_events (service_order_id, from_status, to_status, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return null;
end $$;
create trigger service_orders_events after insert or update on public.service_orders
  for each row execute function public.tg_service_orders_events();

-- ---------- Bloqueio de alterações em OS encerrada (tabelas filhas) ----------
create or replace function public.tg_child_os_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_os uuid;
begin
  case tg_argv[0]
    when 'direct'     then v_os := (r ->> 'service_order_id')::uuid;
    when 'quote'      then select service_order_id into v_os from public.quotes where id = (r ->> 'quote_id')::uuid;
    when 'diagnostic' then select service_order_id into v_os from public.diagnostics where id = (r ->> 'diagnostic_id')::uuid;
    when 'inspection' then select service_order_id into v_os from public.checkin_inspections where id = (r ->> 'inspection_id')::uuid;
  end case;
  if public.os_is_closed(v_os) and not public.is_master() then
    raise exception 'OS encerrada: correções somente pelo MasterAdm (com auditoria)' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and tg_argv[0] = 'direct'
     and (r ->> 'service_order_id')::uuid is distinct from (to_jsonb(old) ->> 'service_order_id')::uuid then
    raise exception 'Não é permitido mover registros entre ordens de serviço' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------- Orçamento: travado após decisão ----------
create or replace function public.tg_quotes_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.prepared_by := coalesce(auth.uid(), new.prepared_by);
    if new.status = 'aprovado' then
      raise exception 'Crie o orçamento e registre a aprovação em seguida' using errcode = '23514';
    end if;
    return new;
  end if;
  if old.status in ('aprovado', 'recusado', 'cancelado') and not public.is_master() then
    if new.status <> 'cancelado' or old.status = 'cancelado'
       or (to_jsonb(new) - array['status','updated_at','notes']) <> (to_jsonb(old) - array['status','updated_at','notes']) then
      raise exception 'Orçamento já decidido: crie uma nova versão' using errcode = '42501';
    end if;
  end if;
  if new.status = 'aprovado' and old.status <> 'aprovado' then
    new.approved_registered_by := coalesce(auth.uid(), new.approved_registered_by);
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  if new.status = 'recusado' and old.status <> 'recusado' then new.refused_at := now(); end if;
  return new;
end $$;
create trigger quotes_rules before insert or update on public.quotes
  for each row execute function public.tg_quotes_rules();

create or replace function public.tg_quote_items_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quote uuid := coalesce(new.quote_id, old.quote_id);
begin
  if exists (select 1 from public.quotes where id = v_quote and status in ('aprovado', 'recusado', 'cancelado'))
     and not public.is_master() then
    raise exception 'Itens de orçamento decidido não podem ser alterados' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger quote_items_lock before insert or update or delete on public.quote_items
  for each row execute function public.tg_quote_items_lock();

-- ---------- Fotos: só registra metadados se o arquivo JÁ está no Storage ----------
create or replace function public.tg_vehicle_photos_rules()
returns trigger language plpgsql security definer set search_path = public, storage as $$
declare v_cat_stage public.photo_stage;
begin
  if tg_op = 'UPDATE' then
    if new.storage_path <> old.storage_path or new.service_order_id <> old.service_order_id
       or new.vehicle_id <> old.vehicle_id or new.stage <> old.stage then
      raise exception 'Arquivo e vínculo da foto não podem ser alterados' using errcode = '42501';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.service_orders where id = new.service_order_id and vehicle_id = new.vehicle_id) then
    raise exception 'Veículo não corresponde à ordem de serviço' using errcode = '23514';
  end if;
  select stage into v_cat_stage from public.photo_categories where code = new.category and active;
  if v_cat_stage is distinct from new.stage then
    raise exception 'Categoria de foto inválida para a etapa %', new.stage using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'vehicle-photos' and name = new.storage_path) then
    raise exception 'Arquivo ainda não foi salvo na nuvem: %', new.storage_path using errcode = '23514';
  end if;
  return new;
end $$;
create trigger vehicle_photos_rules before insert or update on public.vehicle_photos
  for each row execute function public.tg_vehicle_photos_rules();

-- ---------- Check-out: km final >= km inicial ----------
create or replace function public.tg_checkouts_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_km_in integer;
begin
  select km_in into v_km_in from public.checkin_inspections where service_order_id = new.service_order_id;
  if v_km_in is not null and new.km_out < v_km_in then
    raise exception 'Quilometragem final (%) menor que a de entrada (%)', new.km_out, v_km_in using errcode = '23514';
  end if;
  return new;
end $$;
create trigger checkouts_rules before insert or update on public.checkouts
  for each row execute function public.tg_checkouts_rules();

-- ---------- Aplicação dos triggers ----------
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','service_orders','checkin_inspections','checkin_inspection_items',
                           'diagnostics','diagnostic_defects','quotes','quote_items','performed_services',
                           'checkouts','vehicle_photos'] loop
    if t <> 'service_orders' then
      execute format('create trigger %I_stamp before insert or update on public.%I for each row execute function public.tg_stamp()', t, t);
    end if;
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t, t);
  end loop;

  foreach t in array array['checkin_inspections','diagnostics','quotes','performed_services','checkouts','vehicle_photos'] loop
    execute format('create trigger %I_os_guard before insert or update or delete on public.%I for each row execute function public.tg_child_os_guard(''direct'')', t, t);
  end loop;
end $$;
create trigger service_orders_stamp_created before insert on public.service_orders
  for each row execute function public.tg_stamp();
create trigger quote_items_os_guard before insert or update or delete on public.quote_items
  for each row execute function public.tg_child_os_guard('quote');
create trigger diagnostic_defects_os_guard before insert or update or delete on public.diagnostic_defects
  for each row execute function public.tg_child_os_guard('diagnostic');
create trigger checkin_inspection_items_os_guard before insert or update or delete on public.checkin_inspection_items
  for each row execute function public.tg_child_os_guard('inspection');
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.tg_audit();
create trigger photo_categories_audit after insert or update or delete on public.photo_categories
  for each row execute function public.tg_audit();

create or replace function public.tg_contact_requests_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'novo'; new.handled_by := null; new.internal_notes := null; new.created_at := now();
  else
    new.created_at := old.created_at;
    -- dados enviados pelo cliente não são reescritos internamente
    new.name := old.name; new.phone := old.phone; new.description := old.description; new.lgpd_consent := old.lgpd_consent;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger contact_requests_stamp before insert or update on public.contact_requests
  for each row execute function public.tg_contact_requests_stamp();

-- ---------- RPCs chamadas pelo app ----------
-- Registra login/logout e atualiza último acesso (o app chama após autenticar).
create or replace function public.register_session_event(p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado' using errcode = '42501'; end if;
  if p_event not in ('login', 'logout') then raise exception 'Evento inválido' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    insert into public.audit_logs (actor_id, action, entity, result) values (auth.uid(), p_event, 'auth', 'negado');
    raise exception 'Conta inexistente ou desativada' using errcode = '42501';
  end if;
  if p_event = 'login' then
    update public.profiles set last_access_at = now() where id = auth.uid();
  end if;
  insert into public.audit_logs (actor_id, action, entity) values (auth.uid(), p_event, 'auth');
end $$;

-- Dados do usuário logado (inclui must_change_password, para o app forçar a troca)
create or replace function public.get_my_profile()
returns table (id uuid, full_name text, login text, role public.app_role, active boolean,
               must_change_password boolean, can_checkout boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.login, p.role, p.active, p.must_change_password, p.can_checkout
  from public.profiles p where p.id = auth.uid()
$$;

-- Revogação de sessões: SOMENTE service_role (usada pela função admin-users)
create or replace function public.admin_revoke_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.sessions where user_id = p_user;
end $$;

-- ---------- Views (respeitam RLS de quem consulta) ----------
create view public.quote_summaries with (security_invoker = true) as
select q.id as quote_id, q.service_order_id, q.version, q.status,
       coalesce(sum(i.total) filter (where i.approved), 0)              as subtotal_aprovado,
       coalesce(sum(i.total), 0)                                         as subtotal_orcado,
       q.discount_amount,
       greatest(coalesce(sum(i.total) filter (where i.approved), 0) - q.discount_amount, 0) as total
from public.quotes q
left join public.quote_items i on i.quote_id = q.id
group by q.id;

create view public.dashboard_status_counts with (security_invoker = true) as
select status, count(*)::int as total
from public.service_orders
where checkin_completed_at is not null
group by status;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles                 enable row level security;
alter table public.customers                enable row level security;
alter table public.vehicles                 enable row level security;
alter table public.service_orders           enable row level security;
alter table public.photo_categories         enable row level security;
alter table public.checkin_inspections      enable row level security;
alter table public.checkin_inspection_items enable row level security;
alter table public.diagnostics              enable row level security;
alter table public.diagnostic_defects       enable row level security;
alter table public.quotes                   enable row level security;
alter table public.quote_items              enable row level security;
alter table public.performed_services       enable row level security;
alter table public.checkouts                enable row level security;
alter table public.vehicle_photos           enable row level security;
alter table public.service_order_events     enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.contact_requests         enable row level security;

-- Privilégios base: anon só insere solicitação de contato
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant insert (name, phone, plate, brand_model, service, description, preferred_period, request_type, lgpd_consent)
  on public.contact_requests to anon, authenticated;

grant select on all tables in schema public to authenticated;           -- RLS filtra
grant insert, update on public.customers, public.vehicles, public.service_orders,
  public.checkin_inspections, public.checkin_inspection_items, public.diagnostics,
  public.diagnostic_defects, public.quotes, public.quote_items, public.performed_services,
  public.checkouts, public.vehicle_photos to authenticated;
grant delete on public.checkin_inspection_items, public.diagnostic_defects, public.quote_items,
  public.performed_services, public.customers, public.vehicles, public.vehicle_photos to authenticated;
grant insert, update, delete on public.photo_categories to authenticated;
grant update (status, handled_by, internal_notes, plate, brand_model, service, preferred_period, request_type)
  on public.contact_requests to authenticated;
grant delete on public.contact_requests to authenticated;
-- profiles: SEM insert/update/delete para clientes (somente via função admin-users)
-- audit_logs / service_order_events: somente leitura (inseridos por triggers)

grant execute on function public.is_staff(), public.is_master(), public.can_checkout(),
  public.current_app_role(), public.os_is_closed(uuid),
  public.register_session_event(text), public.get_my_profile() to authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_master());

-- Tabelas operacionais: equipe ativa lê/insere/edita; exclusão só MasterAdm
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','service_orders','checkin_inspections','checkin_inspection_items',
                           'diagnostics','diagnostic_defects','quotes','quote_items','performed_services',
                           'vehicle_photos'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_staff())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_staff())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_master())', t, t);
  end loop;
end $$;
-- Itens editáveis durante o atendimento (mecânico pode remover item de rascunho)
create policy checkin_inspection_items_delete_staff on public.checkin_inspection_items for delete to authenticated using (public.is_staff());
create policy diagnostic_defects_delete_staff on public.diagnostic_defects for delete to authenticated using (public.is_staff());
create policy quote_items_delete_staff on public.quote_items for delete to authenticated using (public.is_staff());

-- Check-out: somente quem tem autorização
create policy checkouts_select on public.checkouts for select to authenticated using (public.is_staff());
create policy checkouts_insert on public.checkouts for insert to authenticated with check (public.can_checkout());
create policy checkouts_update on public.checkouts for update to authenticated using (public.can_checkout()) with check (public.can_checkout());

-- Catálogo de fotos: todos leem, só master configura
create policy photo_categories_select on public.photo_categories for select to authenticated using (public.is_staff());
create policy photo_categories_write  on public.photo_categories for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- Histórico de status e auditoria
create policy service_order_events_select on public.service_order_events for select to authenticated using (public.is_staff());
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_master());

-- Site público: insere, nunca lê
create policy contact_requests_insert on public.contact_requests for insert to anon, authenticated
  with check (status = 'novo' and handled_by is null and lgpd_consent);
create policy contact_requests_select on public.contact_requests for select to authenticated using (public.is_staff());
create policy contact_requests_update on public.contact_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy contact_requests_delete on public.contact_requests for delete to authenticated using (public.is_master());
