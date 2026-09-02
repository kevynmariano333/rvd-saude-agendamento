import { describe, expect, it } from "vitest";
import {
  canManageOperation,
  canManagePortaria,
  canPerformAttendanceAction,
  canViewAttendances,
  classificationDetailsFor,
  isValidClassificationDetail,
  validateEntryDecision,
  validateOperationalTransition,
} from "./attendanceRules";

describe("perfis operacionais", () => {
  it("limita a Portaria às ações de entrada", () => {
    expect(canManagePortaria("portaria")).toBe(true);
    expect(canManagePortaria("operacao")).toBe(false);
    expect(canManagePortaria("operator")).toBe(false);
    expect(canManagePortaria("admin")).toBe(true);
  });

  it("limita a Operação às ações de atendimento", () => {
    expect(canManageOperation("operacao")).toBe(true);
    expect(canManageOperation("portaria")).toBe(false);
    expect(canManageOperation("admin")).toBe(true);
  });

  it("mantém o pátio com quem trabalha nele", () => {
    expect(canViewAttendances("portaria")).toBe(true);
    expect(canViewAttendances("operacao")).toBe(true);
    expect(canViewAttendances("admin")).toBe(true);
    // Fornecedor e operador de agendamentos têm os seus próprios postos.
    expect(canViewAttendances("supplier")).toBe(false);
    expect(canViewAttendances("operator")).toBe(false);
  });
});

describe("classificações", () => {
  it("aceita somente os subtipos coerentes com cada classificação", () => {
    expect(isValidClassificationDetail("amil", "maternidade")).toBe(true);
    expect(isValidClassificationDetail("amil", "hospital")).toBe(true);
    expect(isValidClassificationDetail("rvd", "correios")).toBe(true);
    expect(isValidClassificationDetail("rvd", "jamef")).toBe(true);
    expect(isValidClassificationDetail("rvd", "mercado_livre")).toBe(true);
    expect(isValidClassificationDetail("llt", "nao_aplicavel")).toBe(true);
    expect(isValidClassificationDetail("amil", "correios")).toBe(false);
    expect(isValidClassificationDetail("llt", "hospital")).toBe(false);
  });

  it("oferece apenas os subtipos válidos de cada classificação", () => {
    expect(classificationDetailsFor("amil")).toEqual(["maternidade", "hospital"]);
    expect(classificationDetailsFor("rvd")).toEqual([
      "correios",
      "braspress",
      "excargo",
      "rodonaves",
      "br4",
      "jamef",
      "mercado_livre",
    ]);
    expect(classificationDetailsFor("llt")).toEqual(["nao_aplicavel"]);
  });

  it("mantém coerência entre a lista oferecida e a validação", () => {
    for (const classification of ["amil", "llt", "rvd"] as const) {
      for (const detail of classificationDetailsFor(classification)) {
        expect(isValidClassificationDetail(classification, detail)).toBe(true);
      }
    }
  });
});

describe("decisão de entrada", () => {
  it("exige justificativa ao recusar um caminhão", () => {
    expect(validateEntryDecision("aguardando", "recusar", "")).toBe("O motivo da recusa é obrigatório.");
    expect(validateEntryDecision("aguardando", "recusar", "   ")).toBe("O motivo da recusa é obrigatório.");
    expect(validateEntryDecision("aguardando", "recusar", "Documentação incompleta")).toBeNull();
  });

  it("aceita a aprovação sem justificativa", () => {
    expect(validateEntryDecision("aguardando", "aprovar")).toBeNull();
  });

  it("impede nova decisão após alteração de status", () => {
    expect(validateEntryDecision("aprovado", "recusar", "Qualquer motivo")).toBe(
      "Somente atendimentos aguardando podem receber uma decisão de entrada."
    );
    expect(validateEntryDecision("concluido", "aprovar")).toBe(
      "Somente atendimentos aguardando podem receber uma decisão de entrada."
    );
  });
});

describe("fluxo operacional", () => {
  it("permite somente a sequência iniciar, liberar e concluir", () => {
    expect(validateOperationalTransition("aprovado", "iniciar")).toBeNull();
    expect(validateOperationalTransition("em_atendimento", "liberar")).toBeNull();
    expect(validateOperationalTransition("liberado", "concluir")).toBeNull();
  });

  it("não deixa registrar a saída antes da liberação da doca", () => {
    expect(validateOperationalTransition("em_atendimento", "concluir")).toBe(
      "Esta ação não está disponível para o status atual do atendimento."
    );
  });

  it("dá cada etapa a quem trabalha nela", () => {
    // O portão abre a entrada e fecha a saída; a doca fica no meio.
    expect(canPerformAttendanceAction("portaria", "iniciar")).toBe(true);
    expect(canPerformAttendanceAction("portaria", "concluir")).toBe(true);
    expect(canPerformAttendanceAction("portaria", "liberar")).toBe(false);
    expect(canPerformAttendanceAction("operacao", "liberar")).toBe(true);
    expect(canPerformAttendanceAction("operacao", "iniciar")).toBe(false);
    expect(canPerformAttendanceAction("operacao", "concluir")).toBe(false);
    for (const action of ["iniciar", "liberar", "concluir"] as const) {
      expect(canPerformAttendanceAction("admin", action)).toBe(true);
      expect(canPerformAttendanceAction("operator", action)).toBe(false);
    }
  });

  it("bloqueia ações fora da ordem do pátio", () => {
    const message = "Esta ação não está disponível para o status atual do atendimento.";
    expect(validateOperationalTransition("aguardando", "iniciar")).toBe(message);
    expect(validateOperationalTransition("recusado", "iniciar")).toBe(message);
    expect(validateOperationalTransition("aprovado", "liberar")).toBe(message);
    expect(validateOperationalTransition("concluido", "concluir")).toBe(message);
  });
});
