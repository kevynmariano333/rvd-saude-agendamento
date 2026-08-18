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

export function formatAppointmentDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
