import { describe, expect, it } from "vitest";
import { COLUNAS_DO_BACKLOG, cnpjDoRemetente, filterBacklogReport, reportColumns, toBacklogReportRows, toConsolidatedReportRows, toDetailedReportRows, type BacklogReportAppointment, type ReportAppointment } from "./reports";

const nota = (extra: Partial<ReportAppointment>): ReportAppointment => ({
  id: 1, invoiceNumber: "100", supplierName: "Fornecedor RVD", invoiceSupplierName: null,
  invoiceSupplierCnpj: "11222333000181", supplierCnpj: null, recipientCnpj: "06033403000113", purchaseOrder: "PO-1",
  miroNumber: null, invoiceVolumeCount: null, invoiceTotalCents: null,
  serviceType: "Caixa hospitalar", status: "received",
  scheduledFor: "2026-08-10T10:00:00.000Z", receivedAt: "2026-08-10T11:00:00.000Z",
  createdAt: "2026-08-01T09:00:00.000Z", updatedAt: "2026-08-10T11:05:00.000Z", totalDeLinhas: 3, ...extra,
});

const appointments: ReportAppointment[] = [
  nota({ id: 1, miroNumber: "5105101642", invoiceVolumeCount: 8, invoiceTotalCents: 1248000 }),
  nota({ id: 2, invoiceNumber: "200", supplierName: "Outro fornecedor", invoiceSupplierCnpj: "99887766000155", supplierCnpj: null, recipientCnpj: "43293604002120", purchaseOrder: null, status: "pending", scheduledFor: "2026-08-12T10:00:00.000Z", receivedAt: null }),
  nota({ id: 3, invoiceNumber: "300", supplierName: "Nota em backlog", invoiceSupplierCnpj: "55444333000122", supplierCnpj: null, recipientCnpj: null, purchaseOrder: null, status: "backlog", scheduledFor: "2026-08-12T10:00:00.000Z", receivedAt: null }),
];

describe("consolidado de relatórios", () => {




  it("traz as colunas do relatório de origem, com os nomes de lá", () => {
    // A operação confere com a planilha antiga aberta ao lado: a ordem e os
    // nomes são os mesmos de propósito.
    expect(reportColumns("consolidated")).toEqual([
      "Data de Criação", "Último Status", "Data do Último Status", "Data de Agendamento",
      "Número da Nota", "Número do Pedido", "CNPJ Fornecedor", "Nome Fornecedor",
      "Total de Linhas", "CNPJ Destino", "Descrição Destino",
    ]);
  });

  it("descreve o destino como a planilha de origem escreve", () => {
    const [primeira] = toConsolidatedReportRows([appointments[0]]);
    expect(primeira["Descrição Destino"]).toBe("HSH - HOSPITAL");
    expect(primeira["CNPJ Destino"]).toBe("06.033.403/0001-13");
    expect(primeira["CNPJ Fornecedor"]).toBe("11.222.333/0001-81");
    expect(primeira["Total de Linhas"]).toBe("3");
    expect(primeira["Último Status"]).toBe("Recebido");
  });

  it("uma nota sem destino não ganha nome inventado", () => {
    const [terceira] = toConsolidatedReportRows([appointments[2]]);
    expect(terceira["CNPJ Destino"]).toBe("—");
    expect(terceira["Descrição Destino"]).toBe("—");
  });

  it("o MIRO, os volumes e o valor ficam no detalhado", () => {
    const [linha] = toDetailedReportRows([appointments[0]]);
    expect(linha["Número MIRO"]).toBe("5105101642");
    expect(linha.Volumes).toBe("8");
    expect(linha["Valor total"]).toContain("12.480,00");
    expect(linha["Item recebido"]).toBe("Caixa hospitalar");
  });

  it("não inventa valor para a nota que ainda não foi lançada", () => {
    const [segunda] = toDetailedReportRows([appointments[1]]);
    expect(segunda["Número MIRO"]).toBe("—");
    expect(segunda["Item recebido"]).toBe("Aguardando recebimento");
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
