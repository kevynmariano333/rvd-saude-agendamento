import type { AppointmentStatus, UserRole } from "../drizzle/schema";

export function isOperator(role: UserRole) {
  return role === "operator" || role === "admin";
}

export function canRequestAppointment(role: UserRole) {
  return role === "supplier";
}

export function canTransitionAppointment(
  current: AppointmentStatus,
  next: Exclude<AppointmentStatus, "pending">
) {
  if (next === "completed") return current === "approved";
  if (next === "approved" || next === "rejected") return current === "pending";
  return false;
}
