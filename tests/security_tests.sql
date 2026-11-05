-- =====================================================================
-- Testes de permissão e regras (critérios 1–14 do projeto, parte de banco)
-- Rodar no banco LOCAL (supabase start) — NUNCA em produção:
--   psql "$DB_URL_LOCAL" -v ON_ERROR_STOP=1 -f tests/security_tests.sql
-- Tudo roda numa transação e é desfeito no final.
-- =====================================================================
begin;

create function pg_temp.expect_fail(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK (bloqueado) — % → %', p_label, sqlerrm;
    return;
  end;
  raise exception 'FALHA: deveria ter sido bloqueado — %', p_label;
end $$;

create function pg_temp.expect_ok(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'OK — %', p_label;
end $$;

create function pg_temp.check(p_sql text, p_label text) returns void language plpgsql as $$
declare v boolean;
begin
  execute p_sql into v;
  if v is not true then raise exception 'FALHA: %', p_label; end if;
  raise notice 'OK — %', p_label;
end $$;

create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

grant execute on function pg_temp.expect_fail(text, text), pg_temp.expect_ok(text, text), pg_temp.check(text, text), pg_temp.as_user(uuid) to anon, authenticated;

-- ---------- Massa de teste (como superusuário) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000d', 'outro@teste.local'),
  ('00000000-0000-0000-0000-00000000000a', 'masteradm@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'mecanico1@teste.local'),
  ('00000000-0000-0000-0000-00000000000c', 'mecanico2@teste.local');
insert into public.profiles (id, full_name, login, role, must_change_password) values
  ('00000000-0000-0000-0000-00000000000a', 'Administrador Master', 'MasterAdm', 'master', true),
  ('00000000-0000-0000-0000-00000000000b', 'Mecânico Um', 'mecanico1', 'mecanico', false),
  ('00000000-0000-0000-0000-00000000000c', 'Mecânico Dois', 'mecanico2', 'mecanico', false);
update public.profiles set can_checkout = false where login = 'mecanico2';

select pg_temp.expect_fail($t$insert into public.profiles (id, full_name, login, role) values ('00000000-0000-0000-0000-00000000000d','X Y Z','outro','master')$t$,
  'segundo MasterAdm');
select pg_temp.expect_fail($t$delete from public.profiles where login = 'MasterAdm'$t$, 'excluir MasterAdm (mesmo como superusuário)');
select pg_temp.expect_fail($t$update public.profiles set active = false where login = 'MasterAdm'$t$, 'desativar MasterAdm');

-- ---------- Critério 1: master com senha pendente não opera ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check($t$select not public.is_master() and not public.is_staff()$t$, 'master sem trocar senha inicial não tem acesso (critério 1)');
select pg_temp.expect_ok($t$select * from public.get_my_profile()$t$, 'master consegue ler o próprio perfil (para tela de troca de senha)');
reset role;
update public.profiles set must_change_password = false where login = 'MasterAdm';  -- (simula change-password)

-- ---------- Critério 4: mecânico não gerencia usuários ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_fail($t$insert into public.profiles (id, full_name, login, role) values (gen_random_uuid(),'Hacker','hacker','mecanico')$t$, 'mecânico criando usuário');
select pg_temp.expect_fail($t$update public.profiles set role = 'master' where id = auth.uid()$t$, 'mecânico se promovendo a master');
select pg_temp.expect_fail($t$update public.profiles set can_checkout = true where login = 'mecanico2'$t$, 'mecânico alterando permissões');
select pg_temp.expect_fail($t$select public.admin_revoke_sessions('00000000-0000-0000-0000-00000000000a')$t$, 'mecânico revogando sessões do master');
select pg_temp.check($t$select count(*) = 1 from public.profiles$t$, 'mecânico só enxerga o próprio perfil');
select pg_temp.check($t$select count(*) = 0 from public.audit_logs$t$, 'mecânico não lê auditoria');

-- ---------- Critério 5: clientes e veículos ----------
select pg_temp.expect_ok($t$insert into public.customers (id, full_name, phone) values ('10000000-0000-0000-0000-000000000001','Cliente Teste','(11) 90000-0000')$t$, 'cadastrar cliente');
select pg_temp.expect_ok($t$insert into public.vehicles (id, plate, brand, model, customer_id) values ('20000000-0000-0000-0000-000000000001','abc-1d23','Fiat','Argo','10000000-0000-0000-0000-000000000001')$t$, 'cadastrar veículo (placa Mercosul)');
select pg_temp.expect_fail($t$insert into public.vehicles (plate, brand, model, customer_id) values ('ABC1D23','Fiat','Uno','10000000-0000-0000-0000-000000000001')$t$, 'placa duplicada');
select pg_temp.expect_fail($t$insert into public.vehicles (plate, brand, model, customer_id) values ('12ABCDE','Fiat','Uno','10000000-0000-0000-0000-000000000001')$t$, 'placa em formato inválido');
select pg_temp.check($t$with i as (insert into public.customers (full_name, phone, created_by) values ('Fraude Teste','11900000000','00000000-0000-0000-0000-00000000000a') returning created_by) select created_by = auth.uid() from i$t$,
  'autoria não pode ser falsificada (created_by forçado ao usuário real)');

-- ---------- Critério 6: check-in ----------
select pg_temp.expect_ok($t$insert into public.service_orders (id, client_request_id, customer_id, vehicle_id, status, number)
  values ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','entregue','HACK-1')$t$,
  'abrir OS (número e status impostos pelo servidor)');
select pg_temp.expect_fail($t$insert into public.service_orders (client_request_id, customer_id, vehicle_id)
  values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')$t$, 'OS duplicada por clique repetido');
select pg_temp.check($t$select number ~ '^OS-\d{4}-\d{6}$' and status = 'aguardando_diagnostico' from public.service_orders where id='30000000-0000-0000-0000-000000000001'$t$,
  'número OS-AAAA-NNNNNN e status inicial impostos pelo servidor');
select pg_temp.expect_fail($t$update public.service_orders set checkin_completed_at = now() where id = '30000000-0000-0000-0000-000000000001'$t$, 'concluir check-in sem inspeção');
select pg_temp.expect_ok($t$insert into public.checkin_inspections (id, service_order_id, km_in, responsible_id, customer_complaint)
  values ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',45200,auth.uid(),'Barulho ao frear')$t$, 'registrar inspeção de entrada');
select pg_temp.expect_ok($t$insert into public.checkin_inspection_items (inspection_id, item_code, result, notes)
  values ('50000000-0000-0000-0000-000000000001','pintura_riscos','com_avaria','Risco porta traseira esquerda')$t$, 'registrar item de inspeção');
select pg_temp.expect_fail($t$update public.service_orders set checkin_completed_at = now() where id = '30000000-0000-0000-0000-000000000001'$t$, 'concluir check-in sem fotos obrigatórias');
select pg_temp.expect_fail($t$insert into public.vehicle_photos (service_order_id, vehicle_id, stage, category, storage_path, mime_type, size_bytes)
  values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','checkin','frente','os/30000000-0000-0000-0000-000000000001/checkin/naoenviado1.jpg','image/jpeg',1000)$t$,
  'registrar foto que NÃO está no Storage');

-- Upload no Storage (critério 7)
select pg_temp.expect_fail($t$insert into storage.objects (bucket_id, name) values ('vehicle-photos','publico/foto.jpg')$t$, 'upload fora do caminho permitido');
select pg_temp.expect_fail($t$insert into storage.objects (bucket_id, name) values ('vehicle-photos','os/nao-e-uuid/checkin/abcdefgh.jpg')$t$, 'upload com OS inválida');
select pg_temp.expect_ok($t$insert into storage.objects (bucket_id, name)
  select 'vehicle-photos', 'os/30000000-0000-0000-0000-000000000001/checkin/foto_' || c || '.jpg'
  from unnest(array['frente','traseira','lateral_esquerda','lateral_direita','painel_km']) c$t$, 'upload das 5 fotos obrigatórias');
select pg_temp.expect_ok($t$insert into public.vehicle_photos (service_order_id, vehicle_id, stage, category, storage_path, mime_type, size_bytes)
  select '30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','checkin', c,
         'os/30000000-0000-0000-0000-000000000001/checkin/foto_' || c || '.jpg','image/jpeg',250000
  from unnest(array['frente','traseira','lateral_esquerda','lateral_direita','painel_km']) c$t$, 'registrar metadados das fotos');
select pg_temp.expect_fail($t$insert into public.vehicle_photos (service_order_id, vehicle_id, stage, category, storage_path, mime_type, size_bytes)
  values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','checkout','frente','os/30000000-0000-0000-0000-000000000001/checkout/foto_frente.jpg','image/jpeg',1)$t$,
  'categoria de foto incompatível com a etapa');
select pg_temp.expect_ok($t$update public.service_orders set checkin_completed_at = now() where id = '30000000-0000-0000-0000-000000000001'$t$, 'concluir check-in');
select pg_temp.check($t$with d as (delete from storage.objects where bucket_id = 'vehicle-photos' returning 1) select count(*) = 0 from d$t$, 'mecânico não apaga fotos');

-- ---------- Critério 8: diagnóstico e orçamento ----------
select pg_temp.expect_ok($t$update public.service_orders set status = 'em_diagnostico' where id = '30000000-0000-0000-0000-000000000001'$t$, 'status → em diagnóstico');
select pg_temp.expect_ok($t$insert into public.diagnostics (id, service_order_id, mechanic_id, technical_diagnosis)
  values ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',auth.uid(),'Pastilhas no limite')$t$, 'registrar diagnóstico');
select pg_temp.expect_ok($t$insert into public.diagnostic_defects (diagnostic_id, category, description) values ('60000000-0000-0000-0000-000000000001','freios','Pastilha dianteira gasta')$t$, 'registrar defeito');
select pg_temp.expect_ok($t$insert into public.quotes (id, service_order_id, prepared_by) values ('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',auth.uid())$t$, 'criar orçamento');
select pg_temp.expect_ok($t$insert into public.quote_items (quote_id, kind, description, quantity, unit_price) values
  ('70000000-0000-0000-0000-000000000001','peca','Jogo de pastilhas',1,180),('70000000-0000-0000-0000-000000000001','mao_de_obra','Troca de pastilhas',1,120)$t$, 'itens do orçamento');
select pg_temp.expect_fail($t$update public.service_orders set status = 'em_execucao' where id = '30000000-0000-0000-0000-000000000001'$t$, 'executar sem orçamento aprovado');
select pg_temp.expect_fail($t$update public.quotes set status = 'aprovado' where id = '70000000-0000-0000-0000-000000000001'$t$, 'aprovar sem registrar autorização');
select pg_temp.expect_ok($t$update public.quotes set status = 'aprovado', approved_by_name = 'Cliente Teste', approval_method = 'whatsapp' where id = '70000000-0000-0000-0000-000000000001'$t$, 'aprovar com autorização registrada');
select pg_temp.expect_fail($t$update public.quote_items set unit_price = 1 where quote_id = '70000000-0000-0000-0000-000000000001'$t$, 'alterar valores de orçamento aprovado');
select pg_temp.check($t$select total = 300 from public.quote_summaries where quote_id='70000000-0000-0000-0000-000000000001'$t$, 'total do orçamento = 300,00');
select pg_temp.expect_ok($t$update public.service_orders set status = 'em_execucao' where id = '30000000-0000-0000-0000-000000000001'$t$, 'status → em execução');

-- ---------- Critério 9: check-out ----------
select pg_temp.expect_ok($t$insert into public.performed_services (service_order_id, kind, description, performed_by)
  values ('30000000-0000-0000-0000-000000000001','servico','Troca de pastilhas dianteiras',auth.uid())$t$, 'registrar serviço executado');
select pg_temp.expect_fail($t$update public.service_orders set status = 'entregue' where id = '30000000-0000-0000-0000-000000000001'$t$, 'entregar sem check-out');
select pg_temp.expect_fail($t$insert into public.checkouts (service_order_id, km_out, mechanic_id, released_by)
  values ('30000000-0000-0000-0000-000000000001',45000,auth.uid(),auth.uid())$t$, 'km final menor que a de entrada');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_fail($t$insert into public.checkouts (service_order_id, km_out, mechanic_id, released_by)
  values ('30000000-0000-0000-0000-000000000001',45210,auth.uid(),auth.uid())$t$, 'check-out por mecânico sem autorização');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_ok($t$insert into public.checkouts (service_order_id, km_out, mechanic_id, released_by, delivered_to_name, delivery_confirmed)
  values ('30000000-0000-0000-0000-000000000001',45210,auth.uid(),auth.uid(),'Cliente Teste',true)$t$, 'registrar check-out');
select pg_temp.expect_ok($t$update public.service_orders set status = 'entregue' where id = '30000000-0000-0000-0000-000000000001'$t$, 'encerrar OS (entregue)');
select pg_temp.expect_fail($t$update public.service_orders set status = 'em_execucao' where id = '30000000-0000-0000-0000-000000000001'$t$, 'mecânico reabrindo OS encerrada');
select pg_temp.expect_fail($t$update public.diagnostics set technical_diagnosis = 'alterado' where service_order_id = '30000000-0000-0000-0000-000000000001'$t$, 'alterar diagnóstico de OS encerrada');
select pg_temp.expect_fail($t$insert into storage.objects (bucket_id, name) values ('vehicle-photos','os/30000000-0000-0000-0000-000000000001/checkout/depois123.jpg')$t$, 'upload em OS encerrada');

-- ---------- Critério 10: histórico por placa ----------
select pg_temp.check($t$select (select count(*) from public.service_orders so join public.vehicles v on v.id = so.vehicle_id where v.plate_normalized = 'ABC1D23') = 1
  and (select count(*) from public.service_order_events where service_order_id = '30000000-0000-0000-0000-000000000001') = 4$t$, 'histórico por placa + eventos de status registrados');
reset role;

-- ---------- Correção pelo master gera auditoria ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_ok($t$update public.diagnostics set notes = 'Correção administrativa' where service_order_id = '30000000-0000-0000-0000-000000000001'$t$, 'master corrige OS encerrada');
select pg_temp.check($t$select exists (select 1 from public.audit_logs where entity='diagnostics' and action='update' and details ? 'notes' and actor_id = auth.uid())$t$,
  'correção aparece na auditoria com o autor (critério 14)');
select pg_temp.expect_fail($t$update public.audit_logs set result = 'erro'$t$, 'adulterar auditoria (nem o master)');
reset role;

-- ---------- Fase 2: painel, busca e diretório ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check($t$select concluidas = 1 and em_atendimento = 0 from public.dashboard_summary()$t$, 'painel calculado dos dados reais');
select pg_temp.check($t$select count(*) = 1 from public.search_customers('abc 1d2')$t$, 'busca de cliente por placa parcial');
select pg_temp.check($t$select count(*) = 2 from public.search_customers('(11) 90000')$t$, 'busca de cliente por telefone (2 clientes com o mesmo número)');
select pg_temp.check($t$select count(*) = 1 from public.search_customers('cliente t')$t$, 'busca de cliente por nome');
select pg_temp.check($t$select count(*) = 0 from public.search_customers('100%_')$t$, 'busca trata curingas %% e _ como texto');
select pg_temp.check($t$select count(*) = 4 and bool_and(actor_name is not null) from public.recent_activity(10)$t$, 'movimentações com nome do responsável');
select pg_temp.check($t$select count(*) = 3 from public.staff_directory()$t$, 'mecânico vê nomes da equipe (sem dados sensíveis)');
reset role;

-- ---------- Fases 3/4: busca de OS, anonimização, limite do formulário ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check($t$select count(*) = 1 from public.search_service_orders('abc1d', null)$t$, 'busca de OS por placa');
select pg_temp.check($t$select count(*) = 1 from public.search_service_orders((select number from public.service_orders limit 1), 'entregue')$t$, 'busca de OS por número + status');
select pg_temp.check($t$select count(*) = 0 from public.search_service_orders('', 'em_execucao')$t$, 'filtro de status');
select pg_temp.expect_fail($t$select public.anonymize_customer('10000000-0000-0000-0000-000000000001')$t$, 'mecânico anonimizando cliente');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_ok($t$select public.anonymize_customer('10000000-0000-0000-0000-000000000001')$t$, 'master anonimiza cliente');
select pg_temp.check($t$select full_name = 'Cliente anonimizado' and cpf is null from public.customers where id = '10000000-0000-0000-0000-000000000001'$t$, 'dados pessoais removidos');
select pg_temp.check($t$select (select delivered_to_name from public.checkouts limit 1) = 'Anonimizado' and (select approved_by_name from public.quotes limit 1) = 'Anonimizado'$t$, 'nomes em check-out e orçamento anonimizados');
select pg_temp.check($t$select not exists (select 1 from public.audit_logs where details::text like '%Cliente Teste%')$t$, 'auditoria sem o nome antigo');
select pg_temp.check($t$select count(*) = 1 from public.service_orders where customer_id = '10000000-0000-0000-0000-000000000001'$t$, 'histórico técnico preservado');
select pg_temp.expect_fail($t$update public.audit_logs set result = 'erro'$t$, 'auditoria continua imutável fora da anonimização');
reset role;

-- ---------- Migração 7: categorias de foto e retenção ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check($t$with u as (update public.photo_categories set required = false where code = 'frente' returning 1) select count(*) = 0 from u$t$, 'mecânico não muda fotos obrigatórias');
select pg_temp.expect_fail($t$insert into public.photo_categories (code, label, stage) values ('pneus_novos','Pneus','checkin')$t$, 'mecânico criando categoria');
select pg_temp.expect_fail($t$update public.vehicle_photos set description = 'Detalhe do risco' where category = 'frente'$t$, 'mecânico não altera foto de OS encerrada (descrição)');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_ok($t$insert into public.photo_categories (code, label, stage, required, sort_order) values ('chave_reserva','Chave reserva','checkin',false,12)$t$, 'master cria categoria');
select pg_temp.expect_ok($t$update public.photo_categories set required = true where code = 'interior'$t$, 'master torna foto obrigatória');
select pg_temp.expect_fail($t$update public.photo_categories set active = false where code = 'frente'$t$, 'obrigatória não pode ficar inativa');
select pg_temp.expect_ok($t$update public.photo_categories set required = false where code = 'interior'$t$, 'master desfaz');
select pg_temp.expect_fail($t$select public.purge_old_contact_requests()$t$, 'retenção não é chamável pelo app');
reset role;
select pg_temp.check($t$select public.purge_old_contact_requests() >= 0$t$, 'retenção executa (agendador)');

-- ---------- Critério 11: site público ----------
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.expect_ok($t$insert into public.contact_requests (name, phone, description, lgpd_consent) values ('Visitante','11988887777','Quero orçamento de freio',true)$t$, 'site público envia solicitação');
select pg_temp.expect_fail($t$insert into public.contact_requests (name, phone, lgpd_consent, status) values ('Visitante','11988887777',true,'respondido')$t$, 'site público forjando status');
select pg_temp.expect_fail($t$select * from public.contact_requests$t$, 'site público lendo solicitações');
select pg_temp.expect_fail($t$select * from public.customers$t$, 'site público lendo clientes');
select pg_temp.expect_fail($t$select * from public.vehicle_photos$t$, 'site público lendo fotos');
select pg_temp.check($t$select count(*) = 0 from storage.objects where bucket_id = 'vehicle-photos'$t$, 'site público não vê nenhuma foto no Storage');
select pg_temp.expect_fail($t$select public.is_master()$t$, 'site público chamando funções internas');
select pg_temp.expect_fail($t$select * from public.dashboard_summary()$t$, 'site público consultando o painel');
select pg_temp.expect_fail($t$select * from public.search_customers('a')$t$, 'site público buscando clientes');
select pg_temp.expect_ok($t$insert into public.contact_requests (name, phone, lgpd_consent) values ('Visitante','11988887777',true), ('Visitante','11988887777',true)$t$, 'mesmo telefone: 2ª e 3ª solicitações na hora');
select pg_temp.expect_fail($t$insert into public.contact_requests (name, phone, lgpd_consent) values ('Visitante','11988887777',true)$t$, '4ª solicitação do mesmo telefone em 1h (anti-spam)');
select pg_temp.expect_fail($t$select public.search_service_orders('', null)$t$, 'site público buscando OS');
reset role;

-- Usuário desativado perde acesso na hora
update public.profiles set active = false where login = 'mecanico1';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check($t$select count(*) = 0 from public.customers$t$, 'usuário desativado perde acesso imediatamente');
reset role;

do $$ begin raise notice '=== TODOS OS TESTES PASSARAM ==='; end $$;
rollback;
