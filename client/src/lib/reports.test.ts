import { describe, expect, it } from "vitest";
import { COLUNAS_DO_BACKLOG, cnpjDoRemetente, filterBacklogReport, filterReportAppointments, reportColumns, toBacklogReportRows, toConsolidatedReportRows, toDetailedReportRows, type BacklogReportAppointment, type ReportAppointment } from "./reports";

const nota = (extra: Partial<ReportAppointment>): ReportAppointment => ({
  id: 1, invoiceNumber: "100", supplierName: "Fornecedor RVD", invoiceSupplierName: null,
  invoiceSupplierCnpj: "11222333000181", supplierCnpj: null, recipientCnpj: "06033403000113", purchaseOrder: "PO-1",
  miroNumber: null, invoiceVolumeCount: null, invoiceTotalCents: null,
  serviceType: "Caixa hospitalar", status: "received",
  scheduledFor: "2026-08-10T10:00:00.000Z", receivedAt: "2026-08-10T11:00:00.000Z", ...extra,
});

const appointments: ReportAppointment[] = [
  nota({ id: 1, miroNumber: "5105101642", invoiceVolumeCount: 8, invoiceTotalCents: 1248000 }),
  nota({ id: 2, invoiceNumber: "200", supplierName: "Outro fornecedor", invoiceSupplierCnpj: "99887766000155", supplierCnpj: null, recipientCnpj: "43293604002120", purchaseOrder: null, status: "pending", scheduledFor: "2026-08-12T10:00:00.000Z", receivedAt: null }),
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

const noBacklog = (extra: Partial<BacklogReportAppointment>): BacklogReportAppointment => ({
  id: 1, createdAt: "2026-09-01T10:00:00.000Z", enteredBacklogAt: "2026-09-08T13:15:00.000Z",
  leftBacklogAt: null, status: "backlog", invoiceNumber: "324055", invoiceSupplierName: "Onco Prod Distr",
  supplierName: "Onco Prod", supplierCnpj: "04307650003070", loginCnpj: null, miroNumber: null,
  backlogReasonCode: "DIVERGENCIA_PRECO", backlogReason: "Preço da nota acima do pedido.",
  comments: [], ...extra,
});

describe("relatório de backlog", () => {
  it("monta as dez colunas do arquivo", () => {
    const [linha] = toBacklogReportRows([noBacklog({
      leftBacklogAt: "2026-09-10T16:00:00.000Z", status: "completed", miroNumber: "5105101642",
      comments: [{ authorName: "Robert", body: "Realizado  entrada de\nmovimento 0244599", createdAt: "2026-09-08T20:53:00.000Z" }],
    })]);
    expect(Object.keys(linha)).toEqual(COLUNAS_DO_BACKLOG);
    expect(linha["Número da Nota"]).toBe("324055");
    expect(linha["CNPJ Fornecedor"]).toBe("04.307.650/0030-70");
    expect(linha["Cód. SAP"]).toBe("5105101642");
    expect(linha.Motivo).toBe("Divergência de preço — Preço da nota acima do pedido.");
    // Quebra de linha e espaço duplo estouram a célula da planilha.
    expect(linha.Comentários).toContain("Robert: Realizado entrada de movimento 0244599");
    expect(linha.Comentários).not.toContain("\n");
  });

  it("diz que a nota ainda está lá em vez de deixar a saída vazia", () => {
    const [linha] = toBacklogReportRows([noBacklog({})]);
    expect(linha["Saiu do Backlog"]).toBe("Em aberto");
  });

  it("filtra pelo período em que a nota entrou no backlog, não pelo agendamento", () => {
    const linhas = [noBacklog({ id: 1 }), noBacklog({ id: 2, enteredBacklogAt: "2026-08-02T10:00:00.000Z" })];
    expect(filterBacklogReport(linhas, { scheduledStart: "2026-09-01", scheduledEnd: "2026-09-30" }).map(l => l.id)).toEqual([1]);
  });

  it("acha pelo nome e pelo CNPJ do fornecedor", () => {
    const linhas = [noBacklog({ id: 1 }), noBacklog({ id: 2, invoiceSupplierName: "Outra", supplierName: "Outra", supplierCnpj: "99887766000155", loginCnpj: null })];
    expect(filterBacklogReport(linhas, { supplier: "onco" }).map(l => l.id)).toEqual([1]);
    expect(filterBacklogReport(linhas, { supplier: "99887766" }).map(l => l.id)).toEqual([2]);
  });
});

describe("CNPJ do remetente no relatório", () => {
  it("prefere o CNPJ do XML ao do login", () => {
    expect(cnpjDoRemetente({ invoiceSupplierCnpj: "98765432000155", supplierCnpj: "11222333000181" })).toBe("98765432000155");
  });

  it("cai no do login quando a nota não trouxe emitente", () => {
    expect(cnpjDoRemetente({ invoiceSupplierCnpj: null, supplierCnpj: "11222333000181" })).toBe("11222333000181");
  });

  it("ignora o CNPJ zerado das contas de teste", () => {
    // Era ele que aparecia como 00.000.000/0000-00 no relatório.
    expect(cnpjDoRemetente({ invoiceSupplierCnpj: null, supplierCnpj: "00000000000000" })).toBeNull();
    expect(cnpjDoRemetente({ invoiceSupplierCnpj: "00000000000000", supplierCnpj: "11222333000181" })).toBe("11222333000181");
  });
});

describe("motivo do backlog no relatório", () => {
  it("não repete o rótulo que ficou gravado na descrição das notas antigas", () => {
    const [linha] = toBacklogReportRows([noBacklog({ backlogReason: "Divergência de preço: valor acima do pedido." })]);
    expect(linha.Motivo).toBe("Divergência de preço — valor acima do pedido.");
  });

  it("junta rótulo e descrição das notas novas", () => {
    const [linha] = toBacklogReportRows([noBacklog({ backlogReason: "Valor acima do pedido." })]);
    expect(linha.Motivo).toBe("Divergência de preço — Valor acima do pedido.");
  });
});
