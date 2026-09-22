import { describe, expect, it } from "vitest";
import { CAMPOS_DO_OPERADOR, OPERADOR_LOGISTICO } from "./operadorLogistico";

describe("dados do operador logístico", () => {
  it("tem um CNPJ com os catorze dígitos", () => {
    // O print de referência trazia treze — a filial com três dígitos em vez de
    // quatro. Um CNPJ curto no comprovante do motorista é problema na portaria.
    expect(OPERADOR_LOGISTICO.cnpj.replace(/\D/g, "")).toHaveLength(14);
    expect(OPERADOR_LOGISTICO.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });

  it("traz endereço e CEP preenchidos", () => {
    expect(OPERADOR_LOGISTICO.enderecoEntrega.length).toBeGreaterThan(20);
    expect(OPERADOR_LOGISTICO.cep).toMatch(/^\d{5}-\d{3}$/);
  });

  it("lista os quatro campos na ordem em que são lidos", () => {
    expect(CAMPOS_DO_OPERADOR.map(campo => campo.rotulo)).toEqual(["Operador", "CNPJ", "Endereço de entrega", "CEP"]);
    for (const campo of CAMPOS_DO_OPERADOR) expect(campo.valor.trim()).not.toBe("");
  });
});
