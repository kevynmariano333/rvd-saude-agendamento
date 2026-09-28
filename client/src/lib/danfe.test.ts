import { describe, expect, it } from "vitest";
import { chaveFormatada, danfeFileName, formatarCep, formatarDocumento, formatarNumero, paginar } from "./danfe";

describe("os números como o DANFE os imprime", () => {
  it("põe o número da nota com nove casas e pontos, que é como se lê no papel", () => {
    expect(formatarNumero("2051369")).toBe("002.051.369");
    expect(formatarNumero("8842")).toBe("000.008.842");
  });

  it("não escreve pontuação quando não há número", () => {
    expect(formatarNumero(null)).toBe("");
  });

  it("quebra a chave em blocos de quatro", () => {
    expect(chaveFormatada("35260911222333000144550010002051369100205136")).toBe(
      "3526 0911 2223 3300 0144 5500 1000 2051 3691 0020 5136",
    );
  });

  it("formata CNPJ e CPF pelo tamanho, e deixa em paz o que não é nem um nem outro", () => {
    expect(formatarDocumento("11222333000144")).toBe("11.222.333/0001-44");
    expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
    expect(formatarDocumento("123")).toBe("123");
    expect(formatarDocumento(null)).toBe("");
  });

  it("formata o CEP e não estraga o que veio torto", () => {
    expect(formatarCep("04065012")).toBe("04065-012");
    expect(formatarCep("sem cep")).toBe("sem cep");
  });

  it("nomeia o arquivo pelo número da nota", () => {
    expect(danfeFileName("2051369")).toBe("danfe-nfe-2051369.pdf");
    expect(danfeFileName(null)).toBe("danfe-nfe-sem-numero.pdf");
  });
});

describe("dividir os itens entre as folhas", () => {
  it("cabe tudo numa folha quando cabe", () => {
    expect(paginar([4, 4, 4], 70, 190)).toEqual([[0, 1, 2]]);
  });

  it("a primeira folha é menor: ela carrega o cabeçalho, o destinatário e os impostos", () => {
    const paginas = paginar(Array(40).fill(4), 20, 40);
    expect(paginas[0]).toHaveLength(5);
    expect(paginas[1]).toHaveLength(10);
  });

  it("um item mais alto que a folha inteira não some — sai sozinho, em vez de nunca ser desenhado", () => {
    expect(paginar([4, 500, 4], 20, 40)).toEqual([[0], [1], [2]]);
  });

  it("nota sem item nenhum continua tendo uma folha, com a tabela vazia", () => {
    expect(paginar([], 70, 190)).toEqual([[]]);
  });
});
