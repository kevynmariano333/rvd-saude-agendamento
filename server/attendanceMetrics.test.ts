import { describe, expect, it } from "vitest";
import { buildAttendanceMetrics } from "./attendanceMetrics";

describe("indicadores da Portaria", () => {
  it("resume fila, tipos de atendimento e espera para liberação", () => {
    const referenceTime = new Date("2026-09-01T15:00:00.000Z");
    const metrics = buildAttendanceMetrics(
      [
        { status: "aguardando", serviceType: "coleta", arrivalAt: new Date("2026-09-01T14:30:00.000Z") },
        { status: "aprovado", serviceType: "recebimento", arrivalAt: new Date("2026-09-01T14:00:00.000Z") },
        { status: "recusado", serviceType: "coleta", arrivalAt: new Date("2026-09-01T13:00:00.000Z") },
        { status: "liberado", serviceType: "recebimento", arrivalAt: new Date("2026-09-01T12:00:00.000Z") },
        { status: "concluido", serviceType: "recebimento", arrivalAt: new Date("2026-08-31T23:45:00.000Z") },
      ],
      referenceTime
    );

    expect(metrics).toEqual({
      awaiting: 1,
      approved: 1,
      refused: 1,
      inProgress: 0,
      released: 1,
      concluded: 1,
      collections: 2,
      receipts: 3,
      averageReleaseWaitMinutes: 45,
      collectionsToday: 2,
      receiptsToday: 2,
    });
  });

  it("retorna espera média zero quando nenhum caminhão aguarda liberação", () => {
    const metrics = buildAttendanceMetrics([
      { status: "recusado", serviceType: "coleta", arrivalAt: new Date("2026-09-01T14:00:00.000Z") },
      { status: "liberado", serviceType: "recebimento", arrivalAt: new Date("2026-09-01T14:00:00.000Z") },
    ]);

    expect(metrics.averageReleaseWaitMinutes).toBe(0);
  });

  it("ignora atendimentos encerrados no cálculo da espera", () => {
    const referenceTime = new Date("2026-09-01T15:00:00.000Z");
    const metrics = buildAttendanceMetrics(
      [
        { status: "aguardando", serviceType: "coleta", arrivalAt: new Date("2026-09-01T14:00:00.000Z") },
        { status: "concluido", serviceType: "coleta", arrivalAt: new Date("2026-09-01T05:00:00.000Z") },
      ],
      referenceTime
    );

    expect(metrics.averageReleaseWaitMinutes).toBe(60);
  });

  // Rodando em UTC, um corte pelo relógio do servidor zeraria a movimentação às
  // 21h no Brasil — com o porteiro ainda no turno.
  it("conta o dia de São Paulo, não o do relógio do servidor", () => {
    // 22h de 01/09 em São Paulo; o servidor em UTC já está em 02/09.
    const referenceTime = new Date("2026-09-02T01:00:00.000Z");
    const metrics = buildAttendanceMetrics(
      [
        // Chegou às 20h do mesmo turno.
        { status: "concluido", serviceType: "recebimento", arrivalAt: new Date("2026-09-01T23:00:00.000Z") },
        // Chegou às 20h da véspera.
        { status: "concluido", serviceType: "recebimento", arrivalAt: new Date("2026-08-31T23:00:00.000Z") },
      ],
      referenceTime
    );

    expect(metrics.receiptsToday).toBe(1);
  });

  it("conta como movimentação do dia apenas o que chegou depois da virada", () => {
    const referenceTime = new Date("2026-09-01T15:00:00.000Z");
    const metrics = buildAttendanceMetrics(
      [
        { status: "aprovado", serviceType: "coleta", arrivalAt: referenceTime },
        { status: "concluido", serviceType: "coleta", arrivalAt: new Date("2026-08-28T10:00:00.000Z") },
      ],
      referenceTime
    );

    expect(metrics.collectionsToday).toBe(1);
    expect(metrics.collections).toBe(2);
  });
});
