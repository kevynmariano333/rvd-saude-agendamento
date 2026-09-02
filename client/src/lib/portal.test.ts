import { describe, expect, it } from "vitest";
import { canSeeAttendances, formatCnpj, getAppointmentMomentForDisplay, hasConfirmedAppointmentMoment, homePathFor, isPortalGate, isPortalOperator, isPortalYard } from "./portal";

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

  it("só libera a data para status com agendamento confirmado", () => {
    expect(hasConfirmedAppointmentMoment("pending")).toBe(false);
    expect(hasConfirmedAppointmentMoment("backlog")).toBe(false);
    expect(hasConfirmedAppointmentMoment("scheduled")).toBe(true);
    expect(hasConfirmedAppointmentMoment("received")).toBe(true);
    expect(hasConfirmedAppointmentMoment("completed")).toBe(true);
  });
});

describe("formatCnpj", () => {
  it("formata um CNPJ de 14 dígitos", () => {
    expect(formatCnpj("06033403000113")).toBe("06.033.403/0001-13");
  });

  it("mantém o valor original quando não há 14 dígitos", () => {
    expect(formatCnpj("")).toBe("");
    expect(formatCnpj("123")).toBe("123");
  });

  it("aceita um valor já formatado", () => {
    expect(formatCnpj("06.033.403/0001-13")).toBe("06.033.403/0001-13");
  });
});

describe("destino inicial de cada perfil", () => {
  it("leva cada perfil para a tela em que ele trabalha", () => {
    expect(homePathFor("supplier")).toBe("/fornecedor");
    expect(homePathFor("portaria")).toBe("/portaria");
    expect(homePathFor("operacao")).toBe("/operacao");
    expect(homePathFor("operator")).toBe("/operador/dashboard");
    expect(homePathFor("admin")).toBe("/operador/dashboard");
  });

  // Sem isto, quem é da Portaria caía numa tela de agendamentos que o servidor
  // recusa e ficava vendo erro em vez da própria fila.
  it("nunca manda um perfil para uma tela que ele não pode abrir", () => {
    for (const role of ["supplier", "portaria", "operacao"] as const) {
      expect(homePathFor(role).startsWith("/operador")).toBe(false);
    }
  });
});

describe("separação de responsabilidades entre os perfis", () => {
  it("mantém portão, pátio e agendamentos separados, com o administrador em todos", () => {
    expect(isPortalGate("portaria")).toBe(true);
    expect(isPortalGate("operacao")).toBe(false);
    expect(isPortalYard("operacao")).toBe(true);
    expect(isPortalYard("portaria")).toBe(false);
    expect(isPortalOperator("portaria")).toBe(false);
    expect(isPortalOperator("operacao")).toBe(false);
    for (const check of [isPortalGate, isPortalYard, isPortalOperator]) {
      expect(check("admin")).toBe(true);
      expect(check("supplier")).toBe(false);
    }
  });

  it("deixa o pátio visível a toda a equipe interna e invisível ao fornecedor", () => {
    expect(canSeeAttendances("supplier")).toBe(false);
    for (const role of ["admin", "operator", "portaria", "operacao"] as const) {
      expect(canSeeAttendances(role)).toBe(true);
    }
  });
});
