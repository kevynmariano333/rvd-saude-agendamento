import { describe, expect, it } from "vitest";
import { canConfirmSchedule, canMoveAppointmentStatus, canTreatBacklog, ehSomenteLeitura, podeExecutar, canRequestAppointment, canRescueAppointment, canScheduleAppointment, canSuggestSchedule, canTransitionAppointment, isOperator, isSchedulingDesk } from "./permissions";
import { buildScopeIds, isWithinScope } from "./supplierScope";

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

describe("escopo por empresa", () => {
  it("nunca deixa um escopo vazio virar acesso total", () => {
    // The listing helpers must treat an empty id list as "sees nothing"; the
    // opposite reading would expose every supplier's records at once.
    expect(buildScopeIds(5, [])).toEqual([5]);
    expect(isWithinScope([], 5)).toBe(false);
  });

  it("isola logins de empresas diferentes", () => {
    const acme = buildScopeIds(1, [1, 2]);
    const outra = buildScopeIds(3, [3, 4]);
    expect(isWithinScope(acme, 3)).toBe(false);
    expect(isWithinScope(outra, 1)).toBe(false);
  });
});

describe("planejador", () => {
  it("trabalha a agenda, mas não crava a data", () => {
    expect(isSchedulingDesk("planejador")).toBe(true);
    // Receber e recusar são declarações sobre o que aconteceu na doca: ficam
    // com quem responde pela doca.
    expect(canMoveAppointmentStatus("planejador")).toBe(false);
    expect(canSuggestSchedule("planejador")).toBe(true);
    // Agendar é o compromisso com o fornecedor: continua sendo do Operador.
    expect(canConfirmSchedule("planejador")).toBe(false);
  });

  it("o perfil de consulta lê a agenda e não age em nada", () => {
    expect(isSchedulingDesk("planejador_leitura")).toBe(true);
    expect(canConfirmSchedule("planejador_leitura")).toBe(false);
    expect(canSuggestSchedule("planejador_leitura")).toBe(false);
    expect(canMoveAppointmentStatus("planejador_leitura")).toBe(false);
    expect(canTreatBacklog("planejador_leitura")).toBe(false);
    expect(canRequestAppointment("planejador_leitura")).toBe(false);
  });

  it("a trava é por negação: ação nova nasce barrada para quem só consulta", () => {
    // O contrário — listar o que é proibido — deixaria passar sozinha cada
    // rota nova que alguém escrevesse depois.
    expect(podeExecutar("planejador_leitura", "appointments.schedule")).toBe(false);
    expect(podeExecutar("planejador_leitura", "messages.send")).toBe(false);
    expect(podeExecutar("planejador_leitura", "internalNotes.create")).toBe(false);
    expect(podeExecutar("planejador_leitura", "rota.que.ainda.nao.existe")).toBe(false);
  });

  it("ainda cuida da própria conta e do que já olhou", () => {
    for (const acao of ["auth.changePassword", "auth.updateName", "auth.definirSituacao", "internalNotes.marcarLida", "messages.limparAvisos"]) {
      expect(podeExecutar("planejador_leitura", acao)).toBe(true);
    }
  });

  it("os outros perfis não são tocados pela trava", () => {
    for (const perfil of ["admin", "operator", "planejador", "supplier", "portaria", "operacao"] as const) {
      expect(podeExecutar(perfil, "appointments.schedule")).toBe(true);
      expect(ehSomenteLeitura(perfil)).toBe(false);
    }
  });

  it("o administrador tem tudo, inclusive o que é do planejador", () => {
    // Ele responde pelo sistema inteiro, e em equipe pequena é quem cobre o
    // planejamento quando não há planejador na mesa.
    expect(isSchedulingDesk("admin")).toBe(true);
    expect(canConfirmSchedule("admin")).toBe(true);
    expect(canMoveAppointmentStatus("admin")).toBe(true);
    expect(canTreatBacklog("admin")).toBe(true);
    // A que faltava: propor data sem marcá-la.
    expect(canSuggestSchedule("admin")).toBe(true);
  });

  it("marcar continua sendo do operador, e o fornecedor não ganha nada com isso", () => {
    expect(canSuggestSchedule("operator")).toBe(false);
    expect(canSuggestSchedule("portaria")).toBe(false);
    expect(canSuggestSchedule("operacao")).toBe(false);
    expect(canConfirmSchedule("supplier")).toBe(false);
  });

  it("não se confunde com o operador nem com o fornecedor", () => {
    expect(isOperator("planejador")).toBe(false);
    expect(canRequestAppointment("planejador")).toBe(false);
    expect(isSchedulingDesk("portaria")).toBe(false);
    expect(isSchedulingDesk("operacao")).toBe(false);
    expect(isSchedulingDesk("supplier")).toBe(false);
  });
});
