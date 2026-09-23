import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { CABECALHO_DO_SAP, cnpjDoCentro, dataDoSerial, lerPedidosDoSap, separarFornecedor } from "./pedidosSap";

/** Uma planilha com o cabeçalho real do SAP e as linhas que o teste precisa. */
function planilha(linhas: unknown[][]) {
  const cabecalho = [
    ...CABECALHO_DO_SAP,
    "Ctg.ClassCont.", "Ãinda a faturar (quantidade)", "Preço líquido", "Qtd.pedido", "UM pedido",
    "Unidade manutenção estoque", "Unidade preço", "a ser fornecida (quantidade)", "a ser fornecido (valor",
    "Unid.prç.pedido", "Código de eliminação", "Contrato básico", "It.contrato superior", "Código de liberação",
    "Valor líquido pedido", "Incompleto", "Empresa", "Fator Conversão",
  ];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]), "Data");
  return XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Uma linha como o SAP exporta: as dez primeiras colunas mais as de número. */
function linha(extra: Partial<Record<string, unknown>> = {}) {
  const base = ["", "4504858004", "10", "ZESZ", "1273", "F", 46273, "100002574  CBS MEDICO CIENTIFICA LTDA", "2000006838", "ABSORVENTE GRAN CAN CAL SODADA BBA",
    "K", 0, 151.61, 6, "GLA", "UN", 1, 6, 909.66, "GLA", "", "4600044670", "3740", "", 909.66, "", "B1R0", 1];
  for (const [posicao, valor] of Object.entries(extra)) base[Number(posicao)] = valor;
  return base;
}

describe("relatório de pedidos do SAP", () => {
  it("lê a linha inteira, do material ao saldo", () => {
    const { itens, recusas } = lerPedidosDoSap(planilha([linha()]));
    expect(recusas).toEqual([]);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      purchaseOrder: "4504858004",
      item: "10",
      sapCode: "2000006838",
      description: "ABSORVENTE GRAN CAN CAL SODADA BBA",
      supplierCode: "100002574",
      supplierName: "CBS MEDICO CIENTIFICA LTDA",
      orderedQuantity: "6.000",
      pendingQuantity: "6.000",
      unitPriceCents: 15161,
      totalCents: 90966,
    });
  });

  it("traduz o centro do SAP para a unidade que recebe", () => {
    // É o que permite avisar quando a nota foi agendada para a unidade errada.
    expect(cnpjDoCentro("1273")).toBe("43293604002120");
    expect(cnpjDoCentro("1235")).toBe("06033403000113");
    // Centro desconhecido não vira chute: a conferência só vale se estiver certa.
    expect(cnpjDoCentro("9999")).toBeNull();
    expect(cnpjDoCentro("")).toBeNull();
  });

  it("a data vem do calendário do Excel, que começa em 30/12/1899", () => {
    // Com o 01/01/1900 que parece certo, o relatório inteiro andaria dois dias.
    expect(dataDoSerial(46273)?.toISOString().slice(0, 10)).toBe("2026-09-08");
    expect(dataDoSerial(0)).toBeNull();
    expect(dataDoSerial("")).toBeNull();
  });

  it("separa o código do fornecedor do nome dele", () => {
    expect(separarFornecedor("100002574  CBS MEDICO CIENTIFICA LTDA")).toEqual({ codigo: "100002574", nome: "CBS MEDICO CIENTIFICA LTDA" });
    expect(separarFornecedor("SEM CODIGO LTDA")).toEqual({ codigo: null, nome: "SEM CODIGO LTDA" });
    expect(separarFornecedor("")).toEqual({ codigo: null, nome: null });
  });

  it("recusa a linha sem pedido ou sem item, em vez de gravar meia linha", () => {
    const { itens, recusas } = lerPedidosDoSap(planilha([linha({ 1: "" }), linha({ 2: "" })]));
    expect(itens).toHaveLength(0);
    expect(recusas).toHaveLength(2);
  });

  it("um par pedido+item repetido no arquivo entra uma vez só", () => {
    const { itens, recusas } = lerPedidosDoSap(planilha([linha(), linha()]));
    expect(itens).toHaveLength(1);
    expect(recusas[0].motivo).toContain("repetido");
  });

  it("o mesmo pedido com itens diferentes são linhas diferentes", () => {
    // Um pedido cobre vários materiais: é por isso que a chave é pedido + item.
    const { itens } = lerPedidosDoSap(planilha([linha(), linha({ 2: "20", 8: "2000039104" })]));
    expect(itens.map(item => `${item.purchaseOrder}|${item.item}`)).toEqual(["4504858004|10", "4504858004|20"]);
  });

  it("recusa um arquivo que não é o relatório do SAP", () => {
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet([["Nome", "Valor"], ["x", 1]]), "Data");
    const outro = XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => lerPedidosDoSap(outro)).toThrow(/não parece o relatório de pedidos do SAP/);
  });

  it("lê pelo nome da coluna, não pela posição", () => {
    // O SAP acrescenta coluna com o tempo; pela posição, material viraria preço.
    const cabecalho = ["Coluna nova", ...CABECALHO_DO_SAP, "Preço líquido", "Qtd.pedido", "a ser fornecida (quantidade)", "Valor líquido pedido"];
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet([
      cabecalho,
      ["nova", "", "4504858004", "10", "ZESZ", "1235", "F", 46273, "100002574  CBS", "2000006838", "DESCRICAO", 151.61, 6, 6, 909.66],
    ]), "Data");
    const { itens } = lerPedidosDoSap(XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer);
    expect(itens[0]).toMatchObject({ sapCode: "2000006838", unitPriceCents: 15161, recipientCnpj: "06033403000113" });
  });
});
