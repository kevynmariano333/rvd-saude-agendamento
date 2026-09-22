import { describe, expect, it } from "vitest";
import { filtroDeDestinatario, formatarCnpj, rotuloDoDestinatario, unidadePorCnpj } from "./recipients";

describe("destinatário da nota", () => {
  it("reconhece as duas unidades pelo CNPJ", () => {
    expect(unidadePorCnpj("06033403000113")?.sigla).toBe("HSH");
    expect(unidadePorCnpj("43293604002120")?.sigla).toBe("MSH");
  });

  it("reconhece o CNPJ mesmo pontuado, como vem de um filtro digitado", () => {
    expect(rotuloDoDestinatario("06.033.403/0001-13")).toEqual({ titulo: "HSH", detalhe: "Hospital" });
    expect(rotuloDoDestinatario("43.293.604/0021-20")).toEqual({ titulo: "MSH", detalhe: "Maternidade" });
  });

  it("mostra o número quando a unidade não é conhecida, em vez de inventar um nome", () => {
    expect(rotuloDoDestinatario("12345678000199")).toEqual({ titulo: "12.345.678/0001-99", detalhe: "Destinatário" });
  });

  it("não confunde um CNPJ incompleto com uma unidade", () => {
    expect(unidadePorCnpj("060334030001")).toBeNull();
    expect(unidadePorCnpj("")).toBeNull();
    expect(unidadePorCnpj(null)).toBeNull();
  });

  it("avisa quando a nota não trouxe destinatário", () => {
    expect(rotuloDoDestinatario(null)).toEqual({ titulo: "—", detalhe: "Não informado" });
  });

  it("deixa o número legível", () => {
    expect(formatarCnpj("06033403000113")).toBe("06.033.403/0001-13");
  });
});

describe("filtro de destinatário", () => {
  it("traduz a sigla que a pessoa vê na tela para o CNPJ que o banco guarda", () => {
    expect(filtroDeDestinatario("HSH")).toBe("06033403000113");
    expect(filtroDeDestinatario(" msh ")).toBe("43293604002120");
    expect(filtroDeDestinatario("Maternidade")).toBe("43293604002120");
  });

  it("deixa passar o que não é sigla, para a busca por parte do número continuar valendo", () => {
    expect(filtroDeDestinatario("06.033")).toBe("06.033");
    expect(filtroDeDestinatario("12345678")).toBe("12345678");
    expect(filtroDeDestinatario("   ")).toBe("");
  });
});
