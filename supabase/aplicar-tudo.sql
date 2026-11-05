-- Todas as migrações em ordem, para colar de uma vez no SQL Editor do Supabase (projeto da DEMO).

-- ===== 20261027000001_schema.sql =====
-- =====================================================================
-- OFICINA MODELO — Migração 1: estrutura do banco
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type public.app_role as enum ('master', 'mecanico');

create type public.os_status as enum (
  'aguardando_diagnostico', 'em_diagnostico', 'aguardando_orcamento',
  'aguardando_aprovacao', 'aguardando_pecas', 'aguardando_execucao',
  'em_execucao', 'aguardando_conferencia', 'pronto_retirada',
  'entregue', 'cancelado'
);
create type public.quote_status as enum ('em_elaboracao', 'pendente_aprovacao', 'aprovado', 'recusado', 'cancelado');
create type public.inspection_result as enum ('sem_avaria', 'com_avaria', 'nao_verificado', 'nao_aplicavel');
create type public.fuel_level as enum ('reserva', '1_4', '1_2', '3_4', 'cheio');
create type public.photo_stage as enum ('checkin', 'checkup', 'checkout');
create type public.defect_category as enum (
  'motor', 'injecao_eletronica', 'suspensao', 'freios', 'sistema_eletrico',
  'transmissao', 'arrefecimento', 'pneus', 'carroceria', 'outros'
);
create type public.approval_method as enum ('presencial', 'whatsapp', 'telefone', 'email', 'outro');
create type public.item_kind as enum ('servico', 'peca', 'mao_de_obra');
create type public.execution_status as enum ('executado', 'nao_executado', 'pendente');
create type public.contact_status as enum ('novo', 'em_atendimento', 'respondido', 'arquivado');

-- ---------- Usuários internos (senhas ficam SOMENTE no Supabase Auth) ----------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete restrict,
  full_name            text not null check (length(btrim(full_name)) between 3 and 120),
  login                text not null check (login ~ '^[A-Za-z0-9._-]{3,40}$'),
  role                 public.app_role not null default 'mecanico',
  active               boolean not null default true,
  must_change_password boolean not null default true,
  can_checkout         boolean not null default true,
  last_access_at       timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id),
  updated_at           timestamptz not null default now()
);
create unique index profiles_login_unique on public.profiles (lower(login));
-- Só pode existir UM MasterAdm
create unique index profiles_single_master on public.profiles (role) where role = 'master';

-- ---------- Clientes ----------
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(btrim(full_name)) between 2 and 120),
  phone        text not null,
  phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  cpf          text check (cpf is null or cpf ~ '^\d{11}$'),
  notes        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now(),
  constraint customers_phone_len check (length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13)
);
create index customers_name_idx  on public.customers (lower(full_name) text_pattern_ops);
create index customers_phone_idx on public.customers (phone_digits);

