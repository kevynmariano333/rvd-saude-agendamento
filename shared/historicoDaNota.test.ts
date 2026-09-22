import { describe, expect, it } from "vitest";
import { descricaoDoEvento, tomDoEvento } from "./historicoDaNota";

describe("histórico da nota", () => {
  it("conta o começo e o fim comuns", () => {
    expect(descricaoDoEvento({ previousStatus: null, nextStatus: "pending" })).toBe("Nota enviada ao portal");
    expect(descricaoDoEvento({ previousStatus: "pending", nextStatus: "scheduled" })).toBe("Agendada");
    expect(descricaoDoEvento({ previousStatus: "scheduled", nextStatus: "received" })).toBe("Recebida na doca");
    expect(descricaoDoEvento({ previousStatus: "received", nextStatus: "completed" })).toBe("Concluída");
  });

  it("distingue a conclusão normal da saída do backlog", () => {
    // As duas terminam em "completed", mas contam histórias diferentes.
    expect(descricaoDoEvento({ previousStatus: "backlog", nextStatus: "completed" })).toBe("Backlog tratado e nota concluída");
    expect(descricaoDoEvento({ previousStatus: "received", nextStatus: "completed" })).toBe("Concluída");
  });

  it("nomeia o reagendamento e o resgate", () => {
    expect(descricaoDoEvento({ previousStatus: "scheduled", nextStatus: "scheduled" })).toBe("Reagendada");
    expect(descricaoDoEvento({ previousStatus: "rejected", nextStatus: "pending" })).toBe("Resgatada da recusa");
    expect(descricaoDoEvento({ previousStatus: "backlog", nextStatus: "scheduled" })).toBe("Devolvida do backlog para a agenda");
  });

  it("marca o backlog e a recusa com tons próprios", () => {
    expect(tomDoEvento("completed")).toBe("bom");
    expect(tomDoEvento("backlog")).toBe("atencao");
    expect(tomDoEvento("rejected")).toBe("ruim");
    expect(tomDoEvento("scheduled")).toBe("neutro");
  });
});
