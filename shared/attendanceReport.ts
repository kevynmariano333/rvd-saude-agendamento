/**
 * As linhas do histórico do portão, prontas para virar planilha.
 *
 * Cada tempo aparece duas vezes: escrito, para quem lê a tabela na tela, e em
 * minutos, para quem vai somar e cruzar no Excel — um "1h 35min" não entra numa
 * média. Os cabeçalhos são os nomes das colunas na planilha, então trocá-los
 * muda o arquivo que a operação recebe.
 */
export type GateReportSource = {
  protocol: string;
  driverName: string;
  driverDocument: string | null;
  licensePlate: string;
  supplierName: string | null;
  serviceType: "coleta" | "recebimento";
  classification: "amil" | "llt" | "rvd";
  classificationDetail: string;
  status: string;
  dockNumber: number | null;
  invoiceNumbersJson: string | null;
  refusalReason: string | null;
  notes: string | null;
  arrivalAt: Date | string;
  decisionAt: Date | string | null;
  enteredAt: Date | string | null;
  releasedAt: Date | string | null;
  concludedAt: Date | string | null;
};

export type GateReportRow = Record<string, string | number>;

const SAO_PAULO = "America/Sao_Paulo";

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A data e a hora são as de São Paulo, não as do relógio de quem abre o arquivo. */
export function reportDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO, dateStyle: "short" }).format(date);
}

export function reportTime(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO, hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Minutos inteiros entre dois instantes, ou "" quando algum deles não existe. */
export function minutesBetween(from: Date | string | null | undefined, to: Date | string | null | undefined) {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return "";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return minutes < 0 ? "" : minutes;
}

export function formatMinutes(minutes: number | "") {
  if (minutes === "") return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function parseInvoiceNumbers(json: string | null) {
  if (!json) return [] as string[];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function toGateReportRow(
  item: GateReportSource,
  labels: { status: (value: string) => string; serviceType: (value: string) => string; classification: (item: GateReportSource) => string },
  // O RG do motorista é dado pessoal e só o administrador o leva na planilha.
  // Fora disso a coluna não existe, em vez de existir vazia: uma coluna "RG"
  // em branco convida a preencher à mão o que o portal decidiu não entregar.
  options: { includeDriverDocument?: boolean } = {}
): GateReportRow {
  const stayMinutes = minutesBetween(item.arrivalAt, item.concludedAt);
  const waitMinutes = minutesBetween(item.arrivalAt, item.decisionAt);
  const dockMinutes = minutesBetween(item.enteredAt, item.releasedAt);

  const row: GateReportRow = {
    Protocolo: item.protocol,
    Data: reportDate(item.arrivalAt),
    Chegada: reportTime(item.arrivalAt),
    Entrada: reportTime(item.enteredAt),
    Saída: reportTime(item.concludedAt),
    Permanência: formatMinutes(stayMinutes),
    "Permanência (min)": stayMinutes,
    "Espera pela Operação (min)": waitMinutes,
    "Tempo na doca (min)": dockMinutes,
    Status: labels.status(item.status),
    Tipo: labels.serviceType(item.serviceType),
    Classificação: labels.classification(item),
    Doca: item.dockNumber ?? "",
    Placa: item.licensePlate,
    Motorista: item.driverName,
    Fornecedor: item.supplierName ?? "",
    Notas: parseInvoiceNumbers(item.invoiceNumbersJson).join(", "),
    "Motivo da recusa": item.refusalReason ?? "",
    Observações: item.notes ?? "",
  };

  if (options.includeDriverDocument) row.RG = item.driverDocument ?? "";
  return row;
}

/** A ordem das colunas na planilha, e a largura de cada uma. */
export function gateReportColumns(options: { includeDriverDocument?: boolean } = {}) {
  return options.includeDriverDocument
    ? [...baseGateReportColumns, { key: "RG", width: 16 }]
    : baseGateReportColumns;
}

const baseGateReportColumns: { key: string; width: number }[] = [
  { key: "Protocolo", width: 20 },
  { key: "Data", width: 11 },
  { key: "Chegada", width: 9 },
  { key: "Entrada", width: 9 },
  { key: "Saída", width: 9 },
  { key: "Permanência", width: 13 },
  { key: "Permanência (min)", width: 17 },
  { key: "Espera pela Operação (min)", width: 25 },
  { key: "Tempo na doca (min)", width: 19 },
  { key: "Status", width: 15 },
  { key: "Tipo", width: 14 },
  { key: "Classificação", width: 22 },
  { key: "Doca", width: 6 },
  { key: "Placa", width: 11 },
  { key: "Motorista", width: 26 },
  { key: "Fornecedor", width: 26 },
  { key: "Notas", width: 24 },
  { key: "Motivo da recusa", width: 34 },
  { key: "Observações", width: 34 },
];
