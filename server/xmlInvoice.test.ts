import { describe, expect, it } from "vitest";
import { empresaDoCnpj } from "../shared/empresas";
import { MAX_XML_BYTES, parseInvoiceXml } from "./xmlInvoice";

describe("leitura de XML de nota fiscal", () => {
  it("extrai os dados disponíveis de uma NF-e sem exigir campos manuais", () => {
    const xml = Buffer.from(`<?xml version="1.0"?><NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>000001</nNF><dhEmi>2030-08-22T15:00:00-03:00</dhEmi></ide><emit><CNPJ>98.765.432/0001-55</CNPJ><xNome>Fornecedor Saúde</xNome></emit><dest><CNPJ>12.345.678/0001-99</CNPJ></dest><det nItem="1"><prod><xProd>Consulta ocupacional</xProd><xPed>4504748409</xPed><qCom>2.0000</qCom><vUnCom>15.50</vUnCom><vProd>31.00</vProd></prod></det><total><ICMSTot><vNF>31.00</vNF></ICMSTot></total><transp><vol><qVol>3</qVol></vol><vol><qVol>2</qVol></vol></transp></infNFe></NFe>`);
    expect(parseInvoiceXml(xml)).toMatchObject({ invoiceNumber: "000001", accessKey: "35260112345678901234550010000000011000000010", serviceDescription: "Consulta ocupacional", supplierName: "Fornecedor Saúde", supplierCnpj: "98765432000155", recipientCnpj: "12345678000199", purchaseOrder: "4504748409", totalCents: 3100, volumeCount: 5, items: [{ description: "Consulta ocupacional", quantity: 2, unitPriceCents: 1550, totalCents: 3100 }] });
  });

  it("recusa estruturas XML que podem expandir entidades externas", () => {
    expect(() => parseInvoiceXml(Buffer.from(`<!DOCTYPE note [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><note>&xxe;</note>`))).toThrow("XML de nota válido");
  });

  it("recusa arquivos acima do limite aceito", () => {
    expect(() => parseInvoiceXml(Buffer.alloc(MAX_XML_BYTES + 1, "a"))).toThrow("até 2 MB");
  });
});

describe("CNPJ do remetente", () => {
  it("lê o emitente, e não o destinatário", () => {
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>1</nNF></ide><emit><CNPJ>98765432000155</CNPJ><xNome>Emitente</xNome></emit><dest><CNPJ>06033403000113</CNPJ></dest></infNFe></NFe>');
    const nota = parseInvoiceXml(xml);
    expect(nota.supplierCnpj).toBe("98765432000155");
    expect(nota.recipientCnpj).toBe("06033403000113");
  });

  it("aceita CPF quando o emitente é pessoa física", () => {
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>1</nNF></ide><emit><CPF>123.456.789-09</CPF><xNome>Emitente</xNome></emit></infNFe></NFe>');
    expect(parseInvoiceXml(xml).supplierCnpj).toBe("12345678909");
  });

  it("devolve nulo quando o XML não traz emitente identificado", () => {
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>1</nNF></ide></infNFe></NFe>');
    expect(parseInvoiceXml(xml).supplierCnpj).toBeNull();
  });
});

describe("a nota cai na empresa do destinatário", () => {
  const nota = (cnpjDest: string) => Buffer.from(`<?xml version="1.0"?><NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>1</nNF></ide><emit><CNPJ>98.765.432/0001-55</CNPJ><xNome>Fornecedor</xNome></emit><dest><CNPJ>${cnpjDest}</CNPJ></dest><det nItem="1"><prod><xProd>Item</xProd><xPed>4504748409</xPed><qCom>1</qCom><vUnCom>1.00</vUnCom><vProd>1.00</vProd></prod></det><total><ICMSTot><vNF>1.00</vNF></ICMSTot></total></infNFe></NFe>`);

  it("a nota com o CNPJ da LLT como destinatário é da LLT", () => {
    // É o caminho de verdade: o XML entra, o destinatário sai dele, e é ele que
    // decide quem enxerga a nota.
    const { recipientCnpj } = parseInvoiceXml(nota("45.295.469/0001-33"));
    expect(recipientCnpj).toBe("45295469000133");
    expect(empresaDoCnpj(recipientCnpj)).toBe("llt");
  });

  it("a da RVD é da RVD, e a do Hospital segue sendo da Amil", () => {
    expect(empresaDoCnpj(parseInvoiceXml(nota("39.283.469/0001-10")).recipientCnpj)).toBe("rvd");
    expect(empresaDoCnpj(parseInvoiceXml(nota("06.033.403/0001-13")).recipientCnpj)).toBe("amil");
  });
});
