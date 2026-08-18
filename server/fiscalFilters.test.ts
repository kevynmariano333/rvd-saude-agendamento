import { describe, expect, it } from "vitest";
import { normalizeCnpj } from "./fiscalFilters";

describe("normalização de CNPJ para filtros", () => {
  it("remove caracteres de formatação sem alterar os dígitos", () => {
    expect(normalizeCnpj("12.345.678/0001-99")).toBe("12345678000199");
    expect(normalizeCnpj(" 12 345 678 0001 99 ")).toBe("12345678000199");
  });
});
