import { type PortalStatus, statusCopy } from "./portal";

export type ReportAppointment = {
  id: number;
  invoiceNumber: string | null;
  supplierName: string | null;
  invoiceSupplierName: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  miroNumber: string | null;
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
  "CNPJ destinatário": string;
  Pedido: string;
  "Número MIRO": string;
  Status: string;
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

export function filterReportAppointments(appointments: ReportAppointment[], filters: ReportFilters) {
  const supplier = filters.supplier?.trim().toLocaleLowerCase();
  const recipientCnpj = filters.recipientCnpj ? normalize(filters.recipientCnpj) : "";
  return appointments.filter(item => {
    if (item.status === "backlog") return false;
    if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
    if (!isWithinDateRange(item.scheduledFor, filters.scheduledStart, filters.scheduledEnd)) return false;
    if (!isWithinDateRange(item.receivedAt, filters.receivedStart, filters.receivedEnd)) return false;
    const supplierName = `${item.invoiceSupplierName || ""} ${item.supplierName || ""}`.toLocaleLowerCase();
    if (supplier && !supplierName.includes(supplier)) return false;
    if (recipientCnpj && !normalize(item.recipientCnpj || "").includes(recipientCnpj)) return false;
    return true;
  });
}

export function formatReportDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function toConsolidatedReportRows(appointments: ReportAppointment[]): ConsolidatedReportRow[] {
  return appointments.map(item => ({
    "Nota fiscal": item.invoiceNumber || "—",
    Fornecedor: item.invoiceSupplierName || item.supplierName || "—",
    "CNPJ destinatário": item.recipientCnpj || "—",
    Pedido: item.purchaseOrder || "—",
    // O MIRO é a chave para cruzar este relatório com o SAP; sem ele a
    // conferência volta a ser nota por nota, na mão.
    "Número MIRO": item.miroNumber || "—",
    Status: statusCopy[item.status],
    "Data de agendamento": formatReportDate(item.scheduledFor),
    "Data de recebimento": formatReportDate(item.receivedAt),
    "Item recebido": item.status === "received" || item.status === "completed" ? item.serviceType : "Aguardando recebimento",
  }));
}
