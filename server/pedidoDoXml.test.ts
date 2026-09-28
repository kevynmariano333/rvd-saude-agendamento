import { describe, expect, it } from "vitest";
import { lerPedidosDoXml, parseInvoiceXml } from "./xmlInvoice";

const notaCom = (miolo: string) => `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe35260911222333000144550010001917001000191700">
  <ide><nNF>191700</nNF><dhEmi>2026-09-20T09:00:00-03:00</dhEmi></ide>
  <emit><CNPJ>11222333000144</CNPJ><xNome>FORNECEDOR TESTE LTDA</xNome></emit>
  <dest><CNPJ>06033403000113</CNPJ></dest>
  ${miolo}
  <total><ICMSTot><vNF>1000.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

const item = (xProd: string, xPed?: string) =>
  `<det><prod><xProd>${xProd}</xProd><qCom>1</qCom><vUnCom>10.00</vUnCom><vProd>10.00</vProd>${xPed ? `<xPed>${xPed}</xPed>` : ""}</prod></det>`;

describe("o pedido de compra lido do XML", () => {
  it("lê da tag xPed do item, que é o lugar certo", () => {
    expect(lerPedidosDoXml(notaCom(item("Seringa", "4000249336")))).toBe("4000249336");
  });

  it("junta os pedidos quando a nota cobre mais de um — antes vinha só o primeiro", () => {
    const xml = notaCom(item("Seringa", "4000249336") + item("Luva", "4504886836"));
    expect(lerPedidosDoXml(xml)).toBe("4000249336, 4504886836");
  });

  it("não repete o mesmo pedido que aparece em vários itens", () => {
    const xml = notaCom(item("Seringa", "4000249336") + item("Luva", "4000249336"));
    expect(lerPedidosDoXml(xml)).toBe("4000249336");
  });

  it("acha o pedido escrito nas informações complementares, que é onde ele sai no DANFE", () => {
    const xml = notaCom(item("Seringa") + "<infAdic><infCpl>Pedido de compra: 4000249336. Entrega na doca 2.</infCpl></infAdic>");
    expect(lerPedidosDoXml(xml)).toBe("4000249336");
  });

  it("entende as abreviações que o fornecedor usa", () => {
    const comOc = notaCom(item("Seringa") + "<infAdic><infCpl>OC 4000249336</infCpl></infAdic>");
    expect(lerPedidosDoXml(comOc)).toBe("4000249336");
    const comPed = notaCom(item("Seringa") + "<infAdic><infCpl>Ped. nº 4504886836 - urgente</infCpl></infAdic>");
    expect(lerPedidosDoXml(comPed)).toBe("4504886836");
  });

  it("sem a palavra pedido, aceita o número solto só quando não há dúvida", () => {
    const um = notaCom(item("Seringa") + "<infAdic><infCpl>Referente a 4000249336</infCpl></infAdic>");
    expect(lerPedidosDoXml(um)).toBe("4000249336");
  });

  it("com dois números possíveis e nenhuma palavra, prefere não chutar", () => {
    const dois = notaCom(item("Seringa") + "<infAdic><infCpl>Contrato 4000249336 e 4504886836</infCpl></infAdic>");
    expect(lerPedidosDoXml(dois)).toBeNull();
  });

  it("não confunde nota fiscal, chave ou valor com pedido", () => {
    const xml = notaCom(item("Seringa") + "<infAdic><infCpl>NF 191700 emitida em 20/09/2026, valor 1.000,00</infCpl></infAdic>");
    expect(lerPedidosDoXml(xml)).toBeNull();
  });

  it("a nota sem pedido nenhum continua sem pedido, e não com um inventado", () => {
    expect(lerPedidosDoXml(notaCom(item("Seringa")))).toBeNull();
  });
});

describe("a leitura completa da nota", () => {
  it("entrega o pedido junto do resto, para a nota entrar com ele", () => {
    const xml = notaCom(item("Seringa") + "<infAdic><infCpl>Pedido 4000249336</infCpl></infAdic>");
    const nota = parseInvoiceXml(Buffer.from(xml, "utf8"));
    expect(nota.invoiceNumber).toBe("191700");
    expect(nota.purchaseOrder).toBe("4000249336");
  });
});
