import { describe, expect, it } from "vitest";
import { buildDashboardMetrics } from "./dashboardMetrics";

describe("buildDashboardMetrics", () => {
  it("agrupa recebimentos, fornecedores e espera usando o período selecionado", () => {
    const metrics = buildDashboardMetrics([
      { status: "pending", createdAt: new Date("2026-08-10T09:00:00"), scheduledFor: null, receivedAt: null, supplierName: "Clínica Alfa", invoiceSupplierName: null },
      { status: "pending", createdAt: new Date("2026-08-10T10:30:00"), scheduledFor: null, receivedAt: null, supplierName: "Clínica Beta", invoiceSupplierName: null },
      { status: "scheduled", createdAt: new Date("2026-08-01T09:00:00"), scheduledFor: new Date("2026-08-15T09:00:00"), receivedAt: null, supplierName: "Clínica Alfa", invoiceSupplierName: null },
      { status: "received", createdAt: new Date("2026-08-02T09:00:00"), scheduledFor: new Date("2026-08-12T09:00:00"), receivedAt: new Date("2026-08-12T11:00:00"), supplierName: "Clínica Alfa", invoiceSupplierName: null },
      { status: "completed", createdAt: new Date("2026-08-03T09:00:00"), scheduledFor: new Date("2026-08-13T09:00:00"), receivedAt: new Date("2026-08-12T15:00:00"), supplierName: null, invoiceSupplierName: "Distribuidora Beta" },
      { status: "received", createdAt: new Date("2026-07-30T09:00:00"), scheduledFor: new Date("2026-07-31T09:00:00"), receivedAt: new Date("2026-07-31T11:00:00"), supplierName: "Clínica Alfa", invoiceSupplierName: null },
    ], { month: 8, year: 2026, now: new Date("2026-08-10T11:30:00") });

    expect(metrics.pendingCount).toBe(2);
    expect(metrics.scheduledCount).toBe(1);
    expect(metrics.receivedCount).toBe(2);
    expect(metrics.dailyReceived[11]).toMatchObject({ label: "12/08", total: 2 });
    expect(metrics.topSuppliers).toEqual([
      { name: "Clínica Alfa", notesReceived: 1 },
      { name: "Distribuidora Beta", notesReceived: 1 },
    ]);
    expect(metrics.averageWaitMinutes).toBe(105);
    expect(metrics.pendingBasis).toBe(2);
  });
});
