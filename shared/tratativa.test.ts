import { describe, expect, it } from "vitest";
import { normalizarDocumento, resumoDaTratativa, validarTratativa } from "./tratativa";

describe("tratativa de backlog", () => {
  it("exige o MIRO e devolve os documentos limpos", () => {
    const resultado = validarTratativa({ miroNumber: " 5105101642 ", quotationNumber: "  COT-88  ", hisEntryDocument: "0244599" });
    expect(resultado).toEqual({
      ok: true,
      dados: { miroNumber: "5105101642", quotationNumber: "COT-88", memorizedOrder: null, hisEntryDocument: "0244599", hisExitDocument: null },
    });
  });

  it("recusa a tratativa sem MIRO válido", () => {
    for (const miroNumber of ["", "   ", "510510164", "51051016423", "51051O1642"]) {
      const resultado = validarTratativa({ miroNumber });
      expect(resultado.ok).toBe(false);
    }
  });

  it("não exige os documentos auxiliares", () => {
    // Nem toda divergência gera cotação nova ou movimento no HIS. Exigir os
    // cinco campos faria a pessoa inventar número para fechar a tela.
    const resultado = validarTratativa({ miroNumber: "5105101642" });
    expect(resultado).toMatchObject({ ok: true, dados: { quotationNumber: null, memorizedOrder: null, hisEntryDocument: null, hisExitDocument: null } });
  });

  it("corta o documento no tamanho da coluna", () => {
    expect(normalizarDocumento("X".repeat(100))).toHaveLength(60);
    expect(normalizarDocumento("  ")).toBeNull();
  });

  it("resume no histórico só o que foi preenchido", () => {
    expect(resumoDaTratativa({ miroNumber: "5105101642", quotationNumber: null, memorizedOrder: null, hisEntryDocument: null, hisExitDocument: null }))
      .toBe("Backlog tratado: MIRO 5105101642.");
    expect(resumoDaTratativa({ miroNumber: "5105101642", quotationNumber: "COT-88", memorizedOrder: null, hisEntryDocument: "0244599", hisExitDocument: "0244707" }))
      .toBe("Backlog tratado: MIRO 5105101642, cotação COT-88, entrada HIS 0244599, saída HIS 0244707.");
  });
});
