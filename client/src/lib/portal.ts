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
