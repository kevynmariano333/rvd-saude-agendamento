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
  | "mercado_livre"
  | "correios"
  | "braspress"
  | "excargo"
  | "rodonaves"
  | "br4"
  | "jamef"
  | "cliente_retira"
  | "dibpel"
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
  mercado_livre: "Mercado Livre",
  correios: "Correios",
  braspress: "Braspress",
  excargo: "Excargo",
  rodonaves: "Rodonaves",
  br4: "BR4",
  jamef: "Jamef",
  dibpel: "DIBPEL",
  cliente_retira: "Cliente retira",
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
  if (classification === "rvd") {
    return [
      "correios",
      "braspress",
      "excargo",
      "rodonaves",
      "br4",
      "jamef",
      "dibpel",
      "mercado_livre",
      "cliente_retira",
    ];
  }
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

/** As notas do protocolo, guardadas como lista JSON no registro. */
export function parseInvoiceNumbers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Quanto tempo o caminhão ficou na unidade. Fecha na saída; enquanto ele está
 * dentro, segue correndo — é o número que a Portaria olha para saber se algum
 * atendimento está demorando demais.
 *
 * Uma recusa não tem permanência: o caminhão nunca entrou.
 */
export function stayDuration(
  input: { status: AttendanceStatus; arrivalAt: Date | string; concludedAt?: Date | string | null },
  reference = new Date()
): { text: string; ongoing: boolean } | null {
  if (input.status === "recusado" || input.status === "aguardando") return null;
  if (input.concludedAt) {
    return { text: formatElapsed(input.arrivalAt, new Date(input.concludedAt)), ongoing: false };
  }
  return { text: formatElapsed(input.arrivalAt, reference), ongoing: true };
}

export function formatWaitMinutes(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}
