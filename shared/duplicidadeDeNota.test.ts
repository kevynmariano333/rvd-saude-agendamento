import { describe, expect, it } from "vitest";
import { chaveDeDuplicidade, numeroComparavel } from "./duplicidadeDeNota";

const CHAVE = "35240912345678000199550010000012341000012345";

describe("o número da nota, comparável entre fornecedores", () => {
  it("ignora os zeros da frente", () => {
    expect(numeroComparavel("000123")).toBe("123");
    expect(numeroComparavel("123")).toBe("123");
  });

  it("ignora pontuação que alguns sistemas colocam", () => {
    expect(numeroComparavel("1.234")).toBe("1234");
  });

  it("devolve vazio quando não há número nenhum", () => {
    expect(numeroComparavel(null)).toBe("");
    expect(numeroComparavel("   ")).toBe("");
    expect(numeroComparavel("000")).toBe("");
  });
});

describe("por qual critério procurar a nota", () => {
  it("usa a chave de acesso quando ela veio completa", () => {
    expect(chaveDeDuplicidade({ accessKey: CHAVE, supplierCnpj: "12345678000199", invoiceNumber: "123" })).toEqual({
      tipo: "chaveDeAcesso",
      chave: CHAVE,
    });
  });

  it("aceita a chave escrita com espaços", () => {
    const comEspacos = CHAVE.replace(/(.{4})/g, "$1 ");
    expect(chaveDeDuplicidade({ accessKey: comEspacos })).toEqual({ tipo: "chaveDeAcesso", chave: CHAVE });
  });

  it("cai para CNPJ e número quando a chave não veio", () => {
    // É o caso das notas do acervo antigo, que não trouxeram chave nenhuma.
    expect(chaveDeDuplicidade({ accessKey: null, supplierCnpj: "12.345.678/0001-99", invoiceNumber: "000123" })).toEqual({
      tipo: "fornecedorENumero",
      cnpj: "12345678000199",
      numero: "123",
    });
  });

  it("ignora chave incompleta em vez de tratá-la como identidade", () => {
    // Chave pela metade identificaria notas diferentes como a mesma.
    expect(chaveDeDuplicidade({ accessKey: "3524091234", supplierCnpj: "12345678000199", invoiceNumber: "123" })).toEqual({
      tipo: "fornecedorENumero",
      cnpj: "12345678000199",
      numero: "123",
    });
  });

  it("não reconhece a nota quando falta tudo", () => {
    expect(chaveDeDuplicidade({ accessKey: null, supplierCnpj: null, invoiceNumber: null })).toBeNull();
    expect(chaveDeDuplicidade({ accessKey: "", supplierCnpj: "12345678000199", invoiceNumber: "" })).toBeNull();
    expect(chaveDeDuplicidade({ accessKey: "", supplierCnpj: "", invoiceNumber: "123" })).toBeNull();
  });
});
