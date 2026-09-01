import type { AttendanceServiceType, AttendanceStatus } from "../drizzle/schema";

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
  const startOfDay = new Date(referenceTime);
  startOfDay.setHours(0, 0, 0, 0);

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
  const arrivedToday = records.filter(record => record.arrivalAt >= startOfDay);

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
