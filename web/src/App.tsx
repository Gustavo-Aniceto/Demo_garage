import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { configError } from "./lib/supabase";
import { ToastProvider } from "./components/Toast";
import { Layout } from "./components/Layout";
import { RequireAuth, RequireMaster } from "./components/Guards";
import { Login } from "./pages/Login";
import { TrocarSenha } from "./pages/TrocarSenha";
import { Painel } from "./pages/Painel";
import { Clientes } from "./pages/Clientes";
import { ClienteForm } from "./pages/ClienteForm";
import { ClienteDetalhe } from "./pages/ClienteDetalhe";
import { VeiculoForm } from "./pages/VeiculoForm";
import { VeiculoDetalhe } from "./pages/VeiculoDetalhe";
import { Usuarios } from "./pages/Usuarios";
import { Auditoria } from "./pages/Auditoria";
import { NaoEncontrada } from "./pages/NaoEncontrada";
import { CheckinWizard } from "./pages/CheckinWizard";
import { OrdemServico } from "./pages/OrdemServico";
import { Ordens } from "./pages/Ordens";
import { Documento } from "./pages/Documento";
import { HistoricoDoc } from "./pages/HistoricoDoc";
import { Solicitacoes } from "./pages/Solicitacoes";
import { FotosConfig } from "./pages/FotosConfig";
import { SiteLayout } from "./site/SiteLayout";
import { SiteHome } from "./site/SiteHome";
import { SiteServicos } from "./site/SiteServicos";
import { SiteContato } from "./site/SiteContato";

export default function App() {
  if (configError) return <div className="splash"><p>{configError}</p></div>;
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Site público (sem login) */}
            <Route path="/" element={<SiteLayout />}>
              <Route index element={<SiteHome />} />
              <Route path="servicos" element={<SiteServicos />} />
              <Route path="contato" element={<SiteContato />} />
            </Route>
            {/* Documentos: tela limpa para PDF, ainda exigindo login */}
            <Route path="/sistema/os/:id/documento/:tipo" element={<RequireAuth><Documento /></RequireAuth>} />
            <Route path="/sistema/veiculos/:id/documento" element={<RequireAuth><HistoricoDoc /></RequireAuth>} />
            <Route path="/sistema/login" element={<Login />} />
            <Route path="/sistema/trocar-senha" element={<TrocarSenha />} />
            <Route path="/sistema" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Painel />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="clientes/novo" element={<ClienteForm />} />
              <Route path="clientes/:id" element={<ClienteDetalhe />} />
              <Route path="clientes/:id/editar" element={<ClienteForm />} />
              <Route path="clientes/:customerId/veiculos/novo" element={<VeiculoForm />} />
              <Route path="veiculos/:id" element={<VeiculoDetalhe />} />
              <Route path="veiculos/:vehicleId/editar" element={<VeiculoForm />} />
              <Route path="ordens" element={<Ordens />} />
              <Route path="os/:id" element={<OrdemServico />} />
              <Route path="checkin/novo" element={<CheckinWizard />} />
              <Route path="checkin/:osId" element={<CheckinWizard />} />
              <Route path="solicitacoes" element={<Solicitacoes />} />
              <Route path="usuarios" element={<RequireMaster><Usuarios /></RequireMaster>} />
              <Route path="auditoria" element={<RequireMaster><Auditoria /></RequireMaster>} />
              <Route path="fotos" element={<RequireMaster><FotosConfig /></RequireMaster>} />
              <Route path="*" element={<NaoEncontrada />} />
            </Route>
            <Route path="*" element={<SiteLayout />}><Route path="*" element={<NaoEncontrada />} /></Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
