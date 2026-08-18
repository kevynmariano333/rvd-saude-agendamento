import { createHmac, timingSafeEqual } from "node:crypto";

export type AppointmentValidationPayload = {
  appointmentId: number;
  scheduledForTimestamp: number;
};

function signatureFor(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createAppointmentValidationToken(payload: AppointmentValidationPayload, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signatureFor(encodedPayload, secret)}`;
}

export function readAppointmentValidationToken(token: string, secret: string): AppointmentValidationPayload | null {
  const [encodedPayload, signature, extraSegment] = token.split(".");
  if (!encodedPayload || !signature || extraSegment) return null;
  const expectedSignature = signatureFor(encodedPayload, secret);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AppointmentValidationPayload;
    if (!Number.isInteger(decoded.appointmentId) || decoded.appointmentId <= 0 || !Number.isFinite(decoded.scheduledForTimestamp)) return null;
    return decoded;
  } catch {
    return null;
  }
}
