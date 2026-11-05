# Teste ponta a ponta (fases 3 e 4 + fotos exigidas/descrição) com API Supabase SIMULADA.
import json, base64, time, re, copy
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

def jwt(sub):
    h = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode().rstrip('=')
    p = base64.urlsafe_b64encode(json.dumps({"sub": sub, "exp": int(time.time())+3600, "role": "authenticated"}).encode()).decode().rstrip('=')
    return f"{h}.{p}.sig"
M = "00000000-0000-0000-0000-00000000000a"
NOW = "2026-10-27T15:00:00Z"
JPEG = open('tests/car.jpg','rb').read()
user = {"id": M, "aud": "authenticated", "role": "authenticated", "email": "masteradm@usuarios.oficinamodelo.internal", "app_metadata": {}, "user_metadata": {}, "created_at": NOW}
profile = {"id": M, "full_name": "André Felipe", "login": "MasterAdm", "role": "master", "active": True, "must_change_password": False, "can_checkout": True}
customer = {"id": "c1", "full_name": "Marcos Oliveira", "phone": "(11) 90000-1200", "email": None, "cpf": None, "notes": None, "created_at": NOW}
vehicle = {"id": "v1", "plate": "FBR2C47", "plate_normalized": "FBR2C47", "brand": "Fiat", "model": "Argo Drive 1.0", "year_manufacture": 2021, "year_model": 2022, "color": "Prata", "vehicle_type": "carro", "customer_id": "c1", "notes": None, "created_at": NOW}
CATS = [("frente","Frente do veículo","checkin",True,1),("traseira","Traseira","checkin",True,2),("lateral_esquerda","Lateral esquerda","checkin",True,3),("lateral_direita","Lateral direita","checkin",True,4),("painel_km","Painel e quilometragem","checkin",True,5),("avaria","Riscos / amassados / batidas","checkin",False,8),("detalhe_tecnico","Detalhe técnico","checkup",False,20),("frente_saida","Frente (saída)","checkout",False,30),("servico_executado","Serviço executado","checkout",False,32)]
cats = [{"code":c,"label":l,"stage":s,"required":r,"sort_order":o,"active":True} for c,l,s,r,o in CATS]
S = {"os": None, "ins": None, "items": [], "photos": [], "diag": [], "defects": [], "quotes": [], "qitems": [], "services": [], "checkout": None, "events": [], "contacts": [], "n": 0}
def nid(p): S["n"] += 1; return f"{p}{S['n']}"
def ev(frm, to): S["events"].append({"id": len(S["events"])+1, "service_order_id": "o1", "from_status": frm, "to_status": to, "actor_id": M, "created_at": NOW})

def respond(route, body, status=200):
    accept = route.request.headers.get("accept") or ""
    if "vnd.pgrst.object" in accept and isinstance(body, list):
        if not body: return route.fulfill(status=406, content_type="application/json", body=json.dumps({"code":"PGRST116","message":"0 rows"}), headers=H)
        body = body[0]
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body), headers=H)
H = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}
def empty(route, status=201): route.fulfill(status=status, headers=H)
def eqv(q, k): return (q.get(k) or [""])[0].split(".", 1)[-1]

def os_full():
    return {**S["os"], "vehicles": vehicle, "customers": customer}
def ins_full():
    return {**S["ins"], "checkin_inspection_items": S["items"]} if S["ins"] else None

