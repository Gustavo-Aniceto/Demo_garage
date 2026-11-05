export type AppRole = "master" | "mecanico";

export interface MyProfile {
  id: string;
  full_name: string;
  login: string;
  role: AppRole;
  active: boolean;
  must_change_password: boolean;
  can_checkout: boolean;
}

export interface ManagedUser extends MyProfile {
  created_at: string;
  last_access_at: string | null;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  cpf: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerSearchRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  created_at: string;
  plates: string[];
}

export type VehicleType = "carro" | "moto" | "utilitario" | "caminhonete" | "caminhao" | "outro";

export interface Vehicle {
  id: string;
  plate: string;
  plate_normalized: string;
  brand: string;
  model: string;
  year_manufacture: number | null;
  year_model: number | null;
  color: string | null;
  vehicle_type: VehicleType;
  customer_id: string;
  notes: string | null;
  created_at: string;
}

export type OsStatus =
  | "aguardando_diagnostico" | "em_diagnostico" | "aguardando_orcamento" | "aguardando_aprovacao"
  | "aguardando_pecas" | "aguardando_execucao" | "em_execucao" | "aguardando_conferencia"
  | "pronto_retirada" | "entregue" | "cancelado";

export interface ServiceOrderRow {
  id: string;
  number: string;
  status: OsStatus;
  opened_at: string;
  checkin_completed_at: string | null;
  closed_at: string | null;
}

export interface DashboardSummary {
  em_atendimento: number;
  aguardando_diagnostico: number;
  orcamentos_pendentes: number;
  orcamentos_aprovados: number;
  em_execucao: number;
  prontos_retirada: number;
  concluidas: number;
  checkins_rascunho: number;
}

export interface ActivityRow {
  created_at: string;
  service_order_id: string;
  os_number: string;
  plate: string;
  vehicle: string;
  from_status: OsStatus | null;
  to_status: OsStatus;
  actor_name: string | null;
}

export interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  result: "sucesso" | "negado" | "erro";
  details: Record<string, unknown>;
  created_at: string;
}

/** Status: rótulo + tom (o tom sempre acompanha texto, nunca sozinho). */
export const OS_STATUS: Record<OsStatus, { label: string; tone: "wait" | "work" | "ready" | "done" | "stop" }> = {
  aguardando_diagnostico: { label: "Aguardando diagnóstico", tone: "wait" },
  em_diagnostico: { label: "Em diagnóstico", tone: "work" },
  aguardando_orcamento: { label: "Aguardando orçamento", tone: "wait" },
  aguardando_aprovacao: { label: "Aguardando aprovação", tone: "wait" },
  aguardando_pecas: { label: "Aguardando peças", tone: "wait" },
  aguardando_execucao: { label: "Aguardando execução", tone: "wait" },
  em_execucao: { label: "Em execução", tone: "work" },
  aguardando_conferencia: { label: "Aguardando conferência", tone: "work" },
  pronto_retirada: { label: "Pronto para retirada", tone: "ready" },
  entregue: { label: "Entregue", tone: "done" },
  cancelado: { label: "Cancelado", tone: "stop" },
};

export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: "carro", label: "Carro" },
  { value: "moto", label: "Moto" },
  { value: "utilitario", label: "Utilitário" },
  { value: "caminhonete", label: "Caminhonete" },
  { value: "caminhao", label: "Caminhão" },
  { value: "outro", label: "Outro" },
];

// ===================== Fase 3 =====================
export type FuelLevel = "reserva" | "1_4" | "1_2" | "3_4" | "cheio";
export const FUEL_LEVELS: { value: FuelLevel; label: string }[] = [
  { value: "reserva", label: "Reserva" }, { value: "1_4", label: "1/4" }, { value: "1_2", label: "1/2" },
  { value: "3_4", label: "3/4" }, { value: "cheio", label: "Cheio" },
];

