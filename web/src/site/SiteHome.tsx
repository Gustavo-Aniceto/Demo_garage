import { Link } from "react-router-dom";
import { OFICINA, SERVICOS, whatsappLink } from "../lib/oficina";
import { useOpenNow } from "./SiteLayout";

export function SiteHome() {
  const status = useOpenNow();
  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <p className={`open-sign${status.open ? " is-open" : ""}`}><span aria-hidden />{status.text}</p>
          <h1>{OFICINA.nome}</h1>
          <p className="hero-lead">{OFICINA.subtitulo} multimarcas. Atendimento de demonstração. Diagnóstico antes de trocar peça, orçamento aprovado antes de executar.</p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" to="/contato">Pedir orçamento</Link>
            <a className="btn btn-ghost-dark btn-lg" href={whatsappLink()} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
          </div>
        </div>
        <dl className="hero-facts">
          <div><dt>Endereço</dt><dd>{OFICINA.endereco}<br />{OFICINA.bairro}</dd></div>
          <div><dt>Horário</dt><dd>Seg. a sex., 9h às 18h</dd></div>
          <div><dt>Telefone</dt><dd><a href={`tel:+${OFICINA.whatsapp}`}>{OFICINA.telefone}</a></dd></div>
        </dl>
      </section>

      <section className="site-section">
        <h2>O que fazemos</h2>
        <ul className="svc-grid">
          {SERVICOS.map((s) => <li key={s.slug}><h3>{s.nome}</h3><p>{s.texto}</p></li>)}
        </ul>
        <Link className="btn btn-secondary" to="/servicos">Ver detalhes dos serviços</Link>
      </section>

      <section className="site-section site-band">
        <h2>Como é o atendimento</h2>
        <ol className="flow">
          <li><strong>Recebimento</strong> Registramos quilometragem, estado do veículo e fotos na entrada, na sua frente.</li>
          <li><strong>Diagnóstico</strong> Testamos antes de trocar. Você recebe o que foi encontrado e o porquê.</li>
          <li><strong>Orçamento</strong> Nada é executado sem a sua aprovação, item por item.</li>
          <li><strong>Entrega</strong> Relatório com o que foi feito, peças trocadas e recomendações.</li>
        </ol>
      </section>

      <section className="site-section">
        <h2>Formas de pagamento</h2>
        <ul className="pay">{OFICINA.pagamentos.map((p) => <li key={p}>{p}</li>)}</ul>
      </section>

      <section className="site-section site-cta">
        <h2>Seu carro está dando sinal?</h2>
        <p>Conte o que está acontecendo. Respondemos em horário comercial para combinar a avaliação.</p>
        <div className="hero-cta">
          <Link className="btn btn-primary btn-lg" to="/contato">Pedir orçamento ou agendamento</Link>
          <a className="btn btn-secondary btn-lg" href={whatsappLink()} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </div>
      </section>
    </>
  );
}
