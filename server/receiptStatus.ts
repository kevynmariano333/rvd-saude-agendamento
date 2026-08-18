import type { AppointmentStatus } from "../drizzle/schema";

export function getReceiptTimestampForStatus(status: AppointmentStatus, now = new Date()) {
  return status === "received" ? now : undefined;
}
