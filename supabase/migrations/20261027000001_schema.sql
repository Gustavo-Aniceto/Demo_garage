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
