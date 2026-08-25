export type PortalRole = "admin" | "operator" | "supplier";
export type PortalStatus = "pending" | "scheduled" | "received" | "completed" | "backlog" | "rejected";

export const statusCopy: Record<PortalStatus, string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  received: "Recebido",
  completed: "Concluído",
  backlog: "Backlog",
  rejected: "Rejeitado",
};

export function isPortalOperator(role: PortalRole) {
  return role === "operator" || role === "admin";
}

export function isPortalAdmin(role: PortalRole) {
  return role === "admin";
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
