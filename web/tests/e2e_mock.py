# Teste ponta a ponta (fase 2) com API Supabase SIMULADA.
import json, base64, time, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

def jwt(sub):
    h = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode().rstrip('=')
    p = base64.urlsafe_b64encode(json.dumps({"sub": sub, "exp": int(time.time())+3600, "role": "authenticated"}).encode()).decode().rstrip('=')
    return f"{h}.{p}.sig"

MASTER = "00000000-0000-0000-0000-00000000000a"
user = {"id": MASTER, "aud": "authenticated", "role": "authenticated", "email": "masteradm@usuarios.oficinamodelo.internal",
        "app_metadata": {}, "user_metadata": {}, "created_at": "2026-10-27T12:00:00Z"}
state = {"must_change": True, "calls": []}
profile = lambda: {"id": MASTER, "full_name": "André Felipe", "login": "MasterAdm", "role": "master", "active": True,
                   "must_change_password": state["must_change"], "can_checkout": True}
customers = [
  {"id": "c1", "full_name": "Marcos Oliveira", "phone": "(11) 90000-1200", "email": None, "cpf": None, "notes": "Prefere contato por WhatsApp.", "created_at": "2026-09-02T13:00:00Z"},
  {"id": "c2", "full_name": "Juliana Santos", "phone": "(11) 98811-3402", "email": "juliana@email.com", "cpf": None, "notes": None, "created_at": "2026-10-11T13:00:00Z"},
]
vehicles = [
  {"id": "v1", "plate": "FBR2C47", "plate_normalized": "FBR2C47", "brand": "Fiat", "model": "Argo Drive 1.0", "year_manufacture": 2021, "year_model": 2022,
   "color": "Prata", "vehicle_type": "carro", "customer_id": "c1", "notes": None, "created_at": "2026-09-02T13:00:00Z",
   "customers": {"id": "c1", "full_name": "Marcos Oliveira", "phone": "(11) 90000-1200"}},
  {"id": "v2", "plate": "EKT4512", "plate_normalized": "EKT4512", "brand": "Chevrolet", "model": "Onix LT", "year_manufacture": 2016, "year_model": 2016,
   "color": "Branco", "vehicle_type": "carro", "customer_id": "c1", "notes": None, "created_at": "2026-09-05T13:00:00Z",
   "customers": {"id": "c1", "full_name": "Marcos Oliveira", "phone": "(11) 90000-1200"}},
]
orders = [
  {"id": "o2", "number": "OS-2026-000014", "status": "em_execucao", "opened_at": "2026-10-26T12:10:00Z", "checkin_completed_at": "2026-10-26T12:30:00Z", "closed_at": None},
  {"id": "o1", "number": "OS-2026-000003", "status": "entregue", "opened_at": "2026-09-02T13:00:00Z", "checkin_completed_at": "2026-09-02T13:20:00Z", "closed_at": "2026-09-04T19:00:00Z"},
]
users = [
  {**profile(), "created_at": "2026-10-27T12:00:00Z", "last_access_at": "2026-10-27T14:55:00Z"},
  {"id": "u2", "full_name": "Rogério Lima", "login": "rogerio", "role": "mecanico", "active": True, "must_change_password": False, "can_checkout": True,
   "created_at": "2026-10-27T13:00:00Z", "last_access_at": "2026-10-27T14:20:00Z"},
  {"id": "u3", "full_name": "Thiago Mendes", "login": "thiago.m", "role": "mecanico", "active": True, "must_change_password": True, "can_checkout": False,
   "created_at": "2026-10-27T13:30:00Z", "last_access_at": None},
  {"id": "u4", "full_name": "Carlos Pereira", "login": "carlos", "role": "mecanico", "active": False, "must_change_password": False, "can_checkout": True,
   "created_at": "2026-10-01T13:30:00Z", "last_access_at": "2026-10-20T11:00:00Z"},
]

def respond(route, body, status=200):
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body),
                  headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"})

