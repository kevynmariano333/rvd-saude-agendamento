import { describe, expect, it } from "vitest";
import { createAppointmentValidationToken, readAppointmentValidationToken } from "./appointmentValidation";

describe("código público de validação do agendamento", () => {
  const secret = "segredo-de-validacao-teste";
  const payload = { appointmentId: 42, scheduledForTimestamp: 1_787_111_200_000 };

  it("recupera os dados de um QR assinado", () => {
    const token = createAppointmentValidationToken(payload, secret);
    expect(readAppointmentValidationToken(token, secret)).toEqual(payload);
  });

  it("recusa um código alterado", () => {
    const token = createAppointmentValidationToken(payload, secret);
    expect(readAppointmentValidationToken(`${token}x`, secret)).toBeNull();
  });
});
