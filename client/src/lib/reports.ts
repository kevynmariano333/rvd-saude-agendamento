import { type PortalStatus, statusCopy } from "./portal";

export type ReportAppointment = {
  id: number;
  invoiceNumber: string | null;
  supplierName: string | null;
  invoiceSupplierName: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  serviceType: string;
  status: PortalStatus;
  scheduledFor: Date | string;
  receivedAt: Date | string | null;
  invoiceTotalCents: number | null;
};

export type ReportFilters = {
  scheduledStart?: string;
  scheduledEnd?: string;
  receivedStart?: string;
  receivedEnd?: string;
  status?: Exclude<PortalStatus, "backlog"> | "all";
  supplier?: string;
  recipientCnpj?: string;
  invoiceValueMin?: string;
  invoiceValueMax?: string;
};

export type ConsolidatedReportRow = {
  "Nota fiscal": string;
  Fornecedor: string;
  "CNPJ destinatário": string;
  Pedido: string;
  Status: string;
  "Valor total da NF": string;
  "Data de agendamento": string;
  "Data de recebimento": string;
  "Item recebido": string;
};

function isWithinDateRange(value: Date | string | null, start?: string, end?: string) {
  if (!start && !end) return true;
  if (!value) return false;
  const date = new Date(value);
  if (start && date < new Date(`${start}T00:00:00`)) return false;
  if (end && date > new Date(`${end}T23:59:59.999`)) return false;
  return true;
}

function normalize(value: string) {
  return value.replace(/\D/g, "");
}

export function parseReportCurrencyToCents(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const withoutCurrency = trimmed.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = withoutCurrency.includes(",")
    ? withoutCurrency.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(withoutCurrency)
      ? withoutCurrency.replace(/\./g, "")
      : withoutCurrency;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

export function getReportInvoiceValueRangeError(minimum?: string, maximum?: string) {
  const minCents = parseReportCurrencyToCents(minimum);
  const maxCents = parseReportCurrencyToCents(maximum);
  if (minCents === null || maxCents === null) return "Informe valores monetários válidos.";
  if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) return "O valor mínimo não pode ser maior que o valor máximo.";
  return null;
}

function isWithinValueRange(value: number | null, minimum?: string, maximum?: string) {
  const minCents = parseReportCurrencyToCents(minimum);
  const maxCents = parseReportCurrencyToCents(maximum);
  if (minCents === undefined && maxCents === undefined) return true;
  if (minCents === null || maxCents === null || (minCents !== undefined && maxCents !== undefined && minCents > maxCents)) return false;
  if (value === null) return false;
  if (minCents !== undefined && value < minCents) return false;
  if (maxCents !== undefined && value > maxCents) return false;
  return true;
}

export function filterReportAppointments(appointments: ReportAppointment[], filters: ReportFilters) {
  const supplier = filters.supplier?.trim().toLocaleLowerCase();
  const recipientCnpj = filters.recipientCnpj ? normalize(filters.recipientCnpj) : "";
  return appointments.filter(item => {
    if (item.status === "backlog") return false;
    if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
    if (!isWithinDateRange(item.scheduledFor, filters.scheduledStart, filters.scheduledEnd)) return false;
    if (!isWithinDateRange(item.receivedAt, filters.receivedStart, filters.receivedEnd)) return false;
    if (!isWithinValueRange(item.invoiceTotalCents, filters.invoiceValueMin, filters.invoiceValueMax)) return false;
    const supplierName = `${item.invoiceSupplierName || ""} ${item.supplierName || ""}`.toLocaleLowerCase();
    if (supplier && !supplierName.includes(supplier)) return false;
    if (recipientCnpj && !normalize(item.recipientCnpj || "").includes(recipientCnpj)) return false;
    return true;
  });
}

export function formatReportDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function formatReportCurrency(value: number | null) {
  return value === null ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

export function toConsolidatedReportRows(appointments: ReportAppointment[]): ConsolidatedReportRow[] {
  return appointments.map(item => ({
    "Nota fiscal": item.invoiceNumber || "—",
    Fornecedor: item.invoiceSupplierName || item.supplierName || "—",
    "CNPJ destinatário": item.recipientCnpj || "—",
    Pedido: item.purchaseOrder || "—",
    Status: statusCopy[item.status],
    "Valor total da NF": formatReportCurrency(item.invoiceTotalCents),
    "Data de agendamento": formatReportDate(item.scheduledFor),
    "Data de recebimento": formatReportDate(item.receivedAt),
    "Item recebido": item.status === "received" || item.status === "completed" ? item.serviceType : "Aguardando recebimento",
  }));
}
