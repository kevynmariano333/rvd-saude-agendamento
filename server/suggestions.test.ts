import { describe, expect, it } from "vitest";
import { canApplySuggestion } from "./permissions";

describe("sugestões de agendamento", () => {
  it("aceita sugestão para agendamentos pendentes, agendados ou em backlog", () => {
    expect(canApplySuggestion("pending")).toBe(true);
    expect(canApplySuggestion("scheduled")).toBe(true);
    expect(canApplySuggestion("backlog")).toBe(true);
    expect(canApplySuggestion("received")).toBe(false);
    expect(canApplySuggestion("completed")).toBe(false);
    expect(canApplySuggestion("rejected")).toBe(false);
  });
});
