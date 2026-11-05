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
