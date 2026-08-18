import { describe, expect, it } from "vitest";
import { canRequestAppointment, canTransitionAppointment, isOperator } from "./permissions";

describe("regras de perfil e status", () => {
  it("restringe o tratamento operacional aos perfis permitidos", () => {
    expect(isOperator("operator")).toBe(true);
    expect(isOperator("admin")).toBe(true);
    expect(isOperator("supplier")).toBe(false);
    expect(canRequestAppointment("supplier")).toBe(true);
    expect(canRequestAppointment("operator")).toBe(false);
  });

  it("permite somente as transições de status definidas", () => {
    expect(canTransitionAppointment("pending", "approved")).toBe(true);
    expect(canTransitionAppointment("pending", "rejected")).toBe(true);
    expect(canTransitionAppointment("approved", "completed")).toBe(true);
    expect(canTransitionAppointment("pending", "completed")).toBe(false);
    expect(canTransitionAppointment("rejected", "approved")).toBe(false);
  });
});

