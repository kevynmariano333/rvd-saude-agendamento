import { describe, expect, it } from "vitest";
import {
  ehSituacao,
  JANELA_DE_PRESENCA_MS,
  precisaGravarSinal,
  presencaDe,
  quandoFoiVisto,
  SITUACOES,
} from "./presenca";

const agora = new Date("2026-10-07T14:00:00.000Z");
const hoje = (minutosAtras: number) => new Date(agora.getTime() - minutosAtras * 60_000);

describe("em que pé está uma conta", () => {
  it("quem está no sistema aparece com o que escolheu", () => {
    expect(presencaDe({ situacao: "ocupado", vistoEm: hoje(1) }, agora).rotulo).toBe("Ocupado");
    expect(presencaDe({ situacao: "disponivel", vistoEm: hoje(1) }, agora).rotulo).toBe("Disponível");
    expect(presencaDe({ situacao: "ausente", vistoEm: hoje(4) }, agora).presente).toBe(true);
  });

  it("quem parou de usar não continua com o rótulo que escolheu", () => {
    // Senão quem marcou "ocupado" na terça continua ocupado na sexta, e aí
    // ninguém mais acredita em nenhum dos rótulos.
    const parado = presencaDe({ situacao: "ocupado", vistoEm: hoje(30) }, agora);
    expect(parado.estado).toBe("desconectado");
    expect(parado.rotulo).toBe("Desconectado");
    expect(parado.presente).toBe(false);
  });

  it("a janela é de cinco minutos", () => {
    const naBorda = new Date(agora.getTime() - JANELA_DE_PRESENCA_MS);
    expect(presencaDe({ situacao: "disponivel", vistoEm: naBorda }, agora).presente).toBe(true);
    expect(presencaDe({ situacao: "disponivel", vistoEm: new Date(naBorda.getTime() - 1000) }, agora).presente).toBe(false);
  });

  it("conta que nunca entrou não inventa situação", () => {
    const nunca = presencaDe({ situacao: "disponivel", vistoEm: null }, agora);
    expect(nunca.estado).toBe("desconectado");
    expect(nunca.detalhe).toBe("nunca entrou");
  });

  it("situação gravada errada não quebra a tela", () => {
    expect(presencaDe({ situacao: "almoçando", vistoEm: hoje(1) }, agora).rotulo).toBe("Disponível");
    expect(presencaDe({ situacao: null, vistoEm: hoje(1) }, agora).rotulo).toBe("Disponível");
  });
});

describe("há quanto tempo foi visto", () => {
  it("minutos e horas, como alguém falaria", () => {
    expect(quandoFoiVisto(hoje(0), agora)).toBe("visto agora há pouco");
    expect(quandoFoiVisto(hoje(12), agora)).toBe("visto há 12 min");
    expect(quandoFoiVisto(hoje(60 * 3), agora)).toBe("visto há 3 h");
  });

  it("passado o dia, a hora volta a ser o que importa", () => {
    // "Há 19 horas" não diz se foi ontem à tarde ou hoje de madrugada.
    expect(quandoFoiVisto(new Date("2026-10-06T20:40:00.000Z"), agora)).toMatch(/^visto ontem, /);
    expect(quandoFoiVisto(new Date("2026-10-02T09:00:00.000Z"), agora)).toMatch(/^visto em /);
  });

  it("sem registro, diz que nunca entrou", () => {
    expect(quandoFoiVisto(null, agora)).toBe("nunca entrou");
    expect(quandoFoiVisto("data inválida", agora)).toBe("nunca entrou");
  });
});

describe("o sinal de que ainda está aqui", () => {
  it("não grava a cada requisição", () => {
    // Seriam milhares de escritas por dia para a mesma resposta na tela.
    expect(precisaGravarSinal(hoje(1), agora)).toBe(false);
    expect(precisaGravarSinal(hoje(2), agora)).toBe(true);
    expect(precisaGravarSinal(null, agora)).toBe(true);
  });
});

describe("as situações que a tela oferece", () => {
  it("são as três, e só elas", () => {
    expect(SITUACOES).toEqual(["disponivel", "ocupado", "ausente"]);
    expect(ehSituacao("ocupado")).toBe(true);
    expect(ehSituacao("invisivel")).toBe(false);
  });
});
