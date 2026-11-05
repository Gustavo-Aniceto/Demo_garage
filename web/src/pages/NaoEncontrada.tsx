import { Link } from "react-router-dom";
export function NaoEncontrada() {
  return <div className="page"><h1>Página não encontrada</h1><p><Link to="/sistema">Voltar ao painel</Link></p></div>;
}