-- ---------- Veículos ----------
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  plate            text not null,
  -- normaliza "abc-1d23" -> "ABC1D23" (padrão antigo AAA9999 e Mercosul AAA9A99)
  plate_normalized text generated always as (upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g'))) stored,
  brand            text not null,
  model            text not null,
  year_manufacture smallint check (year_manufacture between 1950 and 2100),
  year_model       smallint check (year_model between 1950 and 2101),
  color            text,
  vehicle_type     text not null default 'carro'
                   check (vehicle_type in ('carro', 'moto', 'utilitario', 'caminhonete', 'caminhao', 'outro')),
  customer_id      uuid not null references public.customers(id) on delete restrict,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now(),
  constraint vehicles_plate_format check (plate_normalized ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$')
);
create unique index vehicles_plate_unique on public.vehicles (plate_normalized);
create index vehicles_customer_idx on public.vehicles (customer_id);

-- ---------- Ordens de serviço ----------
create sequence public.service_order_seq;

create table public.service_orders (
  id                    uuid primary key default gen_random_uuid(),
  number                text not null unique,           -- gerado por trigger (OS-2026-000001)
  client_request_id     uuid unique,                    -- idempotência contra clique duplo/reenvio
  customer_id           uuid not null references public.customers(id) on delete restrict,
  vehicle_id            uuid not null references public.vehicles(id) on delete restrict,
  status                public.os_status not null default 'aguardando_diagnostico',
  opened_at             timestamptz not null default now(),
  opened_by             uuid references public.profiles(id),
  checkin_completed_at  timestamptz,                    -- null = check-in em rascunho
  closed_at             timestamptz,
  closed_by             uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  created_by            uuid references public.profiles(id),
  updated_at            timestamptz not null default now()
);
create index service_orders_vehicle_idx on public.service_orders (vehicle_id, opened_at desc);
create index service_orders_customer_idx on public.service_orders (customer_id);
create index service_orders_status_idx on public.service_orders (status);

-- ---------- Catálogo de categorias de foto (oficina define as obrigatórias) ----------
create table public.photo_categories (
  code       text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  label      text not null,
  stage      public.photo_stage not null,
  required   boolean not null default false,
  sort_order smallint not null default 0,
  active     boolean not null default true
);

-- ---------- Check-in ----------
create table public.checkin_inspections (
  id                        uuid primary key default gen_random_uuid(),
  service_order_id          uuid not null unique references public.service_orders(id) on delete restrict,
  entered_at                timestamptz not null default now(),
  km_in                     integer not null check (km_in between 0 and 3000000),
  fuel_level                public.fuel_level,
  responsible_id            uuid not null references public.profiles(id),
  visit_reason              text,
  customer_complaint        text,         -- RELATO do cliente
  dashboard_lights          text[] not null default '{}',
  customer_reported_alerts  text,         -- RELATO do cliente
  starting_difficulty       boolean,
  noises_reported           text,         -- RELATO do cliente
  vibrations_reported       text,         -- RELATO do cliente
  leaks_observed            text,         -- CONSTATAÇÃO do funcionário
  staff_observations        text,         -- CONSTATAÇÃO do funcionário
  accessories_received      text,
  customer_ack              boolean not null default false,
  customer_ack_name         text,
  customer_ack_method       public.approval_method,
  created_at                timestamptz not null default now(),
  created_by                uuid references public.profiles(id),
  updated_at                timestamptz not null default now(),
  constraint checkin_ack_ck check (not customer_ack or (customer_ack_name is not null and customer_ack_method is not null))
);

create table public.checkin_inspection_items (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.checkin_inspections(id) on delete cascade,
  item_code     text not null check (item_code in (
                  'pintura_riscos', 'amassados', 'batidas', 'trincas', 'para_choques', 'pneus',
                  'vidros', 'retrovisores', 'interior', 'acessorios', 'outros')),
  result        public.inspection_result not null default 'nao_verificado',
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  unique (inspection_id, item_code)
);

-- ---------- Check-up / diagnóstico ----------
create table public.diagnostics (
  id                   uuid primary key default gen_random_uuid(),
  service_order_id     uuid not null references public.service_orders(id) on delete restrict,
  performed_at         timestamptz not null default now(),
  mechanic_id          uuid not null references public.profiles(id),
  symptoms             text,
  tests_performed      text,
  technical_diagnosis  text,
  recommended_services text,
  required_parts       text,
  notes                text,
  needs_reevaluation   boolean not null default false,
  created_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id),
  updated_at           timestamptz not null default now()
);
create index diagnostics_os_idx on public.diagnostics (service_order_id);

create table public.diagnostic_defects (
  id            uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  category      public.defect_category not null,
  description   text not null,
  severity      text not null default 'media' check (severity in ('baixa', 'media', 'alta', 'critica')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now()
);

-- ---------- Orçamentos ----------
create table public.quotes (
  id                     uuid primary key default gen_random_uuid(),
  service_order_id       uuid not null references public.service_orders(id) on delete restrict,
  version                smallint not null default 1,
  status                 public.quote_status not null default 'em_elaboracao',
  prepared_by            uuid not null references public.profiles(id),
  prepared_at            timestamptz not null default now(),
  discount_amount        numeric(12,2) not null default 0 check (discount_amount >= 0),
  discount_authorized_by uuid references public.profiles(id),
  approved_at            timestamptz,
  approved_registered_by uuid references public.profiles(id),
  approved_by_name       text,              -- quem autorizou (cliente)
  approval_method        public.approval_method,
  approval_notes         text,
  refused_at             timestamptz,
  notes                  text,
  created_at             timestamptz not null default now(),
  created_by             uuid references public.profiles(id),
  updated_at             timestamptz not null default now(),
  unique (service_order_id, version),
  constraint quotes_discount_auth check (discount_amount = 0 or discount_authorized_by is not null),
  -- Não existe "aprovado" sem registro da autorização
  constraint quotes_approval_registered check (
    status <> 'aprovado' or (approved_at is not null and approved_registered_by is not null
                             and approved_by_name is not null and approval_method is not null))
);

create table public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  kind        public.item_kind not null,
  description text not null,
  quantity    numeric(10,3) not null default 1 check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  total       numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  approved    boolean not null default true,  -- aprovação parcial por item
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);
create index quote_items_quote_idx on public.quote_items (quote_id);

