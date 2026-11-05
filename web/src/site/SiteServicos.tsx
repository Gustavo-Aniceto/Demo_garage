import { Link } from "react-router-dom";
import { SERVICOS, whatsappLink } from "../lib/oficina";

export function SiteServicos() {
  return (
    <section className="site-section site-page">
      <h1>Serviços</h1>
      <p className="lead">Atendemos carros nacionais e importados. Cada serviço começa com a avaliação do veículo.</p>
      <ul className="svc-list">
        {SERVICOS.map((s) => (
          <li key={s.slug}>
            <div><h2>{s.nome}</h2><p>{s.texto}</p></div>
            <div className="svc-actions">
              <a className="btn btn-secondary" href={whatsappLink(`Olá! Gostaria de informações sobre: ${s.nome}.`)} target="_blank" rel="noopener noreferrer">Perguntar no WhatsApp</a>
              <Link className="btn btn-primary" to={`/contato?servico=${encodeURIComponent(s.nome)}`}>Pedir orçamento</Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
