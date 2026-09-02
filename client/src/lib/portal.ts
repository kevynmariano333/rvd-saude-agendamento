export type PortalRole = "admin" | "operator" | "supplier" | "portaria" | "operacao";
export type PortalStatus = "pending" | "scheduled" | "received" | "completed" | "backlog" | "rejected";

export const statusCopy: Record<PortalStatus, string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  received: "Recebido",
  completed: "Concluído",
  backlog: "Backlog",
  rejected: "Rejeitado",
};

export const roleLabel: Record<PortalRole, string> = {
  admin: "Administrador",
  operator: "Operador",
  supplier: "Fornecedor",
  portaria: "Portaria",
  operacao: "Operação",
};

export function isPortalOperator(role: PortalRole) {
  return role === "operator" || role === "admin";
}

export function isPortalAdmin(role: PortalRole) {
  return role === "admin";
}

/** Quem registra chegadas e decide a entrada no portão. */
export function isPortalGate(role: PortalRole) {
  return role === "portaria" || role === "admin";
}

/**
 * Quem autoriza o recebimento e conduz a carga na doca. É a mesma pessoa que
 * cuida da agenda: quem combina a entrega é quem a recebe. O perfil "operacao"
 * continua valendo para as contas que já existem com ele.
 */
export function isPortalYard(role: PortalRole) {
  return role === "operacao" || role === "operator" || role === "admin";
}

/**
 * Cada perfil enxerga o seu posto de trabalho. O pátio é da Portaria e da
 * Operação; quem cuida de agendamentos não entra ali, e o fornecedor nunca.
 * O administrador responde pelo sistema todo e é o único que vê tudo.
 */
export function canSeeAttendances(role: PortalRole) {
  return role !== "supplier";
}

/** A tela em que cada perfil começa depois de entrar. */
export function homePathFor(role: PortalRole) {
  if (role === "supplier") return "/fornecedor";
  if (role === "portaria") return "/portaria";
  if (role === "operacao") return "/operacao";
  return "/operador/dashboard";
}

export function formatAppointmentDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function getAppointmentMomentForDisplay(input: { status: PortalStatus; scheduledFor: Date | string; receivedAt?: Date | string | null }) {
  return input.status === "received" && input.receivedAt ? input.receivedAt : input.scheduledFor;
}

export function hasConfirmedAppointmentMoment(status: PortalStatus) {
  return status === "scheduled" || status === "received" || status === "completed";
}

/** Renders a CNPJ as 00.000.000/0000-00, leaving anything unexpected as-is. */
export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
