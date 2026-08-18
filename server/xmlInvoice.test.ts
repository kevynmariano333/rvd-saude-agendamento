import { describe, expect, it } from "vitest";
import { MAX_XML_BYTES, parseInvoiceXml } from "./xmlInvoice";

describe("leitura de XML de nota fiscal", () => {
  it("extrai os dados disponíveis de uma NF-e sem exigir campos manuais", () => {
    const xml = Buffer.from(`<?xml version="1.0"?><NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>000001</nNF><dhEmi>2030-08-22T15:00:00-03:00</dhEmi></ide><emit><xNome>Fornecedor Saúde</xNome></emit><dest><CNPJ>12.345.678/0001-99</CNPJ></dest><det><prod><xProd>Consulta ocupacional</xProd><xPed>4504748409</xPed></prod></det></infNFe></NFe>`);
    expect(parseInvoiceXml(xml)).toMatchObject({ invoiceNumber: "000001", accessKey: "35260112345678901234550010000000011000000010", serviceDescription: "Consulta ocupacional", supplierName: "Fornecedor Saúde", recipientCnpj: "12345678000199", purchaseOrder: "4504748409" });
  });

  it("recusa estruturas XML que podem expandir entidades externas", () => {
    expect(() => parseInvoiceXml(Buffer.from(`<!DOCTYPE note [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><note>&xxe;</note>`))).toThrow("XML de nota válido");
  });

  it("recusa arquivos acima do limite aceito", () => {
    expect(() => parseInvoiceXml(Buffer.alloc(MAX_XML_BYTES + 1, "a"))).toThrow("até 2 MB");
  });
});