export type InspectionResult = "sem_avaria" | "com_avaria" | "nao_verificado" | "nao_aplicavel";
export const INSPECTION_RESULTS: { value: InspectionResult; label: string }[] = [
  { value: "sem_avaria", label: "Sem avaria" }, { value: "com_avaria", label: "Com avaria" },
  { value: "nao_verificado", label: "Não verificado" }, { value: "nao_aplicavel", label: "Não se aplica" },
];
export const INSPECTION_ITEMS: { code: string; label: string }[] = [
  { code: "pintura_riscos", label: "Riscos na pintura" }, { code: "amassados", label: "Amassados" },
  { code: "batidas", label: "Batidas" }, { code: "trincas", label: "Trincas" },
  { code: "para_choques", label: "Para-choques" }, { code: "pneus", label: "Pneus (estado aparente)" },
  { code: "vidros", label: "Vidros" }, { code: "retrovisores", label: "Retrovisores" },
  { code: "interior", label: "Interior" }, { code: "acessorios", label: "Acessórios e itens recebidos" },
  { code: "outros", label: "Outros danos" },
];
export const DASHBOARD_LIGHTS = [
  "Injeção / motor", "Óleo", "Bateria", "Temperatura", "Freio / ABS", "Airbag", "Pressão dos pneus", "Direção", "Outra",
];

export type PhotoStage = "checkin" | "checkup" | "checkout";
export interface PhotoCategory { code: string; label: string; stage: PhotoStage; required: boolean; sort_order: number; active: boolean }
export interface VehiclePhoto {
  id: string; service_order_id: string; vehicle_id: string; stage: PhotoStage; category: string;
  description: string | null; storage_path: string; taken_at: string; created_by: string | null; include_in_report: boolean;
}

export interface CheckinInspection {
  id: string; service_order_id: string; entered_at: string; km_in: number; fuel_level: FuelLevel | null;
  responsible_id: string; visit_reason: string | null; customer_complaint: string | null; dashboard_lights: string[];
  customer_reported_alerts: string | null; starting_difficulty: boolean | null; noises_reported: string | null;
  vibrations_reported: string | null; leaks_observed: string | null; staff_observations: string | null;
  accessories_received: string | null; customer_ack: boolean; customer_ack_name: string | null;
  customer_ack_method: ApprovalMethod | null;
}
export interface InspectionItemRow { id: string; inspection_id: string; item_code: string; result: InspectionResult; notes: string | null }

export type DefectCategory = "motor" | "injecao_eletronica" | "suspensao" | "freios" | "sistema_eletrico" | "transmissao"
  | "arrefecimento" | "pneus" | "carroceria" | "outros";
export const DEFECT_CATEGORIES: { value: DefectCategory; label: string }[] = [
  { value: "motor", label: "Motor" }, { value: "injecao_eletronica", label: "Injeção eletrônica" },
  { value: "suspensao", label: "Suspensão" }, { value: "freios", label: "Freios" },
  { value: "sistema_eletrico", label: "Sistema elétrico" }, { value: "transmissao", label: "Transmissão" },
  { value: "arrefecimento", label: "Arrefecimento" }, { value: "pneus", label: "Pneus" },
  { value: "carroceria", label: "Carroceria" }, { value: "outros", label: "Outros" },
];
export const SEVERITIES = [
  { value: "baixa", label: "Baixa" }, { value: "media", label: "Média" }, { value: "alta", label: "Alta" }, { value: "critica", label: "Crítica" },
];
export interface Defect { id: string; diagnostic_id: string; category: DefectCategory; description: string; severity: string }
export interface Diagnostic {
  id: string; service_order_id: string; performed_at: string; mechanic_id: string; symptoms: string | null;
  tests_performed: string | null; technical_diagnosis: string | null; recommended_services: string | null;
  required_parts: string | null; notes: string | null; needs_reevaluation: boolean; diagnostic_defects?: Defect[];
}

