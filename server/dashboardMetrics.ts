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
  now?: Date;
};

function isWithinPeriod(date: Date | null, start: Date, end: Date) {
  return Boolean(date && date >= start && date < end);
}

function supplierLabel(item: DashboardAppointment) {
  return item.supplierName?.trim() || item.invoiceSupplierName?.trim() || "Fornecedor não informado";
}

export function buildDashboardMetrics(items: DashboardAppointment[], period: DashboardPeriod) {
  const start = new Date(period.year, period.month - 1, 1);
  const end = new Date(period.year, period.month, 1);
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const now = period.now ?? new Date();
  const dailyReceived = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    label: `${String(index + 1).padStart(2, "0")}/${String(period.month).padStart(2, "0")}`,
    total: 0,
    totalCents: 0,
  }));
  const receivedBySupplier = new Map<string, number>();
  const pending = items.filter(item => item.status === "pending");
  const scheduled = items.filter(item => item.status === "scheduled" && isWithinPeriod(item.scheduledFor, start, end));
  const scheduledCount = scheduled.length;
  const received = items.filter(item => isWithinPeriod(item.receivedAt, start, end));

  received.forEach(item => {
    const receivedAt = item.receivedAt;
    if (!receivedAt) return;
    dailyReceived[receivedAt.getDate() - 1]!.total += 1;
    dailyReceived[receivedAt.getDate() - 1]!.totalCents += item.invoiceTotalCents ?? 0;
    const supplier = supplierLabel(item);
    receivedBySupplier.set(supplier, (receivedBySupplier.get(supplier) ?? 0) + 1);
  });

  const waitMinutes = pending.reduce((total, item) => total + Math.max(0, Math.floor((now.getTime() - item.createdAt.getTime()) / 60_000)), 0);
  const averageWaitMinutes = pending.length ? Math.round(waitMinutes / pending.length) : 0;

  return {
    period: { month: period.month, year: period.year },
    pendingCount: pending.length,
    scheduledCount,
    receivedCount: received.length,
    pendingTotalCents: pending.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    scheduledTotalCents: scheduled.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    receivedTotalCents: received.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    dailyReceived,
    topSuppliers: Array.from(receivedBySupplier, ([name, notesReceived]) => ({ name, notesReceived }))
      .sort((a, b) => b.notesReceived - a.notesReceived || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 5),
    averageWaitMinutes,
    pendingBasis: pending.length,
  };
}
