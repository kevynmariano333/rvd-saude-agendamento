import type {
  AttendanceClassification,
  AttendanceClassificationDetail,
  AttendanceStatus,
  UserRole,
} from "../drizzle/schema";

/**
 * Separation of duties at the gate: the Portaria decides who comes in, the
 * Operação carries the truck through the yard. An administrator answers for
 * both. Nobody else acts on an attendance — they only watch it.
 */
export function canManagePortaria(role: UserRole) {
  return role === "portaria" || role === "admin";
}

export function canManageOperation(role: UserRole) {
  return role === "operacao" || role === "admin";
}

/**
 * O pátio é da Portaria e da Operação. Quem cuida de agendamentos tem o seu
 * próprio posto e não entra aqui; o administrador responde por tudo.
 */
export function canViewAttendances(role: UserRole) {
  return role === "portaria" || role === "operacao" || role === "admin";
}

/** Each classification carries its own subtypes; LLT has none. */
export function isValidClassificationDetail(
  classification: AttendanceClassification,
  detail: AttendanceClassificationDetail
) {
  if (classification === "amil") return detail === "maternidade" || detail === "hospital";
  if (classification === "rvd") return detail === "sedex" || detail === "mercado_livre";
  return detail === "nao_aplicavel";
}

export function classificationDetailsFor(
  classification: AttendanceClassification
): AttendanceClassificationDetail[] {
  if (classification === "amil") return ["maternidade", "hospital"];
  if (classification === "rvd") return ["sedex", "mercado_livre"];
  return ["nao_aplicavel"];
}

/**
 * Returns the reason the decision cannot be recorded, or null when it can. A
 * refusal without a written reason is never accepted: the justification is what
 * the driver is told at the gate and what the audit trail keeps.
 */
export function validateEntryDecision(
  currentStatus: AttendanceStatus,
  decision: "aprovar" | "recusar",
  refusalReason?: string | null
) {
  if (currentStatus !== "aguardando") {
    return "Somente atendimentos aguardando podem receber uma decisão de entrada.";
  }
  if (decision === "recusar" && !refusalReason?.trim()) {
    return "O motivo da recusa é obrigatório.";
  }
  return null;
}

export function validateOperationalTransition(
  currentStatus: AttendanceStatus,
  action: "iniciar" | "liberar" | "concluir"
) {
  const valid =
    (action === "iniciar" && currentStatus === "aprovado") ||
    (action === "liberar" && currentStatus === "em_atendimento") ||
    (action === "concluir" && (currentStatus === "em_atendimento" || currentStatus === "liberado"));

  return valid ? null : "Esta ação não está disponível para o status atual do atendimento.";
}
