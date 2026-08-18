import { describe, expect, it } from "vitest";
import { canApplySuggestion } from "./permissions";

describe("sugestões de agendamento", () => {
  it("aceita sugestão apenas para agendamentos pendentes ou em backlog", () => {
    expect(canApplySuggestion("pending")).toBe(true);
    expect(canApplySuggestion("backlog")).toBe(true);
    expect(canApplySuggestion("scheduled")).toBe(false);
    expect(canApplySuggestion("received")).toBe(false);
    expect(canApplySuggestion("completed")).toBe(false);
    expect(canApplySuggestion("rejected")).toBe(false);
  });
});

