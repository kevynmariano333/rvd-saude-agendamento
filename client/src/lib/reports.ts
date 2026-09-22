import { type PortalStatus, statusCopy } from "./portal";
import { apenasDigitos, filtroDeDestinatario, formatarCnpj, unidadePorCnpj } from "@shared/recipients";
import { rotuloDoMotivo } from "@shared/backlogReasons";

export type ReportAppointment = {
  id: number;
  invoiceNumber: string | null;
  supplierName: string | null;
  invoiceSupplierName: string | null;
  supplierCnpj: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  miroNumber: string | null;
  invoiceVolumeCount: number | null;
  invoiceTotalCents: number | null;
  serviceType: string;
  status: PortalStatus;
  scheduledFor: Date | string;
  receivedAt: Date | string | null;
};

export type ReportFilters = {
  scheduledStart?: string;
  scheduledEnd?: string;
  receivedStart?: string;
  receivedEnd?: string;
  status?: Exclude<PortalStatus, "backlog"> | "all";
  supplier?: string;
  recipientCnpj?: string;
};

export type ConsolidatedReportRow = {
  "Nota fiscal": string;
  Fornecedor: string;
  Unidade: string;
  Pedido: string;
  "Número MIRO": string;
  Status: string;
  "Data de agendamento": string;
  "Data de recebimento": string;
  "Item recebido": string;
};

/** O detalhado acrescenta o que não cabe numa visão de conferência rápida. */
export type DetailedReportRow = ConsolidatedReportRow & {
  "CNPJ fornecedor": string;
  "CNPJ destinatário": string;
  Volumes: string;
  "Valor total": string;
};

function isWithinDateRange(value: Date | string | null, start?: string, end?: string) {
  if (!start && !end) return true;
  if (!value) return false;
  const date = new Date(value);
  if (start && date < new Date(`${start}T00:00:00`)) return false;
  if (end && date > new Date(`${end}T23:59:59.999`)) return false;
  return true;
}

export function filterReportAppointments(appointments: ReportAppointment[], filters: ReportFilters) {
  const busca = filters.supplier?.trim().toLocaleLowerCase() ?? "";
  // Um CNPJ digitado vem com ponto e barra; o que está guardado, não.
  const buscaDigitos = apenasDigitos(busca);
  // O filtro de destinatário aceita a sigla da unidade, como na tela de agenda.
  const destinatario = filters.recipientCnpj ? apenasDigitos(filtroDeDestinatario(filters.recipientCnpj)) : "";
  return appointments.filter(item => {
    if (item.status === "backlog") return false;
    if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
    if (!isWithinDateRange(item.scheduledFor, filters.scheduledStart, filters.scheduledEnd)) return false;
    if (!isWithinDateRange(item.receivedAt, filters.receivedStart, filters.receivedEnd)) return false;
    if (busca) {
      const nome = `${item.invoiceSupplierName || ""} ${item.supplierName || ""}`.toLocaleLowerCase();
      // O campo diz "nome ou CNPJ", então os dois precisam encontrar a nota.
      const porCnpj = buscaDigitos.length > 0 && apenasDigitos(item.supplierCnpj).includes(buscaDigitos);
      if (!nome.includes(busca) && !porCnpj) return false;
    }
    if (destinatario && !apenasDigitos(item.recipientCnpj).includes(destinatario)) return false;
    return true;
  });
}

