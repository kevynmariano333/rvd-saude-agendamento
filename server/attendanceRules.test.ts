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

  // Quem cuida da agenda é quem recebe a carga: o operador autoriza o
  // recebimento e libera a doca. A portaria continua só no portão.
  it("dá a autorização do recebimento a quem cuida da agenda", () => {
    expect(canManageOperation("operator")).toBe(true);
    expect(canManageOperation("operacao")).toBe(true);
    expect(canManageOperation("admin")).toBe(true);
    expect(canManageOperation("portaria")).toBe(false);
    expect(canManageOperation("supplier")).toBe(false);
  });

  it("mantém o pátio interno e invisível ao fornecedor", () => {
    for (const role of ["portaria", "operacao", "operator", "admin"] as const) {
      expect(canViewAttendances(role)).toBe(true);
    }
    expect(canViewAttendances("supplier")).toBe(false);
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
      "cliente_retira",
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
    for (const role of ["operacao", "operator"] as const) {
      expect(canPerformAttendanceAction(role, "liberar")).toBe(true);
      expect(canPerformAttendanceAction(role, "iniciar")).toBe(false);
      expect(canPerformAttendanceAction(role, "concluir")).toBe(false);
    }
    for (const action of ["iniciar", "liberar", "concluir"] as const) {
      expect(canPerformAttendanceAction("admin", action)).toBe(true);
      expect(canPerformAttendanceAction("supplier", action)).toBe(false);
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
