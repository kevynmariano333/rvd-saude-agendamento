export type AttendanceStatus =
  | "aguardando"
  | "aprovado"
  | "recusado"
  | "em_atendimento"
  | "liberado"
  | "concluido";
export type AttendanceServiceType = "coleta" | "recebimento";
export type AttendanceClassification = "amil" | "llt" | "rvd";
export type AttendanceClassificationDetail =
  | "maternidade"
  | "hospital"
  | "sedex"
  | "mercado_livre"
  | "nao_aplicavel";
export type AttendanceEventType =
  | "chegada_registrada"
  | "entrada_aprovada"
  | "entrada_recusada"
  | "atendimento_iniciado"
  | "liberacao_registrada"
  | "atendimento_concluido";

export const attendanceStatusCopy: Record<AttendanceStatus, string> = {
  aguardando: "Aguardando",
  aprovado: "Aprovado",
  recusado: "Recusado",
  em_atendimento: "Em atendimento",
  liberado: "Liberado",
  concluido: "Concluído",
};

/** Tons semânticos: espera, liberado para seguir, barrado, em movimento, encerrado. */
export const attendanceStatusTone: Record<AttendanceStatus, string> = {
  aguardando: "bg-state-wait-bg text-state-wait",
  aprovado: "bg-state-go-bg text-state-go",
  recusado: "bg-state-stop-bg text-state-stop",
  em_atendimento: "bg-state-move-bg text-state-move",
  liberado: "bg-state-move-bg text-state-move",
  concluido: "bg-state-done-bg text-state-done",
};

export const serviceTypeCopy: Record<AttendanceServiceType, string> = {
  coleta: "Coleta",
  recebimento: "Recebimento",
};

export const classificationCopy: Record<AttendanceClassification, string> = {
  amil: "AMIL",
  llt: "LLT",
  rvd: "RVD",
};

export const classificationDetailCopy: Record<AttendanceClassificationDetail, string> = {
  maternidade: "Maternidade",
  hospital: "Hospital",
  sedex: "Sedex",
  mercado_livre: "Mercado Livre",
  nao_aplicavel: "Não aplicável",
};

export const attendanceEventCopy: Record<AttendanceEventType, string> = {
  chegada_registrada: "Chegada registrada",
  entrada_aprovada: "Entrada aprovada",
  entrada_recusada: "Entrada recusada",
  atendimento_iniciado: "Atendimento iniciado",
  liberacao_registrada: "Liberação registrada",
  atendimento_concluido: "Atendimento concluído",
};

/** Subtipos aceitos por classificação — espelha a regra validada no servidor. */
export function classificationDetailsFor(
  classification: AttendanceClassification
): AttendanceClassificationDetail[] {
  if (classification === "amil") return ["maternidade", "hospital"];
  if (classification === "rvd") return ["sedex", "mercado_livre"];
  return ["nao_aplicavel"];
}

export function classificationLabel(
  classification: AttendanceClassification,
  detail: AttendanceClassificationDetail
) {
  const short = classificationCopy[classification];
  return detail === "nao_aplicavel" ? short : `${short} · ${classificationDetailCopy[detail]}`;
}

export function formatArrival(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/** Há quanto tempo o caminhão está na unidade, em texto curto para a fila. */
export function formatElapsed(from: Date | string, reference = new Date()) {
  const minutes = Math.max(0, Math.round((reference.getTime() - new Date(from).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatWaitMinutes(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}
