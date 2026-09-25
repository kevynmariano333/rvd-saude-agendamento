import { describe, expect, it } from "vitest";
import { MOTIVOS_DE_RECUSA, recusaExigeDescricao, rotuloDaRecusa, textoDaRecusa } from "./motivosDeRecusa";

describe("motivos de recusa", () => {
  it("tem código único para cada motivo", () => {
    const codigos = MOTIVOS_DE_RECUSA.map(motivo => motivo.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("traduz o código para a frase que a operação lê", () => {
    expect(rotuloDaRecusa("NAO_COMPARECEU")).toBe("Não compareceu");
    expect(rotuloDaRecusa(null)).toBe("Motivo não informado");
  });

  it("devolve o código quando ele não está na lista, em vez de esconder a recusa", () => {
    // Uma nota antiga pode ter sido gravada com outro código; some-lo da tela
    // seria pior do que mostrar o que está lá.
    expect(rotuloDaRecusa("MOTIVO_DE_OUTRA_ERA")).toBe("MOTIVO_DE_OUTRA_ERA");
  });

  it("cobra descrição só de 'Outro motivo'", () => {
    expect(recusaExigeDescricao("OUTRO")).toBe(true);
    expect(recusaExigeDescricao("NAO_COMPARECEU")).toBe(false);
  });
});

describe("o que fica gravado na nota", () => {
  it("guarda só o rótulo quando não há detalhe", () => {
    expect(textoDaRecusa("NAO_COMPARECEU")).toBe("Não compareceu");
    expect(textoDaRecusa("NAO_COMPARECEU", "   ")).toBe("Não compareceu");
  });

  it("junta rótulo e detalhe numa linha", () => {
    expect(textoDaRecusa("CARGA_AVARIADA", "Caixa molhada.")).toBe("Carga avariada — Caixa molhada.");
  });

  it("não repete o rótulo quando quem escreveu já começou por ele", () => {
    expect(textoDaRecusa("NAO_COMPARECEU", "Não compareceu e não avisou.")).toBe("Não compareceu e não avisou.");
  });
});
