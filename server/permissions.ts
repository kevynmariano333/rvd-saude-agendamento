import type { AppointmentStatus, UserRole } from "../drizzle/schema";

export function isOperator(role: UserRole) {
  return role === "operator" || role === "admin";
}

export function canRequestAppointment(role: UserRole) {
  return role === "supplier";
}

/**
 * Quem trabalha a agenda por dentro: a operação de agendamentos e o
 * planejamento. É a régua de leitura — lista de notas, histórico, calendário,
 * relatórios e painel — e também das ações que acompanham a carga depois de
 * marcada.
 */
export function isSchedulingDesk(role: UserRole) {
  return isOperator(role) || role === "planejador";
}

/**
 * Marcar a data é o compromisso com o fornecedor, e ele continua sendo do
 * Operador. O planejador propõe; quem confirma responde pela doca.
 */
export function canConfirmSchedule(role: UserRole) {
  return isOperator(role);
}

/** Propor uma data sem marcá-la: o fornecedor pede, o planejador planeja. */
export function canSuggestSchedule(role: UserRole) {
  return role === "supplier" || role === "planejador";
}

/** Andar com a nota depois de agendada — receber, concluir, recusar. */
export function canMoveAppointmentStatus(role: UserRole) {
  return isSchedulingDesk(role);
}

/**
 * Tratar um backlog: resolver a divergência no SAP e no HIS e fechar a nota.
 *
 * É trabalho do planejamento, não de quem opera a doca — quem mandou a nota
 * para o backlog foi justamente o Operador, ao constatar que o recebimento não
 * fechava. O administrador entra porque responde pelo sistema inteiro.
 */
export function canTreatBacklog(role: UserRole) {
  return role === "planejador" || role === "admin";
}

export function canApplySuggestion(status: AppointmentStatus) {
  return status === "pending" || status === "backlog" || status === "scheduled";
}

export function canScheduleAppointment(status: AppointmentStatus) {
  return status === "pending" || status === "backlog" || status === "scheduled";
}

export function canRescueAppointment(status: AppointmentStatus) {
  return status === "rejected";
}

export function canTransitionAppointment(
  current: AppointmentStatus,
  next: Exclude<AppointmentStatus, "pending">
) {
  const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
    pending: ["scheduled", "backlog", "rejected"],
    scheduled: ["received", "backlog", "rejected"],
    received: ["completed", "backlog", "rejected"],
    backlog: ["scheduled", "rejected"],
    completed: [],
    rejected: [],
  };
  return transitions[current].includes(next);
}
