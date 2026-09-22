import { describe, expect, it } from "vitest";
import { MIRO_DIGITS, normalizeMiroNumber } from "./miro";

describe("número MIRO", () => {
  it("aceita os dez dígitos do lançamento", () => {
    expect(normalizeMiroNumber("5105101642")).toBe("5105101642");
    expect(normalizeMiroNumber("0000000001")).toBe("0000000001");
  });

  it("tolera o espaço que vem colado do SAP", () => {
    expect(normalizeMiroNumber(" 5105101642 ")).toBe("5105101642");
    expect(normalizeMiroNumber("51051 01642")).toBe("5105101642");
  });

  it("recusa o que não tem exatamente dez dígitos", () => {
    expect(normalizeMiroNumber("510510164")).toBeNull();
    expect(normalizeMiroNumber("51051016423")).toBeNull();
    expect(normalizeMiroNumber("")).toBeNull();
    expect(normalizeMiroNumber(null)).toBeNull();
  });

  it("recusa letra e pontuação em vez de limpar escondido", () => {
    // Um dígito trocado por letra é erro de digitação. Apagar o caractere
    // gravaria um MIRO de nove dígitos que não existe no SAP.
    expect(normalizeMiroNumber("51051O1642")).toBeNull();
    expect(normalizeMiroNumber("5105-101642")).toBeNull();
    expect(normalizeMiroNumber("5105.101.642")).toBeNull();
  });

  it("guarda o tamanho num só lugar", () => {
    expect(normalizeMiroNumber("9".repeat(MIRO_DIGITS))).toHaveLength(MIRO_DIGITS);
  });
});
