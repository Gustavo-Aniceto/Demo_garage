import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { OFICINA, feriados, whatsappLink } from "../lib/oficina";

export function SiteLayout() {
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMenu(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  return (
    <div className="site">
      <a href="#conteudo" className="skip">Pular para o conteúdo</a>
      <header className="site-head">
        <Link to="/" className="site-brand"><span className="brand-mark" aria-hidden>{OFICINA.nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</span><span>{OFICINA.nome}<small>{OFICINA.subtitulo}</small></span></Link>
        <button className="site-menu-btn" aria-expanded={menu} aria-controls="site-nav" onClick={() => setMenu(!menu)}>{menu ? "Fechar" : "Menu"}</button>
        <nav id="site-nav" className={`site-nav${menu ? " open" : ""}`} aria-label="Site">
          <NavLink to="/" end>Início</NavLink>
          <NavLink to="/servicos">Serviços</NavLink>
          <NavLink to="/contato">Contato e orçamento</NavLink>
          <a className="btn btn-primary btn-sm" href={whatsappLink()} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </nav>
      </header>
      <main id="conteudo"><Outlet /></main>
      <footer className="site-foot">
        <div>
          <strong>{OFICINA.nome}</strong> {OFICINA.subtitulo}
          <p>{OFICINA.endereco}<br />{OFICINA.bairro}<br />CEP {OFICINA.cep}</p>
          <a href={OFICINA.mapsUrl} target="_blank" rel="noopener noreferrer">Ver no mapa</a>
        </div>
        <div>
          <strong>Horário</strong>
          {OFICINA.horario.map((h) => <p key={h.dias}>{h.dias}: {h.horas}</p>)}
        </div>
        <div>
          <strong>Contato</strong>
          <p><a href={`tel:+${OFICINA.whatsapp}`}>{OFICINA.telefone}</a></p>
          <p><a href={whatsappLink()} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a></p>
          <p className="site-staff"><Link to="/sistema/login">Área da equipe</Link></p>
        </div>
      </footer>
    </div>
  );
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Data/hora de São Paulo, independente do fuso do aparelho. */
function spNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const holiday = (d: Date) => feriados(d.getFullYear())[key(d)];
const isWorkday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5 && !holiday(d);

/** "Aberto agora" no fuso de São Paulo: seg–sex, 9h–18h, fechado em feriados. */
export function openStatus(now = spNow()): { open: boolean; text: string } {
  const m = now.getHours() * 60 + now.getMinutes();
  const today = holiday(now);
  if (isWorkday(now) && m >= 540 && m < 1080) return { open: true, text: "Aberto agora, até as 18h" };
  if (isWorkday(now) && m < 540) return { open: false, text: "Fechado agora, abre hoje às 9h" };
  let next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  for (let i = 0; i < 10 && !isWorkday(next); i++) next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
  const quando = next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() === 86400000 ? "amanhã" : DIAS[next.getDay()];
  return { open: false, text: `${today ? `Fechado hoje (${today})` : "Fechado agora"}, abre ${quando} às 9h` };
}

export function useOpenNow() {
  const calc = () => openStatus();
  const [s, setS] = useState(calc);
  useEffect(() => { const t = setInterval(() => setS(calc()), 60000); return () => clearInterval(t); }, []);
  return s;
}