-- ---------- Serviços executados / não executados / pendências ----------
create table public.performed_services (
  id               uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  quote_item_id    uuid references public.quote_items(id) on delete set null,
  kind             public.item_kind not null,
  description      text not null,
  quantity         numeric(10,3) not null default 1 check (quantity > 0),
  status           public.execution_status not null default 'executado',
  performed_by     uuid references public.profiles(id),
  performed_at     timestamptz not null default now(),
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now()
);
create index performed_services_os_idx on public.performed_services (service_order_id);

-- ---------- Check-out ----------
create table public.checkouts (
  id                     uuid primary key default gen_random_uuid(),
  service_order_id       uuid not null unique references public.service_orders(id) on delete restrict,
  checked_out_at         timestamptz not null default now(),
  km_out                 integer not null check (km_out between 0 and 3000000),
  mechanic_id            uuid not null references public.profiles(id),
  released_by            uuid not null references public.profiles(id),
  pending_items          text,
  future_recommendations text,
  final_notes            text,
  delivered_to_name      text,
  delivery_confirmed     boolean not null default false,
  created_at             timestamptz not null default now(),
  created_by             uuid references public.profiles(id),
  updated_at             timestamptz not null default now(),
  constraint checkout_delivery_ck check (not delivery_confirmed or delivered_to_name is not null)
);

-- ---------- Fotografias (arquivo no Storage, metadados aqui) ----------
create table public.vehicle_photos (
  id                uuid primary key default gen_random_uuid(),
  service_order_id  uuid not null references public.service_orders(id) on delete restrict,
  vehicle_id        uuid not null references public.vehicles(id) on delete restrict,
  stage             public.photo_stage not null,
  category          text not null references public.photo_categories(code),
  description       text,
  storage_path      text not null unique,
  mime_type         text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes        integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  width             integer,
  height            integer,
  taken_at          timestamptz not null default now(),
  include_in_report boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id),
  updated_at        timestamptz not null default now(),
  -- caminho obrigatório: os/<id da OS>/<etapa>/<arquivo>
  constraint vehicle_photos_path_ck check (storage_path like 'os/' || service_order_id::text || '/' || stage::text || '/%')
);
create index vehicle_photos_os_idx on public.vehicle_photos (service_order_id, stage);
create index vehicle_photos_vehicle_idx on public.vehicle_photos (vehicle_id, taken_at desc);

