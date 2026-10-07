import { describe, expect, it } from "vitest";
import { ehNotaValida, resumoDasNotas, rotuloDaNota, temConteudo } from "./notaDoPortal";

describe("a nota que vale", () => {
  it("é de 1 a 5, inteira", () => {
    expect(ehNotaValida(1)).toBe(true);
    expect(ehNotaValida(5)).toBe(true);
    expect(ehNotaValida(0)).toBe(false);
    expect(ehNotaValida(6)).toBe(false);
    expect(ehNotaValida(4.5)).toBe(false);
    expect(ehNotaValida("5")).toBe(false);
    expect(ehNotaValida(null)).toBe(false);
  });

  it("tem nome, porque o número sozinho não diz se é bom", () => {
    expect(rotuloDaNota(1)).toBe("Ruim");
    expect(rotuloDaNota(3)).toBe("Dá para usar");
    expect(rotuloDaNota(5)).toBe("Ótimo");
  });
});

describe("o resumo das notas", () => {
  it("tira a média com uma casa", () => {
    expect(resumoDasNotas([5, 4, 4]).media).toBe(4.3);
    expect(resumoDasNotas([5, 5]).media).toBe(5);
  });

  it("mostra a distribuição, porque a média esconde o que importa", () => {
    // 3,0 pode ser todo mundo achando mediano, ou metade ótimo e metade
    // péssimo — e as duas coisas pedem respostas diferentes.
    const resumo = resumoDasNotas([1, 1, 5, 5]);
    expect(resumo.media).toBe(3);
    expect(resumo.porNota).toEqual({ 1: 2, 2: 0, 3: 0, 4: 0, 5: 2 });
  });

  it("quem só escreveu não entra na média", () => {
    expect(resumoDasNotas([5, null, undefined, 3]).total).toBe(2);
    expect(resumoDasNotas([5, null, undefined, 3]).media).toBe(4);
  });

  it("sem nenhuma nota, não inventa um número", () => {
    const resumo = resumoDasNotas([null, null]);
    expect(resumo.media).toBeNull();
    expect(resumo.total).toBe(0);
  });

  it("nota fora da faixa não contamina a média", () => {
    expect(resumoDasNotas([5, 9 as number, 0 as number]).total).toBe(1);
  });
});

describe("o que basta para ser um recado", () => {
  it("a nota sozinha já é um recado", () => {
    // É o clique de quem não ia escrever nada.
    expect(temConteudo({ nota: 5 })).toBe(true);
    expect(temConteudo({ nota: 2, mensagem: "" })).toBe(true);
  });

  it("o texto sozinho também", () => {
    expect(temConteudo({ mensagem: "o filtro de data não funciona" })).toBe(true);
  });

  it("vazio não entra", () => {
    expect(temConteudo({})).toBe(false);
    expect(temConteudo({ mensagem: "  " })).toBe(false);
    expect(temConteudo({ mensagem: "oi", nota: null })).toBe(false);
  });
});