export type ApprovalMethod = "presencial" | "whatsapp" | "telefone" | "email" | "outro";
export const APPROVAL_METHODS: { value: ApprovalMethod; label: string }[] = [
  { value: "presencial", label: "Presencial" }, { value: "whatsapp", label: "WhatsApp" },
  { value: "telefone", label: "Telefone" }, { value: "email", label: "E-mail" }, { value: "outro", label: "Outro" },
];
export type QuoteStatus = "em_elaboracao" | "pendente_aprovacao" | "aprovado" | "recusado" | "cancelado";
export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: string }> = {
  em_elaboracao: { label: "Em elaboração", tone: "work" }, pendente_aprovacao: { label: "Pendente de aprovação", tone: "wait" },
  aprovado: { label: "Aprovado", tone: "ready" }, recusado: { label: "Recusado", tone: "stop" }, cancelado: { label: "Cancelado", tone: "done" },
};
export type ItemKind = "servico" | "peca" | "mao_de_obra";
export const ITEM_KINDS: { value: ItemKind; label: string }[] = [
  { value: "servico", label: "Serviço" }, { value: "peca", label: "Peça" }, { value: "mao_de_obra", label: "Mão de obra" },
];
export interface QuoteItem { id: string; quote_id: string; kind: ItemKind; description: string; quantity: number; unit_price: number; total: number; approved: boolean; sort_order: number }
export interface Quote {
  id: string; service_order_id: string; version: number; status: QuoteStatus; prepared_by: string; prepared_at: string;
  discount_amount: number; discount_authorized_by: string | null; approved_at: string | null; approved_registered_by: string | null;
  approved_by_name: string | null; approval_method: ApprovalMethod | null; approval_notes: string | null;
  refused_at: string | null; notes: string | null; quote_items?: QuoteItem[];
}

export type ExecutionStatus = "executado" | "nao_executado" | "pendente";
export const EXECUTION_STATUS: { value: ExecutionStatus; label: string; tone: string }[] = [
  { value: "executado", label: "Executado", tone: "ready" }, { value: "nao_executado", label: "Não executado", tone: "stop" },
  { value: "pendente", label: "Pendente", tone: "wait" },
];
export interface PerformedService {
  id: string; service_order_id: string; quote_item_id: string | null; kind: ItemKind; description: string;
  quantity: number; status: ExecutionStatus; performed_by: string | null; performed_at: string; notes: string | null;
}
export interface CheckoutRow {
  id: string; service_order_id: string; checked_out_at: string; km_out: number; mechanic_id: string; released_by: string;
  pending_items: string | null; future_recommendations: string | null; final_notes: string | null;
  delivered_to_name: string | null; delivery_confirmed: boolean;
}
export interface ServiceOrderFull extends ServiceOrderRow {
  customer_id: string; vehicle_id: string; opened_by: string | null; closed_by: string | null; client_request_id: string | null;
  vehicles: Vehicle; customers: Customer;
}
export interface OsEvent { id: number; service_order_id: string; from_status: OsStatus | null; to_status: OsStatus; actor_id: string | null; created_at: string }
export interface OsSearchRow {
  id: string; number: string; status: OsStatus; opened_at: string; closed_at: string | null; checkin_completed_at: string | null;
  vehicle_id: string; plate: string; vehicle: string; customer_name: string;
}
export interface StaffMember { id: string; full_name: string; role: AppRole; active: boolean }

/** Status que a equipe pode escolher manualmente (o banco valida cada transição). */
export const MANUAL_STATUSES: OsStatus[] = [
  "aguardando_diagnostico", "em_diagnostico", "aguardando_orcamento", "aguardando_aprovacao", "aguardando_pecas",
  "aguardando_execucao", "em_execucao", "aguardando_conferencia", "pronto_retirada", "cancelado",
];

// ===================== Fase 4 =====================
export type ContactStatus = "novo" | "em_atendimento" | "respondido" | "arquivado";
export const CONTACT_STATUS: Record<ContactStatus, { label: string; tone: string }> = {
  novo: { label: "Novo", tone: "wait" }, em_atendimento: { label: "Em atendimento", tone: "work" },
  respondido: { label: "Respondido", tone: "ready" }, arquivado: { label: "Arquivado", tone: "done" },
};
export interface ContactRequest {
  id: string; name: string; phone: string; plate: string | null; brand_model: string | null; service: string | null;
  description: string | null; preferred_period: string | null; request_type: "orcamento" | "agendamento" | "contato";
  status: ContactStatus; handled_by: string | null; internal_notes: string | null; created_at: string;
}