def handler(route):
    req = route.request; u = urlparse(req.url); path = u.path; q = parse_qs(u.query); m = req.method
    if m == "OPTIONS": return respond(route, {})
    body = None
    if req.post_data_buffer is not None and "storage/v1/object/vehicle-photos" not in path:
        try: body = json.loads(req.post_data)
        except Exception: body = None
    sel = (q.get("select") or [""])[0]
    if path == "/auth/v1/token": return respond(route, {"access_token": jwt(M), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time())+3600, "refresh_token": "r", "user": user})
    if path == "/auth/v1/user": return respond(route, user)
    if path == "/auth/v1/logout": return empty(route, 204)
    if path.startswith("/rest/v1/rpc/"):
        fn = path.rsplit("/",1)[-1]
        if fn == "get_my_profile": return respond(route, [profile])
        if fn == "register_session_event": return empty(route, 204)
        if fn == "staff_directory": return respond(route, [{"id": M, "full_name": "André Felipe", "role": "master", "active": True}, {"id": "u2", "full_name": "Rogério Lima", "role": "mecanico", "active": True}])
        if fn == "dashboard_summary": return respond(route, [{"em_atendimento": 1, "aguardando_diagnostico": 0, "orcamentos_pendentes": 0, "orcamentos_aprovados": 0, "em_execucao": 0, "prontos_retirada": 0, "concluidas": 0, "checkins_rascunho": 0}])
        if fn == "recent_activity": return respond(route, [])
        if fn == "search_service_orders":
            o = S["os"] or {"id":"o1","number":"OS-2026-000001","status":"em_execucao","opened_at":NOW,"closed_at":None,"checkin_completed_at":NOW}
            rows = [{"id": o["id"], "number": o["number"], "status": o["status"], "opened_at": NOW, "closed_at": o.get("closed_at"), "checkin_completed_at": o.get("checkin_completed_at"), "vehicle_id": "v1", "plate": "FBR2C47", "vehicle": "Fiat Argo Drive 1.0", "customer_name": "Marcos Oliveira"},
                    {"id": "o0", "number": "OS-2026-000000", "status": "entregue", "opened_at": "2026-09-01T12:00:00Z", "closed_at": "2026-09-03T12:00:00Z", "checkin_completed_at": "2026-09-01T12:00:00Z", "vehicle_id": "v2", "plate": "EKT4512", "vehicle": "Chevrolet Onix", "customer_name": "Juliana Santos"}]
            return respond(route, rows)
        return respond(route, [])
    t = path.replace("/rest/v1/", "")
    if t == "vehicles":
        if "plate_normalized" in q: return respond(route, [{"id": "v1"}] if eqv(q,"plate_normalized") == "FBR2C47" else [])
        return respond(route, [{**vehicle, "customers": customer}])
    if t == "customers": return respond(route, [customer])
    if t == "photo_categories":
        if m == "PATCH":
            c = next(x for x in cats if x["code"] == eqv(q, "code"))
            if body.get("active") is False and c["required"]: return respond(route, {"code": "23514", "message": "new row violates check constraint photo_categories_required_active"}, 400)
            c.update(body); return empty(route, 204)
        if m == "POST": cats.append({**body, "active": True}); return empty(route)
        return respond(route, sorted(cats, key=lambda c: c["sort_order"]))
    if t == "service_orders":
        if m == "POST":
            if not S["os"]:
                S["os"] = {"id": "o1", "number": "OS-2026-000001", "client_request_id": body.get("client_request_id"), "customer_id": "c1", "vehicle_id": "v1", "status": "aguardando_diagnostico", "opened_at": NOW, "opened_by": M, "checkin_completed_at": None, "closed_at": None, "closed_by": None}
                ev(None, "aguardando_diagnostico")
            return respond(route, [{"id": "o1", "number": "OS-2026-000001"}], 201)
        if m == "PATCH":
            o = S["os"]
            if "checkin_completed_at" in body:
                req_missing = [c["label"] for c in cats if c["required"] and not any(p["category"] == c["code"] for p in S["photos"])]
                if req_missing: return respond(route, {"code": "23514", "message": "Fotos obrigatórias pendentes: " + ", ".join(req_missing)}, 400)
                o["checkin_completed_at"] = NOW
            if "status" in body:
                if body["status"] in ("aguardando_execucao","em_execucao") and not any(x["status"] == "aprovado" for x in S["quotes"]):
                    return respond(route, {"code": "23514", "message": "Execução exige um orçamento aprovado e registrado"}, 400)
                if body["status"] == "entregue" and not (S["checkout"] and S["checkout"]["delivery_confirmed"]):
                    return respond(route, {"code": "23514", "message": "Registre o check-out"}, 400)
                ev(o["status"], body["status"]); o["status"] = body["status"]
                if body["status"] == "entregue": o["closed_at"] = NOW
            return empty(route, 204)
        if "checkin_completed_at" in q:  # rascunho aberto do veículo
            return respond(route, [{"id": "o1"}] if S["os"] and not S["os"]["checkin_completed_at"] else [])
        if "checkin_inspections(km_in" in sel:  # histórico
            if not S["os"]: return respond(route, [])
            return respond(route, [{**S["os"], "checkin_inspections": S["ins"], "checkouts": S["checkout"], "diagnostics": [{"technical_diagnosis": d["technical_diagnosis"], "mechanic_id": M, "diagnostic_defects": [x for x in S["defects"] if x["diagnostic_id"] == d["id"]]} for d in S["diag"]], "performed_services": S["services"], "quotes": [{**x, "quote_items": [i for i in S["qitems"] if i["quote_id"] == x["id"]]} for x in S["quotes"]]}])
        if "checkin_inspections(*" in sel:
            return respond(route, [{**S["os"], "vehicles": {**vehicle, "customers": customer}, "checkin_inspections": ins_full()}])
        return respond(route, [os_full()])
    if t == "checkin_inspections":
        if m == "POST":
            S["ins"] = {**(S["ins"] or {"id": "i1", "entered_at": NOW, "dashboard_lights": [], "customer_ack": False, "customer_ack_name": None, "customer_ack_method": None, "customer_reported_alerts": None, "starting_difficulty": None, "noises_reported": None, "vibrations_reported": None, "leaks_observed": None, "staff_observations": None, "accessories_received": None}), **body}
            return respond(route, [{"id": "i1"}], 201)
        return respond(route, [ins_full()] if S["ins"] else [])
    if t == "checkin_inspection_items":
        S["items"] = [{**r, "id": f"it{k}"} for k, r in enumerate(body)]; return empty(route)
    if t == "vehicle_photos":
        if m == "POST":
            S["photos"].append({**body, "id": nid("p"), "created_by": M, "include_in_report": True}); return empty(route)
        if m == "PATCH":
            ph = next(x for x in S["photos"] if x["id"] == eqv(q, "id")); ph.update(body); S.setdefault("desc_saved", []).append(body); return empty(route, 204)
        if "vehicle_id" in q: return respond(route, [{**p, "service_orders": {"number": "OS-2026-000001"}} for p in S["photos"]])
        return respond(route, S["photos"])
    if t == "diagnostics":
        if m == "POST":
            d = {**body, "id": nid("d"), "performed_at": NOW}; S["diag"].append(d); return respond(route, [{"id": d["id"]}], 201)
        return respond(route, [{**d, "diagnostic_defects": [x for x in S["defects"] if x["diagnostic_id"] == d["id"]]} for d in S["diag"]])
    if t == "diagnostic_defects":
        for r in body: S["defects"].append({**r, "id": nid("df")})
        return empty(route)
    if t == "quotes":
        if m == "POST":
            S["quotes"].append({"id": nid("q"), "service_order_id": "o1", "version": body.get("version", 1), "status": "em_elaboracao", "prepared_by": M, "prepared_at": NOW, "discount_amount": 0, "discount_authorized_by": None, "approved_at": None, "approved_registered_by": None, "approved_by_name": None, "approval_method": None, "approval_notes": None, "refused_at": None, "notes": None}); return empty(route)
        if m == "PATCH":
            qid = eqv(q, "id"); x = next(z for z in S["quotes"] if z["id"] == qid)
            if body.get("status") == "aprovado" and not (body.get("approved_by_name") and body.get("approval_method")):
                return respond(route, {"code": "23514", "message": "new row violates check constraint quotes_approval_registered"}, 400)
            x.update(body)
            if body.get("status") == "aprovado": x.update({"approved_at": NOW, "approved_registered_by": M})
            return empty(route, 204)
        return respond(route, [{**x, "quote_items": [i for i in S["qitems"] if i["quote_id"] == x["id"]]} for x in S["quotes"]])
    if t == "quote_items":
        if m == "POST":
            S["qitems"].append({**body, "id": nid("qi"), "total": round(body["quantity"] * body["unit_price"], 2), "approved": True}); return empty(route)
        if m == "DELETE": S["qitems"] = [i for i in S["qitems"] if i["id"] != eqv(q, "id")]; return empty(route, 204)
        if m == "PATCH": next(i for i in S["qitems"] if i["id"] == eqv(q, "id")).update(body); return empty(route, 204)
    if t == "performed_services":
        if m == "POST":
            for r in body: S["services"].append({**r, "id": nid("s"), "performed_at": NOW, "quote_item_id": r.get("quote_item_id"), "notes": r.get("notes")})
            return empty(route)
        if m == "PATCH": next(i for i in S["services"] if i["id"] == eqv(q, "id")).update(body); return empty(route, 204)
        return respond(route, S["services"])
    if t == "checkouts":
        if m == "POST": S["checkout"] = {**body, "id": "ck1"}; return empty(route)
        return respond(route, [S["checkout"]] if S["checkout"] else [])
    if t == "service_order_events": return respond(route, S["events"])
    if t == "contact_requests":
        if m == "POST":
            if sum(1 for c in S["contacts"] if c["phone"] == body["phone"]) >= 1:
                return respond(route, {"code": "54000", "message": "Você já enviou solicitações há pouco. Aguarde nosso contato ou chame no WhatsApp."}, 400)
            S["contacts"].append({**body, "id": nid("cr"), "status": "novo", "handled_by": None, "internal_notes": None, "created_at": NOW}); return empty(route)
        if m == "PATCH": next(c for c in S["contacts"] if c["id"] == eqv(q, "id")).update(body); return empty(route, 204)
        return respond(route, [c for c in S["contacts"] if not q.get("status") or c["status"] == eqv(q, "status")])
    if path.startswith("/storage/v1/object/vehicle-photos/"): return respond(route, {"Key": path})
    if path == "/storage/v1/object/sign/vehicle-photos":
        return respond(route, [{"path": p, "signedURL": f"/object/sign/vehicle-photos/{p}?token=t", "error": None} for p in body["paths"]])
    if path.startswith("/storage/v1/object/sign/"): return route.fulfill(status=200, content_type="image/jpeg", body=JPEG, headers=H)
    print("NÃO MOCKADO:", m, req.url); return respond(route, {"message": "nm"}, 404)

