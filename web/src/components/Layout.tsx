import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useOnline } from "../lib/hooks";
import { OFICINA } from "../lib/oficina";

const Icon = {
  painel: <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />,
  fotos: <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  ordens: <path d="M19 3h-4.2A3 3 0 0 0 12 1a3 3 0 0 0-2.8 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-2 14-4-4 1.4-1.4L10 14.2l6.6-6.6L18 9l-8 8Z" />,
  pedidos: <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-2 12H6v-2h12v2Zm0-3H6V9h12v2Zm0-3H6V6h12v2Z" />,
  clientes: <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-8 1.3-8 4v3h8v-3c0-1.1.4-2.1 1.2-3A11 11 0 0 0 8 13Zm8 0c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4Z" />,
  usuarios: <path d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4Zm0 6a3 3 0 1 1-3 3 3 3 0 0 1 3-3Zm0 13.2a8.9 8.9 0 0 1-6-4.1c0-2 4-3.1 6-3.1s6 1.1 6 3.1a8.9 8.9 0 0 1-6 4.1Z" />,
  auditoria: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z" />,
};
const Svg = ({ d }: { d: JSX.Element }) => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">{d}</svg>;

export function Layout() {
  const { profile, signOut } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const isMaster = profile?.role === "master";
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  const links = [
    { to: "/sistema", label: "Painel", icon: Icon.painel, end: true },
    { to: "/sistema/ordens", label: "Ordens", icon: Icon.ordens },
    { to: "/sistema/clientes", label: "Clientes", icon: Icon.clientes },
    { to: "/sistema/solicitacoes", label: "Pedidos", icon: Icon.pedidos },
    ...(isMaster
      ? [
          { to: "/sistema/usuarios", label: "Usuários", icon: Icon.usuarios },
          { to: "/sistema/auditoria", label: "Auditoria", icon: Icon.auditoria },
        ]
      : []),
  ];

  async function handleSignOut() {
    await signOut();
    navigate("/sistema/login", { replace: true });
  }

  return (
    <div className="shell">
      <a href="#conteudo" className="skip">Pular para o conteúdo</a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>IA</span>
          <span className="brand-name">{OFICINA.nome}<small>{OFICINA.subtitulo}</small></span>
        </div>
        <nav aria-label="Principal">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-link"><Svg d={l.icon} />{l.label}</NavLink>
          ))}
          {isMaster && <NavLink to="/sistema/fotos" className="nav-link"><Svg d={Icon.fotos} />Fotos exigidas</NavLink>}
        </nav>
        <div className="sidebar-user">
          <p className="user-name">{profile?.full_name}</p>
          <p className="user-role">{isMaster ? "Administrador Master" : "Mecânico"}</p>
          <NavLink to="/sistema/trocar-senha" className="sidebar-link">Alterar minha senha</NavLink>
          <button className="btn btn-ghost-dark" onClick={handleSignOut}>Sair</button>
        </div>
      </aside>

      <header className="topbar">
        <span className="brand-mark" aria-hidden>IA</span>
        <span className="topbar-title">{OFICINA.nome}</span>
        <button className="btn btn-ghost-dark btn-sm" onClick={handleSignOut}>Sair</button>
      </header>

      {!online && (
        <div className="offline-bar" role="alert">
          Sem conexão. Você pode consultar o que já está na tela, mas nada novo será salvo até a conexão voltar.
        </div>
      )}

      <main id="conteudo" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Principal (celular)">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="tab-link"><Svg d={l.icon} /><span>{l.label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
