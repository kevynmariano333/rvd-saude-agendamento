import { describe, expect, it } from "vitest";
import { canRequestAppointment, canRescueAppointment, canScheduleAppointment, canTransitionAppointment, isOperator } from "./permissions";
import { buildScopeIds, isWithinScope } from "./supplierScope";

describe("regras de perfil e status", () => {
  it("restringe o tratamento operacional aos perfis permitidos", () => {
    expect(isOperator("operator")).toBe(true);
    expect(isOperator("admin")).toBe(true);
    expect(isOperator("supplier")).toBe(false);
    expect(canRequestAppointment("supplier")).toBe(true);
    expect(canRequestAppointment("operator")).toBe(false);
  });

  it("permite somente as transições de status definidas", () => {
    expect(canTransitionAppointment("pending", "scheduled")).toBe(true);
    expect(canTransitionAppointment("pending", "rejected")).toBe(true);
    expect(canTransitionAppointment("scheduled", "received")).toBe(true);
    expect(canTransitionAppointment("received", "completed")).toBe(true);
    expect(canTransitionAppointment("pending", "backlog")).toBe(true);
    expect(canTransitionAppointment("pending", "completed")).toBe(false);
    expect(canTransitionAppointment("rejected", "scheduled")).toBe(false);
  });

  it("restringe o agendamento, o reagendamento e o resgate aos estados corretos", () => {
    expect(canScheduleAppointment("pending")).toBe(true);
    expect(canScheduleAppointment("backlog")).toBe(true);
    expect(canScheduleAppointment("scheduled")).toBe(true);
    expect(canScheduleAppointment("received")).toBe(false);
    expect(canRescueAppointment("rejected")).toBe(true);
    expect(canRescueAppointment("pending")).toBe(false);
  });
});

describe("escopo por empresa", () => {
  it("nunca deixa um escopo vazio virar acesso total", () => {
    // The listing helpers must treat an empty id list as "sees nothing"; the
    // opposite reading would expose every supplier's records at once.
    expect(buildScopeIds(5, [])).toEqual([5]);
    expect(isWithinScope([], 5)).toBe(false);
  });

  it("isola logins de empresas diferentes", () => {
    const acme = buildScopeIds(1, [1, 2]);
    const outra = buildScopeIds(3, [3, 4]);
    expect(isWithinScope(acme, 3)).toBe(false);
    expect(isWithinScope(outra, 1)).toBe(false);
  });
});
