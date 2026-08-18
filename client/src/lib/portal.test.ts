import { describe, expect, it } from "vitest";
import { getAppointmentMomentForDisplay } from "./portal";

describe("momento exibido do agendamento", () => {
  it("prioriza a data e hora reais quando a nota foi recebida", () => {
    const scheduledFor = new Date("2030-09-01T08:00:00.000Z");
    const receivedAt = new Date("2030-09-01T13:37:00.000Z");
    expect(getAppointmentMomentForDisplay({ status: "received", scheduledFor, receivedAt })).toBe(receivedAt);
  });

  it("preserva o horário agendado enquanto não houver recebimento", () => {
    const scheduledFor = new Date("2030-09-01T08:00:00.000Z");
    expect(getAppointmentMomentForDisplay({ status: "scheduled", scheduledFor })).toBe(scheduledFor);
  });
});