-- ---------- Histórico de status ----------
create table public.service_order_events (
  id               bigint generated always as identity primary key,
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  from_status      public.os_status,
  to_status        public.os_status not null,
  actor_id         uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index service_order_events_os_idx on public.service_order_events (service_order_id, created_at);

-- ---------- Auditoria (somente inserção) ----------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text,
  entity_id  text,
  result     text not null default 'sucesso' check (result in ('sucesso', 'negado', 'erro')),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- ---------- Solicitações do site público ----------
create table public.contact_requests (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 2 and 120),
  phone            text not null check (length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13),
  plate            text check (plate is null or length(plate) <= 10),
  brand_model      text check (brand_model is null or length(brand_model) <= 120),
  service          text check (service is null or length(service) <= 120),
  description      text check (description is null or length(description) <= 2000),
  preferred_period text check (preferred_period is null or length(preferred_period) <= 120),
  request_type     text not null default 'orcamento' check (request_type in ('orcamento', 'agendamento', 'contato')),
  lgpd_consent     boolean not null check (lgpd_consent),
  status           public.contact_status not null default 'novo',
  handled_by       uuid references public.profiles(id),
  internal_notes   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index contact_requests_status_idx on public.contact_requests (status, created_at desc);

-- ---------- Dados iniciais: categorias de foto ----------
insert into public.photo_categories (code, label, stage, required, sort_order) values
  ('frente',            'Frente do veículo',      'checkin',  true,  1),
  ('traseira',          'Traseira',               'checkin',  true,  2),
  ('lateral_esquerda',  'Lateral esquerda',       'checkin',  true,  3),
  ('lateral_direita',   'Lateral direita',        'checkin',  true,  4),
  ('painel_km',         'Painel e quilometragem', 'checkin',  true,  5),
  ('interior',          'Interior',               'checkin',  false, 6),
  ('placa',             'Placa',                  'checkin',  false, 7),
  ('avaria',            'Riscos / amassados / batidas', 'checkin', false, 8),
  ('luzes_advertencia', 'Luzes de advertência',   'checkin',  false, 9),
  ('vazamento',         'Vazamentos',             'checkin',  false, 10),
  ('outros_entrada',    'Outros (entrada)',       'checkin',  false, 11),
  ('detalhe_tecnico',   'Detalhe técnico',        'checkup',  false, 20),
  ('peca_defeito',      'Peça com defeito',       'checkup',  false, 21),
  ('frente_saida',      'Frente (saída)',         'checkout', false, 30),
  ('painel_km_saida',   'Painel e km (saída)',    'checkout', false, 31),
  ('servico_executado', 'Serviço executado',      'checkout', false, 32),
  ('outros_saida',      'Outros (saída)',         'checkout', false, 33);

-- ===== 20261027000002_security.sql =====
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

-- ===== 20261027000003_storage.sql =====
-- =====================================================================
-- OFICINA MODELO — Migração 3: Storage privado das fotografias
-- Caminho: os/<id da OS>/<checkin|checkup|checkout>/<uuid>.jpg
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos', 'vehicle-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Valida o caminho sem quebrar em UUID malformado
create or replace function public.photo_path_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(p_name, '/');
  v_os uuid;
begin
  if array_length(parts, 1) <> 4 or parts[1] <> 'os' or parts[3] not in ('checkin', 'checkup', 'checkout')
     or parts[4] !~ '^[A-Za-z0-9_-]{8,80}\.(jpg|jpeg|png|webp)$' then
    return false;
  end if;
  begin
    v_os := parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (select 1 from public.service_orders where id = v_os and status not in ('entregue', 'cancelado'));
end $$;
revoke execute on function public.photo_path_upload_allowed(text) from public, anon;
grant execute on function public.photo_path_upload_allowed(text) to authenticated;

create policy "vehicle_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-photos' and public.is_staff());

create policy "vehicle_photos_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-photos' and public.is_staff() and public.photo_path_upload_allowed(name));

-- Fotos são evidência: sem sobrescrita; exclusão somente MasterAdm
create policy "vehicle_photos_delete_master" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-photos' and public.is_master());

-- ===== 20261027000004_review_phase2.sql =====
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

-- ===== 20261027000005_lock_function_grants.sql =====
-- =====================================================================
-- OFICINA MODELO — Migração 5: fecha execução de funções para visitantes
-- No Supabase, funções novas nascem executáveis por PUBLIC/anon. Revogamos tudo
-- e liberamos explicitamente só o que o app usa (usuários logados).
-- REPITA este bloco ao final de toda migração futura que criar funções.
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_staff(), public.is_master(), public.can_checkout(), public.current_app_role(),
  public.os_is_closed(uuid), public.photo_path_upload_allowed(text),
  public.register_session_event(text), public.get_my_profile(),
  public.staff_directory(), public.dashboard_summary(),
  public.recent_activity(int), public.search_customers(text, int)
to authenticated;

grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- ===== 20261027000006_phase3_phase4.sql =====
-- =====================================================================
-- OFICINA MODELO — Migração 6: suporte às fases 3 e 4
--   • busca de ordens de serviço
--   • limite de envios do formulário público (anti-spam)
--   • anonimização de cliente (LGPD), exclusiva do MasterAdm
-- =====================================================================

-- ---------- Busca de OS: número, placa ou cliente + filtro de status ----------
create or replace function public.search_service_orders(
  p_query text default '', p_status public.os_status default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, number text, status public.os_status, opened_at timestamptz, closed_at timestamptz,
               checkin_completed_at timestamptz, vehicle_id uuid, plate text, vehicle text, customer_name text)
language sql stable security invoker set search_path = public as $$
  with q as (
    select btrim(coalesce(p_query, '')) as raw,
           upper(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9]', '', 'g')) as norm
  )
  select so.id, so.number, so.status, so.opened_at, so.closed_at, so.checkin_completed_at,
         v.id, v.plate_normalized, v.brand || ' ' || v.model, c.full_name
  from public.service_orders so
  join public.vehicles v on v.id = so.vehicle_id
  join public.customers c on c.id = so.customer_id
  cross join q
  where (p_status is null or so.status = p_status)
    and (q.raw = ''
         or (length(q.norm) >= 2 and (upper(replace(so.number, '-', '')) like '%' || q.norm || '%'
                                      or v.plate_normalized like '%' || q.norm || '%'))
         or c.full_name ilike '%' || replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by so.opened_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------- Formulário público: limite de envios ----------
create index if not exists contact_requests_created_idx on public.contact_requests (created_at desc);

create or replace function public.tg_contact_requests_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_digits text := regexp_replace(new.phone, '\D', '', 'g');
begin
  if auth.uid() is not null and public.is_staff() then return new; end if;
  if (select count(*) from public.contact_requests
       where regexp_replace(phone, '\D', '', 'g') = v_digits and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Você já enviou solicitações há pouco. Aguarde nosso contato ou chame no WhatsApp.' using errcode = '54000';
  end if;
  if (select count(*) from public.contact_requests where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Muitas solicitações neste momento. Tente em alguns minutos ou chame no WhatsApp.' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger contact_requests_rate_limit before insert on public.contact_requests
  for each row execute function public.tg_contact_requests_rate_limit();

-- ---------- LGPD: anonimização de cliente ----------
-- Mantém o histórico técnico do veículo, remove dados pessoais (inclusive da auditoria).
create or replace function public.tg_audit_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and current_setting('oficina.audit_scrub', true) = 'on' then
    return new;  -- liberado somente dentro de anonymize_customer()
  end if;
  raise exception 'Registros de auditoria não podem ser alterados ou excluídos' using errcode = '42501';
end $$;

create or replace function public.anonymize_customer(p_customer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_os uuid[];
begin
  if not public.is_master() then
    raise exception 'Somente o MasterAdm pode anonimizar clientes' using errcode = '42501';
  end if;
  select coalesce(array_agg(id), '{}') into v_os from public.service_orders where customer_id = p_customer;

  update public.customers
     set full_name = 'Cliente anonimizado', phone = '00000000000', email = null, cpf = null, notes = null
   where id = p_customer;
  if not found then raise exception 'Cliente não encontrado' using errcode = 'P0002'; end if;

  update public.checkin_inspections set customer_ack_name = 'Anonimizado'
   where service_order_id = any(v_os) and customer_ack_name is not null;
  update public.quotes set approved_by_name = 'Anonimizado'
   where service_order_id = any(v_os) and approved_by_name is not null;
  update public.checkouts set delivered_to_name = 'Anonimizado'
   where service_order_id = any(v_os) and delivered_to_name is not null;

  perform set_config('oficina.audit_scrub', 'on', true);
  update public.audit_logs set details = '{"anonimizado": true}'::jsonb
   where (entity = 'customers' and entity_id = p_customer::text)
      or (entity in ('checkin_inspections', 'quotes', 'checkouts')
          and (details ->> 'service_order_id')::uuid = any(v_os))
      or (entity in ('checkin_inspections', 'quotes', 'checkouts')
          and entity_id in (select id::text from public.checkin_inspections where service_order_id = any(v_os)
                            union all select id::text from public.quotes where service_order_id = any(v_os)
                            union all select id::text from public.checkouts where service_order_id = any(v_os)));
  perform set_config('oficina.audit_scrub', 'off', true);

  insert into public.audit_logs (actor_id, action, entity, entity_id)
  values (auth.uid(), 'cliente.anonimizado', 'customers', p_customer::text);
end $$;

-- ---------- Permissões (ver migração 5) ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_staff(), public.is_master(), public.can_checkout(), public.current_app_role(),
  public.os_is_closed(uuid), public.photo_path_upload_allowed(text),
  public.register_session_event(text), public.get_my_profile(),
  public.staff_directory(), public.dashboard_summary(),
  public.recent_activity(int), public.search_customers(text, int),
  public.search_service_orders(text, public.os_status, int, int),
  public.anonymize_customer(uuid)
to authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- ===== 20261027000007_performance_retention.sql =====
-- =====================================================================
-- OFICINA MODELO — Migração 7: desempenho (alertas do Supabase) e retenção
-- =====================================================================

-- ---------- 1) RLS: permissão avaliada UMA vez por consulta, não por linha ----------
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_master()));

do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','service_orders','checkin_inspections','diagnostics','quotes',
                           'performed_services','vehicle_photos'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using ((select public.is_staff()))', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check ((select public.is_staff()))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using ((select public.is_master()))', t, t);
  end loop;
  -- itens editáveis durante o atendimento: a equipe pode remover (uma política só)
  foreach t in array array['checkin_inspection_items','diagnostic_defects','quote_items'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using ((select public.is_staff()))', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check ((select public.is_staff()))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using ((select public.is_staff()))', t, t);
  end loop;
end $$;

create policy checkouts_select on public.checkouts for select to authenticated using ((select public.is_staff()));
create policy checkouts_insert on public.checkouts for insert to authenticated with check ((select public.can_checkout()));
create policy checkouts_update on public.checkouts for update to authenticated
  using ((select public.can_checkout())) with check ((select public.can_checkout()));

create policy photo_categories_select on public.photo_categories for select to authenticated using ((select public.is_staff()));
create policy photo_categories_insert on public.photo_categories for insert to authenticated with check ((select public.is_master()));
create policy photo_categories_update on public.photo_categories for update to authenticated
  using ((select public.is_master())) with check ((select public.is_master()));
create policy photo_categories_delete on public.photo_categories for delete to authenticated using ((select public.is_master()));

create policy service_order_events_select on public.service_order_events for select to authenticated using ((select public.is_staff()));
create policy audit_logs_select on public.audit_logs for select to authenticated using ((select public.is_master()));

create policy contact_requests_insert on public.contact_requests for insert to anon, authenticated
  with check (status = 'novo' and handled_by is null and lgpd_consent);
create policy contact_requests_select on public.contact_requests for select to authenticated using ((select public.is_staff()));
create policy contact_requests_update on public.contact_requests for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy contact_requests_delete on public.contact_requests for delete to authenticated using ((select public.is_master()));

-- Storage: mesma otimização
drop policy if exists "vehicle_photos_read" on storage.objects;
drop policy if exists "vehicle_photos_upload" on storage.objects;
drop policy if exists "vehicle_photos_delete_master" on storage.objects;
create policy "vehicle_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-photos' and (select public.is_staff()));
create policy "vehicle_photos_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-photos' and (select public.is_staff()) and public.photo_path_upload_allowed(name));
create policy "vehicle_photos_delete_master" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-photos' and (select public.is_master()));

-- ---------- 2) Índices de chaves estrangeiras usadas em consultas ----------
-- (as colunas created_by/closed_by não recebem índice: perfis nunca são excluídos)
create index if not exists diagnostic_defects_diagnostic_idx on public.diagnostic_defects (diagnostic_id);
create index if not exists performed_services_quote_item_idx on public.performed_services (quote_item_id);
create index if not exists checkin_inspections_responsible_idx on public.checkin_inspections (responsible_id);
create index if not exists diagnostics_mechanic_idx on public.diagnostics (mechanic_id);
create index if not exists checkouts_mechanic_idx on public.checkouts (mechanic_id);
create index if not exists vehicle_photos_category_idx on public.vehicle_photos (category);
create index if not exists service_order_events_actor_idx on public.service_order_events (actor_id);

-- ---------- 3) Categoria de foto: não pode ser obrigatória e inativa ao mesmo tempo ----------
alter table public.photo_categories
  add constraint photo_categories_required_active check (not required or active);

-- ---------- 4) Retenção (LGPD): pedidos do site respondidos/arquivados há mais de 12 meses ----------
create or replace function public.purge_old_contact_requests()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.contact_requests
   where status in ('respondido', 'arquivado') and updated_at < now() - interval '12 months';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_logs (actor_id, action, entity, details)
    values (null, 'retencao.pedidos_excluidos', 'contact_requests', jsonb_build_object('quantidade', n));
  end if;
  return n;
end $$;
revoke execute on function public.purge_old_contact_requests() from public, anon, authenticated;

-- Agendamento diário às 03:30 (horário de Brasília = 06:30 UTC), se o pg_cron existir
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'retencao-pedidos';
    perform cron.schedule('retencao-pedidos', '30 6 * * *', 'select public.purge_old_contact_requests()');
  end if;
end $$;
