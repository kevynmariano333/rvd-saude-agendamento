import { describe, expect, it } from "vitest";
import { dataDoAgendamento } from "./reports";

describe("a coluna de agendamento do relatório", () => {
  const quando = new Date("2026-09-29T13:15:00.000Z");

  it("mostra a data quando ela foi combinada com alguém", () => {
    expect(dataDoAgendamento({ scheduledFor: quando })).toContain("29/09/2026");
  });

  it("não inventa horário para a carga que chegou sem hora marcada", () => {
    // No banco aquela nota leva o instante do clique, porque a coluna de data
    // não aceita vazio. Imprimir o instante faria o relatório afirmar que
    // havia compromisso — e é o que deixava a coluna de criação parecendo
    // repetida, já que as duas traziam o mesmo minuto.
    expect(dataDoAgendamento({ scheduledFor: quando, semAgendamento: true })).toBe("Sem agendamento");
  });

  it("a marca ausente ou falsa é tratada como agendamento normal", () => {
    expect(dataDoAgendamento({ scheduledFor: quando, semAgendamento: false })).toContain("29/09/2026");
    expect(dataDoAgendamento({ scheduledFor: quando, semAgendamento: null })).toContain("29/09/2026");
  });
});
