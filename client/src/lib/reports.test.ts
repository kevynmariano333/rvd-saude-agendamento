import { describe, expect, it } from "vitest";
import { filterReportAppointments, toConsolidatedReportRows, type ReportAppointment } from "./reports";

const appointments: ReportAppointment[] = [
  { id: 1, invoiceNumber: "100", supplierName: "Fornecedor RVD", invoiceSupplierName: null, recipientCnpj: "12345678000190", purchaseOrder: "PO-1", serviceType: "Caixa hospitalar", status: "received", scheduledFor: "2026-08-10T10:00:00.000Z", receivedAt: "2026-08-10T11:00:00.000Z" },
  { id: 2, invoiceNumber: "200", supplierName: "Outro fornecedor", invoiceSupplierName: null, recipientCnpj: "99887766000100", purchaseOrder: null, serviceType: "Material clínico", status: "pending", scheduledFor: "2026-08-12T10:00:00.000Z", receivedAt: null },
  { id: 3, invoiceNumber: "300", supplierName: "Backlog oculto", invoiceSupplierName: null, recipientCnpj: null, purchaseOrder: null, serviceType: "Item legado", status: "backlog", scheduledFor: "2026-08-12T10:00:00.000Z", receivedAt: null },
];

describe("consolidado de relatórios", () => {
  it("oculta backlog e aplica filtros de fornecedor, CNPJ e período", () => {
    const rows = filterReportAppointments(appointments, { scheduledStart: "2026-08-09", scheduledEnd: "2026-08-11", supplier: "rvd", recipientCnpj: "12.345.678" });
    expect(rows.map(row => row.id)).toEqual([1]);
  });

  it("inclui datas e item recebido na linha exportável", () => {
    const [received, pending] = toConsolidatedReportRows(filterReportAppointments(appointments, {}));
    expect(received?.["Nota fiscal"]).toBe("100");
    expect(received?.["Item recebido"]).toBe("Caixa hospitalar");
    expect(pending?.["Data de recebimento"]).toBe("—");
    expect(pending?.["Item recebido"]).toBe("Aguardando recebimento");
  });
});
