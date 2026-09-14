import type { AppointmentStatus } from "../drizzle/schema";

export type DashboardAppointment = {
  status: AppointmentStatus;
  scheduledFor: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
  supplierName: string | null;
  invoiceSupplierName: string | null;
  invoiceTotalCents: number | null;
};

export type DashboardPeriod = {
  month: number;
  year: number;
  /** Um dia do mês, quando o painel olha para uma data só. */
  day?: number | null;
  now?: Date;
};

/** Os rótulos do gráfico por mês, curtos porque são doze numa linha só. */
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function isWithinPeriod(date: Date | null, start: Date, end: Date) {
  return Boolean(date && date >= start && date < end);
}

function supplierLabel(item: DashboardAppointment) {
  return item.supplierName?.trim() || item.invoiceSupplierName?.trim() || "Fornecedor não informado";
}

export function buildDashboardMetrics(items: DashboardAppointment[], period: DashboardPeriod) {
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  // Um dia que não existe no mês escolhido — 31 em setembro, 30 em fevereiro —
  // não pode virar um período vazio: aí o painel mostra o mês inteiro.
  const day = period.day && period.day >= 1 && period.day <= daysInMonth ? period.day : null;
  const start = day ? new Date(period.year, period.month - 1, day) : new Date(period.year, period.month - 1, 1);
  const end = day ? new Date(period.year, period.month - 1, day + 1) : new Date(period.year, period.month, 1);
  const now = period.now ?? new Date();
  const dailyReceived = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    label: `${String(index + 1).padStart(2, "0")}/${String(period.month).padStart(2, "0")}`,
    total: 0,
  }));
  const monthlyReceived = MONTH_LABELS.map((label, index) => ({ month: index + 1, label, total: 0 }));
  const receivedBySupplier = new Map<string, number>();
  const pending = items.filter(item => item.status === "pending");
  const scheduled = items.filter(item => item.status === "scheduled" && isWithinPeriod(item.scheduledFor, start, end));
  const scheduledCount = scheduled.length;
  const received = items.filter(item => isWithinPeriod(item.receivedAt, start, end));

  const monthStart = new Date(period.year, period.month - 1, 1);
  const monthEnd = new Date(period.year, period.month, 1);
  const yearStart = new Date(period.year, 0, 1);
  const yearEnd = new Date(period.year + 1, 0, 1);
  items.forEach(item => {
    const receivedAt = item.receivedAt;
    if (!receivedAt) return;
    if (isWithinPeriod(receivedAt, monthStart, monthEnd)) {
      dailyReceived[receivedAt.getDate() - 1]!.total += 1;
    }
    // A leitura por mês é do ano inteiro: é ela que mostra o ano tomando forma.
    if (isWithinPeriod(receivedAt, yearStart, yearEnd)) {
      monthlyReceived[receivedAt.getMonth()]!.total += 1;
    }
  });

  received.forEach(item => {
    const supplier = supplierLabel(item);
    receivedBySupplier.set(supplier, (receivedBySupplier.get(supplier) ?? 0) + 1);
  });

  const waitMinutes = pending.reduce((total, item) => total + Math.max(0, Math.floor((now.getTime() - item.createdAt.getTime()) / 60_000)), 0);
  const averageWaitMinutes = pending.length ? Math.round(waitMinutes / pending.length) : 0;

  return {
    period: { month: period.month, year: period.year, day },
    pendingCount: pending.length,
    scheduledCount,
    receivedCount: received.length,
    pendingTotalCents: pending.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    scheduledTotalCents: scheduled.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    receivedTotalCents: received.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    dailyReceived,
    monthlyReceived,
    topSuppliers: Array.from(receivedBySupplier, ([name, notesReceived]) => ({ name, notesReceived }))
      .sort((a, b) => b.notesReceived - a.notesReceived || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 5),
    averageWaitMinutes,
    pendingBasis: pending.length,
  };
}
