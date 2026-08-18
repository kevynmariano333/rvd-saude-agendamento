import { describe, expect, it } from "vitest";
import { getAppointmentMomentForDisplay } from "../client/src/lib/portal";
import { REALTIME_REFRESH_INTERVAL_MS, realtimeQueryDefaults } from "../client/src/lib/realtime";

describe("exibição e sincronização do portal", () => {
  it("exibe o momento real de recebimento no lugar do horário agendado", () => {
    const scheduledFor = new Date("2030-09-01T08:00:00.000Z");
    const receivedAt = new Date("2030-09-01T13:37:00.000Z");
    expect(getAppointmentMomentForDisplay({ status: "received", scheduledFor, receivedAt })).toBe(receivedAt);
  });

  it("mantém a sincronização automática ativa para telas abertas", () => {
    expect(realtimeQueryDefaults).toMatchObject({
      refetchInterval: REALTIME_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    });
  });
});
