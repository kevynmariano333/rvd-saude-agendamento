import { describe, expect, it } from "vitest";
import { filterReportAppointments, reportColumns, toConsolidatedReportRows, toDetailedReportRows, type ReportAppointment } from "./reports";

const nota = (extra: Partial<ReportAppointment>): ReportAppointment => ({
  id: 1, invoiceNumber: "100", supplierName: "Fornecedor RVD", invoiceSupplierName: null,
  supplierCnpj: "11222333000181", recipientCnpj: "06033403000113", purchaseOrder: "PO-1",
  miroNumber: null, invoiceVolumeCount: null, invoiceTotalCents: null,
  serviceType: "Caixa hospitalar", status: "received",
  scheduledFor: "2026-08-10T10:00:00.000Z", receivedAt: "2026-08-10T11:00:00.000Z", ...extra,
});

const appointments: ReportAppointment[] = [
  nota({ id: 1, miroNumber: "5105101642", invoiceVolumeCount: 8, invoiceTotalCents: 1248000 }),
  nota({ id: 2, invoiceNumber: "200", supplierName: "Outro fornecedor", supplierCnpj: "99887766000155", recipientCnpj: "43293604002120", purchaseOrder: null, status: "pending", scheduledFor: "2026-08-12T10:00:00.000Z", receivedAt: null }),
  nota({ id: 3, invoiceNumber: "300", supplierName: "Backlog oculto", supplierCnpj: null, recipientCnpj: null, purchaseOrder: null, status: "backlog", scheduledFor: "2026-08-12T10:00:00.000Z", receivedAt: null }),
];

describe("consolidado de relatórios", () => {
  it("oculta backlog e aplica filtros de fornecedor e período", () => {
    const linhas = filterReportAppointments(appointments, { scheduledStart: "2026-08-09", scheduledEnd: "2026-08-11", supplier: "rvd" });
    expect(linhas.map(item => item.id)).toEqual([1]);
    expect(filterReportAppointments(appointments, {}).map(item => item.id)).toEqual([1, 2]);
  });

  it("encontra pelo CNPJ do fornecedor, que é o que o campo promete", () => {
    // O campo diz "nome ou CNPJ"; antes só o nome encontrava a nota.
    expect(filterReportAppointments(appointments, { supplier: "11222333000181" }).map(item => item.id)).toEqual([1]);
    expect(filterReportAppointments(appointments, { supplier: "11.222.333/0001-81" }).map(item => item.id)).toEqual([1]);
    expect(filterReportAppointments(appointments, { supplier: "99887766" }).map(item => item.id)).toEqual([2]);
  });

  it("filtra o destinatário pela sigla da unidade, como na tela de agendamentos", () => {
    expect(filterReportAppointments(appointments, { recipientCnpj: "HSH" }).map(item => item.id)).toEqual([1]);
    expect(filterReportAppointments(appointments, { recipientCnpj: "MSH" }).map(item => item.id)).toEqual([2]);
    expect(filterReportAppointments(appointments, { recipientCnpj: "06.033" }).map(item => item.id)).toEqual([1]);
  });

  it("nomeia a unidade e carrega o MIRO na linha consolidada", () => {
    const [primeira] = toConsolidatedReportRows([appointments[0]]);
    expect(primeira.Unidade).toBe("HSH — Hospital");
    expect(primeira["Número MIRO"]).toBe("5105101642");
    expect(primeira["Item recebido"]).toBe("Caixa hospitalar");
  });

  it("não inventa valor para a nota que ainda não foi lançada", () => {
    const [segunda] = toConsolidatedReportRows([appointments[1]]);
    expect(segunda["Número MIRO"]).toBe("—");
    expect(segunda["Item recebido"]).toBe("Aguardando recebimento");
  });

  it("o detalhado acrescenta CNPJs, volumes e valor", () => {
    const [linha] = toDetailedReportRows([appointments[0]]);
    expect(linha["CNPJ fornecedor"]).toBe("11.222.333/0001-81");
    expect(linha["CNPJ destinatário"]).toBe("06.033.403/0001-13");
    expect(linha.Volumes).toBe("8");
    expect(linha["Valor total"]).toContain("12.480,00");
  });

  it("as colunas da tela são exatamente as que vão para o Excel", () => {
    // Foi por duas listas de colunas separadas que o MIRO saiu na exportação
    // sem nunca aparecer na tela.
    expect(reportColumns("consolidated")).toEqual(Object.keys(toConsolidatedReportRows([appointments[0]])[0]));
    expect(reportColumns("detailed")).toEqual(Object.keys(toDetailedReportRows([appointments[0]])[0]));
    expect(reportColumns("detailed").length).toBeGreaterThan(reportColumns("consolidated").length);
  });
});
