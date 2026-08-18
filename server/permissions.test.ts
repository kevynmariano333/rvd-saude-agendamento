import { describe, expect, it } from "vitest";
import { canRequestAppointment, canRescueAppointment, canScheduleAppointment, canTransitionAppointment, isOperator } from "./permissions";

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