export function formatReportDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function formatReportMoney(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** A unidade que recebeu, pelo nome que a operação usa. */
export function unitLabel(recipientCnpj: string | null) {
  const unidade = unidadePorCnpj(recipientCnpj);
  if (unidade) return `${unidade.sigla} — ${unidade.nome}`;
  return apenasDigitos(recipientCnpj) ? formatarCnpj(recipientCnpj) : "—";
}

function baseRow(item: ReportAppointment): ConsolidatedReportRow {
  return {
    "Nota fiscal": item.invoiceNumber || "—",
    Fornecedor: item.invoiceSupplierName || item.supplierName || "—",
    Unidade: unitLabel(item.recipientCnpj),
    Pedido: item.purchaseOrder || "—",
    // O MIRO é a chave para cruzar este relatório com o SAP; sem ele a
    // conferência volta a ser nota por nota, na mão.
    "Número MIRO": item.miroNumber || "—",
    Status: statusCopy[item.status],
    "Data de agendamento": formatReportDate(item.scheduledFor),
    "Data de recebimento": formatReportDate(item.receivedAt),
    "Item recebido": item.status === "received" || item.status === "completed" ? item.serviceType : "Aguardando recebimento",
  };
}

export function toConsolidatedReportRows(appointments: ReportAppointment[]): ConsolidatedReportRow[] {
  return appointments.map(baseRow);
}

export function toDetailedReportRows(appointments: ReportAppointment[]): DetailedReportRow[] {
  return appointments.map(item => ({
    ...baseRow(item),
    "CNPJ fornecedor": apenasDigitos(item.supplierCnpj) ? formatarCnpj(item.supplierCnpj) : "—",
    "CNPJ destinatário": apenasDigitos(item.recipientCnpj) ? formatarCnpj(item.recipientCnpj) : "—",
    Volumes: item.invoiceVolumeCount === null ? "—" : String(item.invoiceVolumeCount),
    "Valor total": formatReportMoney(item.invoiceTotalCents),
  }));
}

/**
 * Os nomes das colunas de cada visão, tirados das próprias linhas.
 *
 * A tela e o Excel liam listas de colunas diferentes, e foi assim que o número
 * MIRO passou a sair na exportação sem nunca aparecer na tela. Derivando as duas
 * da mesma função, elas não têm como divergir de novo.
 */
export function reportColumns(view: "consolidated" | "detailed"): string[] {
  const modelo: ReportAppointment = {
    id: 0, invoiceNumber: null, supplierName: null, invoiceSupplierName: null, supplierCnpj: null,
    recipientCnpj: null, purchaseOrder: null, miroNumber: null, invoiceVolumeCount: null,
    invoiceTotalCents: null, serviceType: "", status: "pending", scheduledFor: new Date(0), receivedAt: null,
  };
  const linha = view === "detailed" ? toDetailedReportRows([modelo])[0] : toConsolidatedReportRows([modelo])[0];
  return Object.keys(linha);
}

export type BacklogReportAppointment = {
  id: number;
  createdAt: Date | string;
  enteredBacklogAt: Date | string | null;
  leftBacklogAt: Date | string | null;
  status: PortalStatus;
  invoiceNumber: string | null;
  invoiceSupplierName: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  miroNumber: string | null;
  backlogReasonCode: string | null;
  backlogReason: string | null;
  comments: { authorName: string | null; body: string; createdAt: Date | string }[];
};

export type BacklogReportRow = {
  "Data de Criação": string;
  "Entrou em Backlog": string;
  "Saiu do Backlog": string;
  "Status Atual": string;
  "Número da Nota": string;
  "CNPJ Fornecedor": string;
  "Nome Fornecedor": string;
  "Cód. SAP": string;
  Motivo: string;
  Comentários: string;
};

/**
 * Filtra o relatório de backlog.
 *
 * O período vale sobre a entrada no backlog, e não sobre o agendamento: quem
 * abre este relatório quer saber o que travou no mês, não o que foi entregue.
 */
export function filterBacklogReport(linhas: BacklogReportAppointment[], filters: ReportFilters) {
  const busca = filters.supplier?.trim().toLocaleLowerCase() ?? "";
  const buscaDigitos = apenasDigitos(busca);
  return linhas.filter(item => {
    if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
    if (!isWithinDateRange(item.enteredBacklogAt, filters.scheduledStart, filters.scheduledEnd)) return false;
    if (busca) {
      const nome = `${item.invoiceSupplierName || ""} ${item.supplierName || ""}`.toLocaleLowerCase();
      const porCnpj = buscaDigitos.length > 0 && apenasDigitos(item.supplierCnpj).includes(buscaDigitos);
      if (!nome.includes(busca) && !porCnpj) return false;
    }
    return true;
  });
}

export function toBacklogReportRows(linhas: BacklogReportAppointment[]): BacklogReportRow[] {
  return linhas.map(item => ({
    "Data de Criação": formatReportDate(item.createdAt),
    "Entrou em Backlog": formatReportDate(item.enteredBacklogAt),
    // Sem saída registrada, a nota ainda está lá — dizer "—" esconderia isso.
    "Saiu do Backlog": item.leftBacklogAt ? formatReportDate(item.leftBacklogAt) : "Em aberto",
    "Status Atual": statusCopy[item.status],
    "Número da Nota": item.invoiceNumber || "—",
    "CNPJ Fornecedor": apenasDigitos(item.supplierCnpj) ? formatarCnpj(item.supplierCnpj) : "—",
    "Nome Fornecedor": item.invoiceSupplierName || item.supplierName || "—",
    "Cód. SAP": item.miroNumber || "—",
    Motivo: [rotuloDoMotivo(item.backlogReasonCode), item.backlogReason].filter(Boolean).join(" — "),
    // Os comentários vão numa célula só, cada um com quem escreveu e quando,
    // separados por " | " para a planilha não quebrar a linha.
    Comentários: item.comments.map(nota => `[${formatReportDate(nota.createdAt)}] ${nota.authorName || "Colaborador"}: ${nota.body.replace(/\s+/g, " ").trim()}`).join(" | "),
  }));
}

export const COLUNAS_DO_BACKLOG = Object.keys(
  toBacklogReportRows([{
    id: 0, createdAt: new Date(0), enteredBacklogAt: null, leftBacklogAt: null, status: "backlog",
    invoiceNumber: null, invoiceSupplierName: null, supplierName: null, supplierCnpj: null,
    miroNumber: null, backlogReasonCode: null, backlogReason: null, comments: [],
  }])[0],
);