errors = []
def shot(pg, name, full=True): pg.screenshot(path=f"shots/{name}.png", full_page=full)
with sync_playwright() as p:
    b = p.chromium.launch()
    base = "http://localhost:4173"
    # ---------- site público ----------
    for label, vp, mob in [("desk", {"width": 1280, "height": 860}, False), ("mob", {"width": 390, "height": 844}, True)]:
        S["contacts"] = []
        ctx = b.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=2 if mob else 1, service_workers="block")
        ctx.route("http://supa.test/**", handler); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(base + "/"); pg.wait_for_selector(".hero h1"); shot(pg, f"{label}-site-home")
        pg.goto(base + "/servicos"); pg.wait_for_selector(".svc-list"); shot(pg, f"{label}-site-servicos", False)
        pg.goto(base + "/contato"); pg.wait_for_selector("form")
        pg.click("button:has-text('Enviar pedido')"); pg.wait_for_selector(".field-error")
        pg.get_by_label("Nome").fill("Paula Ribeiro"); pg.get_by_label("Telefone / WhatsApp").fill("11988887777")
        pg.get_by_label("O que está acontecendo?").fill("Barulho na suspensão dianteira.")
        pg.check("text=Autorizo a Oficina Modelo")
        shot(pg, f"{label}-site-contato")
        pg.click("button:has-text('Enviar pedido')"); pg.wait_for_selector(".sent"); shot(pg, f"{label}-site-enviado", False)
        if label == "desk":
            pg.goto(base + "/contato"); pg.get_by_label("Nome").fill("Paula Ribeiro"); pg.get_by_label("Telefone / WhatsApp").fill("11988887777"); pg.check("text=Autorizo a Oficina Modelo")
            pg.click("button:has-text('Enviar pedido')"); pg.wait_for_selector(".form-error"); assert "já enviou" in pg.inner_text(".form-error")
        ctx.close()
    S["contacts"] = S["contacts"][:1]

    # ---------- fluxo interno ----------
    for label, vp, mob in [("desk", {"width": 1280, "height": 860}, False), ("mob", {"width": 390, "height": 844}, True)]:
        if label == "mob":  # recomeça a OS do zero para o celular
            for k in ["os","ins","checkout"]: S[k] = None
            for k in ["items","photos","diag","defects","quotes","qitems","services","events"]: S[k] = []
        ctx = b.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=2 if mob else 1, service_workers="block")
        ctx.route("http://supa.test/**", handler); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        pg.goto(base + "/sistema/login"); pg.fill("input[autocomplete=username]", "MasterAdm"); pg.fill("input[type=password]", "x"); pg.click("button:has-text('Entrar')")
        pg.wait_for_url(re.compile(r".*/sistema$"))
        pg.fill("#plate-input", "FBR2C47"); pg.click("button:has-text('Buscar')"); pg.wait_for_url("**/veiculos/v1")
        pg.click("a:has-text('Iniciar check-in')"); pg.wait_for_selector("text=Quilometragem atual")
        pg.get_by_label("Quilometragem atual").fill("45200"); pg.get_by_label("Motivo da visita").fill("Barulho ao frear")
        pg.get_by_label("Reclamação relatada pelo cliente").fill("Chiado forte quando freia em baixa velocidade.")
        shot(pg, f"{label}-ck1")
        pg.click("button:has-text('Continuar')"); pg.wait_for_selector("legend:has-text('Riscos na pintura')")
        pg.locator("fieldset.insp-item").first.locator("label:has-text('Com avaria')").click()
        assert pg.locator("button:has-text('Continuar')").is_disabled()
        pg.fill("input[aria-label='Observação: Riscos na pintura']", "Risco na porta traseira esquerda, 15 cm")
        for i in range(1, 4): pg.locator("fieldset.insp-item").nth(i).locator("label:has-text('Sem avaria')").click()
        shot(pg, f"{label}-ck2")
        pg.click("button:has-text('Continuar')"); pg.wait_for_selector("text=Luzes acesas no painel")
        pg.click("label:has-text('Freio / ABS')"); pg.get_by_label("Ruídos relatados").fill("Chiado ao frear")
        pg.get_by_label("Vazamentos aparentes").fill("Nenhum"); shot(pg, f"{label}-ck3")
        pg.click("button:has-text('Continuar')"); pg.wait_for_selector(".photo-cat")
        for k in range(5):
            pg.locator(".photo-cat").nth(k).locator("input[type=file][multiple]").set_input_files("tests/car.jpg")
        try:
            pg.wait_for_function("document.querySelectorAll('.thumb-ok').length >= 5", timeout=15000)
        except Exception:
            shot(pg, "DEBUG-fotos"); print("DEBUG:", pg.inner_text(".photo-cats")[:1500]); print("FOTOS:", len(S["photos"])); raise
        shot(pg, f"{label}-ck4")
        d = pg.locator(".photo-cat").nth(0).locator(".thumb-desc").first
        d.fill("Para-choque com risco leve"); d.press("Tab"); pg.wait_for_selector("text=Descrição salva.")
        assert any(x.get("description") == "Para-choque com risco leve" for x in S.get("desc_saved", []))
        pg.click("button:has-text('Continuar')"); pg.wait_for_selector("text=Resumo")
        pg.check("text=O cliente está ciente"); pg.get_by_label("Nome de quem confirmou").fill("Marcos Oliveira"); pg.get_by_label("Forma de confirmação").select_option("presencial")
        shot(pg, f"{label}-ck5")
        pg.click("button:has-text('Concluir check-in')"); pg.wait_for_selector("text=Check-in concluído"); shot(pg, f"{label}-ck-ok", False)
        pg.click("a:has-text('Abrir ordem de serviço')"); pg.wait_for_selector(".os-head h1")
        shot(pg, f"{label}-os-resumo")
        # diagnóstico
        pg.click(".tabs button:has-text('Diagnóstico')"); pg.wait_for_selector("text=Novo diagnóstico")
        pg.get_by_label("Diagnóstico técnico").fill("Pastilhas dianteiras no limite, disco com sulco leve.")
        pg.locator(".defect-row select").first.select_option("freios"); pg.fill(".defect-desc input", "Pastilha dianteira gasta")
        pg.click("button:has-text('Salvar diagnóstico')"); pg.wait_for_selector("text=Diagnóstico de")
        # orçamento
        pg.click(".tabs button:has-text('Orçamento')"); pg.click("button:has-text('Criar orçamento')"); pg.wait_for_selector("text=Adicionar item")
        for desc, kind, price in [("Jogo de pastilhas dianteiras", "peca", "180"), ("Troca de pastilhas", "mao_de_obra", "120")]:
            pg.locator(".quote-add-row select").select_option(kind); pg.locator(".quote-add-row input").nth(0).fill(desc); pg.locator(".quote-add-row input").nth(2).fill(price)
            pg.click("button:has-text('Adicionar item')"); pg.wait_for_selector(f"td:has-text('{desc}')")
        assert "R$ 300,00" in pg.inner_text(".totals-final").replace("\xa0", " "), pg.inner_text(".totals-final")
        pg.click("button:has-text('Enviar para aprovação')"); pg.wait_for_selector("button:has-text('Registrar aprovação')")
        pg.click("button:has-text('Registrar aprovação')"); pg.wait_for_selector("dialog[open]")
        pg.locator("dialog[open] select").select_option("whatsapp"); shot(pg, f"{label}-os-aprovacao", False)
        pg.click("dialog[open] button:has-text('Registrar aprovação')"); pg.wait_for_selector(".badge:has-text('Aprovado')")
        shot(pg, f"{label}-os-orcamento")
        # execução
        pg.click(".tabs button:has-text('Execução')"); pg.click("button:has-text('Importar do orçamento')"); pg.wait_for_selector(".inline-select")
        for k in range(pg.locator(".inline-select").count()): pg.locator(".inline-select").nth(k).select_option("executado"); pg.wait_for_timeout(150)
        # saída
        pg.click(".tabs button:has-text('Saída')"); pg.wait_for_selector("text=Antes de liberar")
        pg.get_by_label("Quilometragem final").fill("45210"); pg.get_by_label("Recomendações futuras").fill("Trocar discos na próxima revisão.")
        pg.check("text=Confirmo a entrega do veículo"); shot(pg, f"{label}-os-saida")
        pg.click("button:has-text('Registrar saída e entregar')"); pg.wait_for_selector("text=Saída registrada")
        pg.click(".tabs button:has-text('Fotos')"); pg.wait_for_selector(".gallery img")
        pg.locator(".gallery .check-sm input").nth(0).check(); pg.locator(".gallery .check-sm input").nth(1).check(); pg.wait_for_selector("dialog[open] .photo-compare")
        shot(pg, f"{label}-os-comparar", False); pg.click("dialog[open] button:has-text('Fechar')")
        pg.click(".tabs button:has-text('Histórico')"); pg.wait_for_selector(".timeline li"); shot(pg, f"{label}-os-historico", False)
        pg.goto(base + "/sistema/os/o1/documento/os"); pg.wait_for_selector(".doc-photos img"); pg.wait_for_timeout(400); shot(pg, f"{label}-doc-os")
        pg.emulate_media(media="print"); shot(pg, f"{label}-doc-os-print"); pg.emulate_media(media="screen")
        pg.goto(base + "/sistema/veiculos/v1"); pg.wait_for_selector(".history-card"); shot(pg, f"{label}-veiculo-historico")
        pg.goto(base + "/sistema/ordens"); pg.wait_for_selector(".list-row"); shot(pg, f"{label}-ordens", False)
        pg.goto(base + "/sistema/solicitacoes"); pg.wait_for_selector(".req-list .panel"); shot(pg, f"{label}-solicitacoes", False)
        if label == "desk":
            pg.goto(base + "/sistema/fotos"); pg.wait_for_selector(".cat-list li")
            row = pg.locator(".cat-list li", has=pg.locator("input[value='Riscos / amassados / batidas']"))
            row.locator("label:has-text('Obrigatória') input").check(); pg.wait_for_selector("text=agora é obrigatória")
            assert next(c for c in cats if c["code"] == "avaria")["required"] is True
            pg.get_by_placeholder("Ex.: Estepe").fill("Estepe"); pg.click("button:has-text('Criar categoria')"); pg.wait_for_selector("input[value='Estepe']")
            assert any(c["code"] == "estepe" for c in cats)
            shot(pg, f"{label}-fotos-config")
            next(c for c in cats if c["code"] == "avaria")["required"] = False
        ctx.close()
    b.close()
print("ERROS:", errors or "nenhum"); print("FLUXO OK")
