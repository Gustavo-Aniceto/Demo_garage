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
