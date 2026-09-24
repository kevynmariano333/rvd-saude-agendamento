import { describe, expect, it } from "vitest";
import { canConfirmSchedule, canMoveAppointmentStatus, canRequestAppointment, canRescueAppointment, canScheduleAppointment, canSuggestSchedule, canTransitionAppointment, isOperator, isSchedulingDesk } from "./permissions";
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

describe("planejador", () => {
  it("trabalha a agenda, mas não crava a data", () => {
    expect(isSchedulingDesk("planejador")).toBe(true);
    // Receber e recusar são declarações sobre o que aconteceu na doca: ficam
    // com quem responde pela doca.
    expect(canMoveAppointmentStatus("planejador")).toBe(false);
    expect(canSuggestSchedule("planejador")).toBe(true);
    // Agendar é o compromisso com o fornecedor: continua sendo do Operador.
    expect(canConfirmSchedule("planejador")).toBe(false);
  });

  it("não se confunde com o operador nem com o fornecedor", () => {
    expect(isOperator("planejador")).toBe(false);
    expect(canRequestAppointment("planejador")).toBe(false);
    expect(isSchedulingDesk("portaria")).toBe(false);
    expect(isSchedulingDesk("operacao")).toBe(false);
    expect(isSchedulingDesk("supplier")).toBe(false);
  });
});
