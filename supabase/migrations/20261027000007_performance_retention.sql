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
