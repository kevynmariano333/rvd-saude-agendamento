import { describe, expect, it } from "vitest";
import {
  canManageOperation,
  canManagePortaria,
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

  it("mantém o pátio fora do alcance do fornecedor", () => {
    expect(canViewAttendances("supplier")).toBe(false);
    expect(canViewAttendances("operator")).toBe(true);
    expect(canViewAttendances("portaria")).toBe(true);
  });
});

describe("classificações", () => {
  it("aceita somente os subtipos coerentes com cada classificação", () => {
    expect(isValidClassificationDetail("amil", "maternidade")).toBe(true);
    expect(isValidClassificationDetail("amil", "hospital")).toBe(true);
    expect(isValidClassificationDetail("rvd", "sedex")).toBe(true);
    expect(isValidClassificationDetail("rvd", "mercado_livre")).toBe(true);
    expect(isValidClassificationDetail("llt", "nao_aplicavel")).toBe(true);
    expect(isValidClassificationDetail("amil", "sedex")).toBe(false);
    expect(isValidClassificationDetail("llt", "hospital")).toBe(false);
  });

  it("oferece apenas os subtipos válidos de cada classificação", () => {
    expect(classificationDetailsFor("amil")).toEqual(["maternidade", "hospital"]);
    expect(classificationDetailsFor("rvd")).toEqual(["sedex", "mercado_livre"]);
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
    expect(validateOperationalTransition("em_atendimento", "concluir")).toBeNull();
    expect(validateOperationalTransition("liberado", "concluir")).toBeNull();
  });

  it("bloqueia ações fora da ordem do pátio", () => {
    const message = "Esta ação não está disponível para o status atual do atendimento.";
    expect(validateOperationalTransition("aguardando", "iniciar")).toBe(message);
    expect(validateOperationalTransition("recusado", "iniciar")).toBe(message);
    expect(validateOperationalTransition("aprovado", "liberar")).toBe(message);
    expect(validateOperationalTransition("concluido", "concluir")).toBe(message);
  });
});
