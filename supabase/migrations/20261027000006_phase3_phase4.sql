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
