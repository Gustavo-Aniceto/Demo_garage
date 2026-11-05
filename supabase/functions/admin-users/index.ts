// =====================================================================
// Gestão de Usuários — EXCLUSIVA do MasterAdm.
// Toda ação valida no servidor: JWT válido + perfil master ativo + senha já trocada.
// Ações: list | create | update | set_active | reset_password | revoke_sessions
// =====================================================================
import { adminClient, audit, corsHeaders, getCaller, json, LOGIN_RE, loginToEmail, passwordProblems } from "../_shared/common.ts";

const BAN_FOREVER = "876000h"; // ~100 anos

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Método não permitido." });

  const admin = adminClient();
  const caller = await getCaller(req);
  if (!caller) return json(req, 401, { error: "Sessão inválida. Entre novamente." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, 400, { error: "Requisição inválida." }); }
  const action = String(body.action ?? "");

  const { data: me } = await admin.from("profiles")
    .select("id, role, active, must_change_password").eq("id", caller.id).maybeSingle();

  if (!me || me.role !== "master" || !me.active || me.must_change_password) {
    await audit(admin, { actor_id: caller.id, action: `admin_users.${action}`, entity: "profiles",
                         result: "negado", details: { motivo: "não é MasterAdm ativo" } });
    return json(req, 403, { error: "Acesso restrito ao MasterAdm." });
  }

  const target = async (id: unknown) => {
    if (typeof id !== "string") return null;
    const { data } = await admin.from("profiles").select("id, role, login, active").eq("id", id).maybeSingle();
    return data;
  };
  const deny = async (msg: string, entity_id?: string) => {
    await audit(admin, { actor_id: me.id, action: `admin_users.${action}`, entity: "profiles",
                         entity_id, result: "negado", details: { motivo: msg } });
    return json(req, 403, { error: msg });
  };
  const revoke = async (userId: string) => {
    const { error } = await admin.rpc("admin_revoke_sessions", { p_user: userId });
    if (error) throw error;
  };

  try {
    switch (action) {
      case "list": {
        const { data, error } = await admin.from("profiles")
          .select("id, full_name, login, role, active, must_change_password, can_checkout, created_at, last_access_at")
          .order("created_at");
        if (error) throw error;
        return json(req, 200, { users: data });
      }

      case "create": {
        const full_name = String(body.full_name ?? "").trim();
        const login = String(body.login ?? "").trim();
        const role = body.role ?? "mecanico";
        if (full_name.length < 3) return json(req, 400, { error: "Informe o nome completo." });
        if (!LOGIN_RE.test(login)) return json(req, 400, { error: "Login: 3 a 40 caracteres (letras, números, . _ -)." });
        if (role !== "mecanico") return deny("Só existe um MasterAdm; novos usuários são criados como mecânico.");
        const pwErr = passwordProblems(body.temp_password);
        if (pwErr) return json(req, 400, { error: pwErr });

        const { data: dup } = await admin.from("profiles").select("id").ilike("login", login.replace(/[\\%_]/g, "\\$&")).maybeSingle();
        if (dup) return json(req, 409, { error: "Este login já está em uso." });

        const { data: created, error: authErr } = await admin.auth.admin.createUser({
          email: loginToEmail(login),
          password: body.temp_password as string,
          email_confirm: true,
          app_metadata: { app_role: role },
          user_metadata: { full_name, login },
        });
        if (authErr || !created.user) return json(req, 409, { error: "Não foi possível criar a conta (login já existe?)." });

        const { error: profErr } = await admin.from("profiles").insert({
          id: created.user.id, full_name, login, role,
          active: body.active !== false, must_change_password: true,
          can_checkout: body.can_checkout !== false, created_by: me.id,
        });
        if (profErr) {
          await admin.auth.admin.deleteUser(created.user.id); // desfaz para não deixar conta órfã
          throw profErr;
        }
        if (body.active === false) await admin.auth.admin.updateUserById(created.user.id, { ban_duration: BAN_FOREVER });

        await audit(admin, { actor_id: me.id, action: "usuario.criado", entity: "profiles",
                             entity_id: created.user.id, details: { login, role } });
        return json(req, 201, { id: created.user.id });
      }

      case "update": {
        const t = await target(body.user_id);
        if (!t) return json(req, 404, { error: "Usuário não encontrado." });
        if (t.role === "master") return deny("Os dados do MasterAdm não podem ser alterados por aqui.", t.id);
        if (body.role !== undefined && body.role !== "mecanico") return deny("Não é permitido promover usuários a MasterAdm.", t.id);
        const patch: Record<string, unknown> = {};
        if (body.full_name !== undefined) {
          const n = String(body.full_name).trim();
          if (n.length < 3) return json(req, 400, { error: "Nome inválido." });
          patch.full_name = n;
        }
        if (body.can_checkout !== undefined) patch.can_checkout = Boolean(body.can_checkout);
        if (!Object.keys(patch).length) return json(req, 400, { error: "Nada para alterar." });
        const { error } = await admin.from("profiles").update(patch).eq("id", t.id);
        if (error) throw error;
        await audit(admin, { actor_id: me.id, action: "usuario.editado", entity: "profiles", entity_id: t.id, details: patch });
        return json(req, 200, { ok: true });
      }

      case "set_active": {
        const t = await target(body.user_id);
        if (!t) return json(req, 404, { error: "Usuário não encontrado." });
        if (t.role === "master" || t.id === me.id) return deny("O MasterAdm não pode ser desativado.", t.id);
        const active = Boolean(body.active);
        const { error } = await admin.from("profiles").update({ active }).eq("id", t.id);
        if (error) throw error;
        await admin.auth.admin.updateUserById(t.id, { ban_duration: active ? "none" : BAN_FOREVER });
        if (!active) await revoke(t.id);
        await audit(admin, { actor_id: me.id, action: active ? "usuario.ativado" : "usuario.desativado",
                             entity: "profiles", entity_id: t.id });
        return json(req, 200, { ok: true });
      }

      case "reset_password": {
        const t = await target(body.user_id);
        if (!t) return json(req, 404, { error: "Usuário não encontrado." });
        if (t.role === "master") return deny("A senha do MasterAdm só é recuperada pelo procedimento de provisionamento.", t.id);
        const pwErr = passwordProblems(body.temp_password);
        if (pwErr) return json(req, 400, { error: pwErr });
        const { error: e1 } = await admin.auth.admin.updateUserById(t.id, { password: body.temp_password as string });
        if (e1) throw e1;
        const { error: e2 } = await admin.from("profiles").update({ must_change_password: true }).eq("id", t.id);
        if (e2) throw e2;
        await revoke(t.id);
        await audit(admin, { actor_id: me.id, action: "usuario.senha_redefinida", entity: "profiles", entity_id: t.id });
        return json(req, 200, { ok: true });
      }

      case "revoke_sessions": {
        const t = await target(body.user_id);
        if (!t) return json(req, 404, { error: "Usuário não encontrado." });
        await revoke(t.id);
        await audit(admin, { actor_id: me.id, action: "usuario.sessoes_revogadas", entity: "profiles", entity_id: t.id });
        return json(req, 200, { ok: true });
      }

      default:
        return json(req, 400, { error: "Ação desconhecida." });
    }
  } catch (err) {
    console.error("admin-users", action, err);
    await audit(admin, { actor_id: me.id, action: `admin_users.${action}`, entity: "profiles", result: "erro" });
    return json(req, 500, { error: "Erro interno. A operação não foi concluída." });
  }
});
