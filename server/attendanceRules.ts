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

/**
 * Quem autoriza o recebimento e libera a doca. É a mesma pessoa que cuida da
 * agenda — quem combina a entrega é quem a recebe. O perfil "operacao" segue
 * valendo para as contas que já existem com ele.
 */
export function canManageOperation(role: UserRole) {
  return role === "operacao" || role === "operator" || role === "admin";
}

/** O pátio é interno: o fornecedor nunca o enxerga. */
export function canViewAttendances(role: UserRole) {
  return role !== "supplier";
}

/** Cada classificação carrega os seus subtipos; a LLT não tem nenhum. */
export function isValidClassificationDetail(
  classification: AttendanceClassification,
  detail: AttendanceClassificationDetail
) {
  return classificationDetailsFor(classification).includes(detail);
}

export function classificationDetailsFor(
  classification: AttendanceClassification
): AttendanceClassificationDetail[] {
  if (classification === "amil") return ["maternidade", "hospital"];
  if (classification === "rvd") {
    return ["correios", "braspress", "excargo", "rodonaves", "br4", "jamef", "mercado_livre", "cliente_retira"];
  }
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

/**
 * O caminhão passa pelo portão duas vezes, e as duas são da Portaria: ela abre
 * a entrada depois que a Operação aceita o recebimento, e fecha o protocolo
 * quando o caminhão sai. Entre uma coisa e outra, a doca é da Operação.
 */
export function canPerformAttendanceAction(role: UserRole, action: AttendanceAction) {
  return action === "liberar" ? canManageOperation(role) : canManagePortaria(role);
}

export const attendanceActionOwner: Record<AttendanceAction, "Portaria" | "Operação"> = {
  iniciar: "Portaria",
  liberar: "Operação",
  concluir: "Portaria",
};

export type AttendanceAction = "iniciar" | "liberar" | "concluir";

export function validateOperationalTransition(currentStatus: AttendanceStatus, action: AttendanceAction) {
  // A saída só se registra depois que a doca liberou: concluir direto de
  // "em atendimento" deixaria o protocolo sem a hora da liberação.
  const valid =
    (action === "iniciar" && currentStatus === "aprovado") ||
    (action === "liberar" && currentStatus === "em_atendimento") ||
    (action === "concluir" && currentStatus === "liberado");

  return valid ? null : "Esta ação não está disponível para o status atual do atendimento.";
}
