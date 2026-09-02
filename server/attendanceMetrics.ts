import type { AttendanceServiceType, AttendanceStatus } from "../drizzle/schema";
import { formatSaoPauloDateKey, getSaoPauloDayRange } from "../shared/dateFilters";

type AttendanceRecord = {
  status: AttendanceStatus;
  serviceType: AttendanceServiceType;
  arrivalAt: Date;
};

/**
 * Indicators for the gate panel. The wait is measured from the arrival of every
 * truck still inside the flow — a truck already refused or concluded no longer
 * waits for anything, so counting it would drag the average away from what the
 * yard actually sees.
 */
export function buildAttendanceMetrics(records: AttendanceRecord[], referenceTime = new Date()) {
  // O dia é o de São Paulo, não o do relógio do servidor: rodando em UTC, a
  // "movimentação de hoje" zeraria às 21h no Brasil, no meio do turno.
  const day = getSaoPauloDayRange(formatSaoPauloDateKey(referenceTime));

  const waitingForRelease = records.filter(record =>
    ["aguardando", "aprovado", "em_atendimento"].includes(record.status)
  );
  const averageReleaseWaitMinutes = waitingForRelease.length
    ? Math.round(
        waitingForRelease.reduce(
          (sum, record) => sum + (referenceTime.getTime() - record.arrivalAt.getTime()),
          0
        ) /
          waitingForRelease.length /
          60000
      )
    : 0;
  const arrivedToday = day
    ? records.filter(record => record.arrivalAt >= day.start && record.arrivalAt <= day.end)
    : [];

  return {
    awaiting: records.filter(record => record.status === "aguardando").length,
    approved: records.filter(record => record.status === "aprovado").length,
    refused: records.filter(record => record.status === "recusado").length,
    inProgress: records.filter(record => record.status === "em_atendimento").length,
    released: records.filter(record => record.status === "liberado").length,
    concluded: records.filter(record => record.status === "concluido").length,
    collections: records.filter(record => record.serviceType === "coleta").length,
    receipts: records.filter(record => record.serviceType === "recebimento").length,
    averageReleaseWaitMinutes,
    collectionsToday: arrivedToday.filter(record => record.serviceType === "coleta").length,
    receiptsToday: arrivedToday.filter(record => record.serviceType === "recebimento").length,
  };
}