def handler(route):
    req = route.request
    u = urlparse(req.url); path = u.path; q = parse_qs(u.query)
    if req.method == "OPTIONS": return respond(route, {})
    state["calls"].append(f"{req.method} {path}")
    obj = "vnd.pgrst.object" in (req.headers.get("accept") or "")
    body = json.loads(req.post_data) if req.post_data else {}
    if path == "/auth/v1/token":
        if body.get("password") != "SenhaDemo#2026" and body.get("password") != "NovaSenha#2026":
            return respond(route, {"error": "invalid_grant", "error_description": "Invalid login credentials", "msg": "Invalid login credentials", "code": "invalid_credentials"}, 400)
        return respond(route, {"access_token": jwt(MASTER), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time())+3600, "refresh_token": "r", "user": user})
    if path == "/auth/v1/user": return respond(route, user)
    if path == "/auth/v1/logout": return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*"})
    if path == "/rest/v1/rpc/get_my_profile": return respond(route, [profile()])
    if path == "/rest/v1/rpc/register_session_event": return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*"})
    if path == "/functions/v1/change-password":
        state["must_change"] = False; return respond(route, {"ok": True})
    if path == "/rest/v1/rpc/dashboard_summary":
        return respond(route, [{"em_atendimento": 6, "aguardando_diagnostico": 2, "orcamentos_pendentes": 1, "orcamentos_aprovados": 2,
                                "em_execucao": 2, "prontos_retirada": 1, "concluidas": 37, "checkins_rascunho": 1}])
    if path == "/rest/v1/rpc/recent_activity":
        return respond(route, [
          {"created_at": "2026-10-27T14:40:00Z", "service_order_id": "o2", "os_number": "OS-2026-000014", "plate": "FBR2C47", "vehicle": "Fiat Argo Drive 1.0", "from_status": "aguardando_execucao", "to_status": "em_execucao", "actor_name": "Rogério Lima"},
          {"created_at": "2026-10-27T13:05:00Z", "service_order_id": "o9", "os_number": "OS-2026-000015", "plate": "GHT8A21", "vehicle": "Hyundai HB20", "from_status": None, "to_status": "aguardando_diagnostico", "actor_name": "Thiago Mendes"},
          {"created_at": "2026-10-27T11:50:00Z", "service_order_id": "o8", "os_number": "OS-2026-000011", "plate": "DQE1234", "vehicle": "VW Gol G6", "from_status": "aguardando_conferencia", "to_status": "pronto_retirada", "actor_name": "Rogério Lima"},
          {"created_at": "2026-10-26T17:30:00Z", "service_order_id": "o7", "os_number": "OS-2026-000009", "plate": "FKL3B90", "vehicle": "Renault Kwid", "from_status": "aguardando_orcamento", "to_status": "aguardando_aprovacao", "actor_name": "André Felipe"},
        ])
    if path == "/rest/v1/rpc/search_customers":
        qq = (body.get("p_query") or "").lower()
        rows = [{**c, "plates": [v["plate_normalized"] for v in vehicles if v["customer_id"] == c["id"]]} for c in customers]
        if qq: rows = [r for r in rows if qq in r["full_name"].lower() or any(qq.upper() in p for p in r["plates"])]
        return respond(route, rows)
    if path == "/rest/v1/rpc/staff_directory": return respond(route, [{"id": x["id"], "full_name": x["full_name"], "role": x["role"], "active": x["active"]} for x in users])
    if path == "/rest/v1/customers":
        if req.method == "POST":
            c = {**body, "id": "c3", "created_at": "2026-10-27T15:00:00Z"}; customers.append(c); return respond(route, {"id": "c3"} if obj else [{"id": "c3"}], 201)
        cid = (q.get("id") or [""])[0].replace("eq.", "")
        c = next((x for x in customers if x["id"] == cid), None)
        return respond(route, c if obj else [c])
    if path == "/rest/v1/vehicles":
        if "plate_normalized" in q:
            p = q["plate_normalized"][0].replace("eq.", "")
            hits = [{"id": v["id"]} for v in vehicles if v["plate_normalized"] == p]
            return respond(route, hits)
        if "customer_id" in q:
            cid = q["customer_id"][0].replace("eq.", ""); return respond(route, [v for v in vehicles if v["customer_id"] == cid])
        vid = (q.get("id") or [""])[0].replace("eq.", "")
        v = next((x for x in vehicles if x["id"] == vid), None)
        return respond(route, v if obj else [v])
    if path == "/rest/v1/service_orders":
        return respond(route, [{**o, "opened_by": None, "checkin_inspections": {"km_in": 45200, "entered_at": o["opened_at"], "customer_complaint": "Barulho ao frear", "visit_reason": None, "responsible_id": "u2"},
                                "checkouts": None, "diagnostics": [], "performed_services": [], "quotes": []} for o in orders])
    if path == "/rest/v1/vehicle_photos": return respond(route, [])
    if path == "/rest/v1/audit_logs":
        return respond(route, [
          {"id": 9, "actor_id": MASTER, "action": "usuario.criado", "entity": "profiles", "entity_id": "u3", "result": "sucesso", "details": {"login": "thiago.m", "role": "mecanico"}, "created_at": "2026-10-27T13:30:00Z"},
          {"id": 8, "actor_id": "u2", "action": "admin_users.create", "entity": "profiles", "entity_id": None, "result": "negado", "details": {"motivo": "não é MasterAdm ativo"}, "created_at": "2026-10-27T13:10:00Z"},
          {"id": 7, "actor_id": "u2", "action": "update", "entity": "service_orders", "entity_id": "o2", "result": "sucesso", "details": {"status": {"de": "aguardando_execucao", "para": "em_execucao"}}, "created_at": "2026-10-27T12:40:00Z"},
          {"id": 6, "actor_id": MASTER, "action": "login", "entity": "auth", "entity_id": None, "result": "sucesso", "details": {}, "created_at": "2026-10-27T12:01:00Z"},
        ])
    if path == "/functions/v1/admin-users":
        a = body.get("action")
        if a == "list": return respond(route, {"users": users})
        if a == "create": return respond(route, {"id": "u5"}, 201)
        return respond(route, {"ok": True})
    print("NÃO MOCKADO:", req.method, req.url)
    return respond(route, {"message": "not mocked"}, 404)

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for label, vp, mobile in [("desk", {"width": 1280, "height": 860}, False), ("mob", {"width": 390, "height": 844}, True)]:
        state["must_change"] = True
        ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1, service_workers="block")
        ctx.route("http://supa.test/**", handler)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        base = "http://localhost:4173"
        pg.goto(base + "/sistema"); pg.wait_for_url("**/login")
        pg.screenshot(path=f"shots/{label}-01-login.png")
        pg.fill("input[autocomplete=username]", "MasterAdm"); pg.fill("input[type=password]", "errada"); pg.click("button:has-text('Entrar')")
        pg.wait_for_selector(".form-error"); assert "incorretos" in pg.inner_text(".form-error")
        pg.fill("input[type=password]", "SenhaDemo#2026"); pg.click("button:has-text('Entrar')")
        pg.wait_for_url("**/trocar-senha"); pg.wait_for_selector("h1:has-text('Crie sua senha')")
        pw = pg.locator("input[type=password]")
        pw.nth(0).fill("SenhaDemo#2026"); pw.nth(1).fill("NovaSenha#2026"); pw.nth(2).fill("NovaSenha#20")
        pg.screenshot(path=f"shots/{label}-02-trocar.png", full_page=True)
        pw.nth(2).fill("NovaSenha#2026"); pg.click("button:has-text('Salvar nova senha')")
        pg.wait_for_url(re.compile(r".*/sistema$")); pg.wait_for_selector(".tile-value:has-text('6')"); pg.wait_for_selector(".feed-item")
        pg.screenshot(path=f"shots/{label}-03-painel.png", full_page=True)
        # placa inexistente -> fluxo de cadastro
        pg.fill("#plate-input", "abc1d23"); pg.click("button:has-text('Buscar')"); pg.wait_for_selector(".plate-notfound")
        pg.screenshot(path=f"shots/{label}-04-placa-nao-encontrada.png")
        pg.click("button:has-text('Cadastrar veículo com esta placa')"); pg.wait_for_selector(".notice")
        pg.wait_for_selector(".list-row")
        pg.screenshot(path=f"shots/{label}-05-clientes.png", full_page=True)
        pg.click(".list-row >> nth=0"); pg.wait_for_selector("h1:has-text('Novo veículo')")
        assert pg.input_value(".input-plate") == "ABC1D23"
        pg.screenshot(path=f"shots/{label}-06-novo-veiculo.png", full_page=True)
        # placa existente
        pg.goto(base + "/sistema"); pg.fill("#plate-input", "FBR2C47"); pg.click("button:has-text('Buscar')")
        pg.wait_for_url("**/veiculos/v1"); pg.wait_for_selector(".history-card:has-text('OS-2026-000014')")
        pg.screenshot(path=f"shots/{label}-07-veiculo.png", full_page=True)
        pg.goto(base + "/sistema/clientes/c1"); pg.wait_for_selector("h1:has-text('Marcos')")
        pg.screenshot(path=f"shots/{label}-08-cliente.png", full_page=True)
        pg.goto(base + "/sistema/clientes/novo"); pg.wait_for_selector("h1:has-text('Novo cliente')")
        pg.click("button:has-text('Cadastrar cliente')"); pg.wait_for_selector(".field-error")
        pg.screenshot(path=f"shots/{label}-09-cliente-validacao.png", full_page=True)
        pg.goto(base + "/sistema/usuarios"); pg.wait_for_selector("td:has-text('rogerio')")
        pg.click("button:has-text('Novo usuário')"); pg.fill("form.panel input >> nth=0", "Paulo Souza"); pg.fill("form.panel input >> nth=1", "paulo")
        pg.screenshot(path=f"shots/{label}-10-usuarios.png", full_page=True)
        pg.click("button:has-text('Criar usuário')"); pg.wait_for_selector(".notice-key")
        pg.locator("button:has-text('Desativar') >> nth=0").click(); pg.wait_for_selector("dialog[open]")
        pg.screenshot(path=f"shots/{label}-11-confirmar.png")
        pg.click("dialog button:has-text('Voltar')")
        pg.goto(base + "/sistema/auditoria"); pg.wait_for_selector(".audit-row"); pg.click(".audit-head >> nth=0")
        pg.screenshot(path=f"shots/{label}-12-auditoria.png", full_page=True)
        ctx.close()
    b.close()
print("ERROS DE PÁGINA:", errors or "nenhum")
print("FLUXO OK")
