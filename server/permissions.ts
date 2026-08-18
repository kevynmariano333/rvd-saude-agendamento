import type { AppointmentStatus, UserRole } from "../drizzle/schema";

export function isOperator(role: UserRole) {
  return role === "operator" || role === "admin";
}

export function canRequestAppointment(role: UserRole) {
  return role === "supplier";
}

export function canApplySuggestion(status: AppointmentStatus) {
  return status === "pending" || status === "backlog";
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
