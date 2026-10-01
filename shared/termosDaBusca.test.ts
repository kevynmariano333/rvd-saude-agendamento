import { describe, expect, it } from "vitest";
import { LIMITE_DE_TERMOS, termosDaBusca } from "./termosDaBusca";

describe("os termos de uma busca", () => {
  it("quebra a lista colada do e-mail, com vírgula e espaço misturados", () => {
    expect(termosDaBusca("401514,81467, 2050722  2050224")).toEqual(["401514", "81467", "2050722", "2050224"]);
  });

  it("aceita a lista colada de uma planilha, uma por linha", () => {
    expect(termosDaBusca("401514\n81467\r\n2050722\n")).toEqual(["401514", "81467", "2050722"]);
  });

  it("um número só continua sendo um número só", () => {
    expect(termosDaBusca("  1787652 ")).toEqual(["1787652"]);
  });

  it("não procura duas vezes a mesma nota", () => {
    expect(termosDaBusca("81467 81467, 81467")).toEqual(["81467"]);
  });

  it("joga fora o resto de pontuação que o teclado deixa", () => {
    // Uma vírgula sobrando no fim da lista colada não pode virar uma busca por
    // "," — que casaria com tudo.
    expect(termosDaBusca("401514, , 81467,")).toEqual(["401514", "81467"]);
  });

  it("nada escrito é busca nenhuma, e não uma busca por vazio", () => {
    expect(termosDaBusca("")).toEqual([]);
    expect(termosDaBusca(null)).toEqual([]);
    expect(termosDaBusca("   ")).toEqual([]);
  });

  it("uma planilha inteira colada por engano para no teto", () => {
    const muitos = Array.from({ length: 200 }, (_, indice) => `NF${indice}`).join(" ");
    expect(termosDaBusca(muitos)).toHaveLength(LIMITE_DE_TERMOS);
  });
});
