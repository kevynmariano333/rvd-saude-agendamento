export type PortalRole = "admin" | "operator" | "supplier";
export type PortalStatus = "pending" | "approved" | "rejected" | "completed";

export const statusCopy: Record<PortalStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  completed: "Concluído",
};

export function isPortalOperator(role: PortalRole) {
  return role === "operator" || role === "admin";
}

export function formatAppointmentDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
