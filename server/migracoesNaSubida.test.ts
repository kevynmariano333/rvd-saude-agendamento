import { describe, expect, it } from "vitest";
import { bancoAindaSubindo, ESPERAS_DA_SUBIDA } from "./_core/migrations";

describe("banco indisponível na subida", () => {
  it("reconhece o banco que ainda está reiniciando", () => {
    // É o que acontece quando a hospedagem aplica um patch no MySQL no mesmo
    // minuto em que o portal sobe: o deploy era marcado como falho por isso.
    expect(bancoAindaSubindo({ code: "ECONNREFUSED" })).toBe(true);
    expect(bancoAindaSubindo({ code: "ETIMEDOUT" })).toBe(true);
    expect(bancoAindaSubindo({ code: "PROTOCOL_CONNECTION_LOST" })).toBe(true);
  });

  it("não confunde com migração errada, que precisa derrubar a subida", () => {
    // Subir com uma migração quebrada publica telas que leem coluna que não
    // existe — aí falhar é o comportamento certo.
    expect(bancoAindaSubindo({ code: "ER_PARSE_ERROR" })).toBe(false);
    expect(bancoAindaSubindo({ code: "ER_DUP_FIELDNAME" })).toBe(false);
    expect(bancoAindaSubindo(new Error("qualquer coisa"))).toBe(false);
    expect(bancoAindaSubindo(null)).toBe(false);
  });

  it("espera no máximo cerca de um minuto, somando as tentativas", () => {
    const total = ESPERAS_DA_SUBIDA.reduce((soma, segundos) => soma + segundos, 0);
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(90);
  });
});
