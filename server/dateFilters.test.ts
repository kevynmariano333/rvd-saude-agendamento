import { describe, expect, it } from "vitest";
import { formatSaoPauloDateKey, getSaoPauloDayRange } from "../shared/dateFilters";

describe("filtros de data de São Paulo", () => {
  it("gera uma chave ISO pela data brasileira, sem depender do locale do navegador", () => {
    expect(formatSaoPauloDateKey(new Date("2026-08-20T01:30:00.000Z"))).toBe("2026-08-19");
  });

  it("converte um dia brasileiro no intervalo UTC correto para consulta", () => {
    expect(getSaoPauloDayRange("2026-08-20")).toEqual({
      start: new Date("2026-08-20T03:00:00.000Z"),
      end: new Date("2026-08-21T02:59:59.999Z"),
    });
  });

  it("rejeita chaves de data fora do formato ISO esperado", () => {
    expect(getSaoPauloDayRange("20/08/2026")).toBeNull();
  });
});
