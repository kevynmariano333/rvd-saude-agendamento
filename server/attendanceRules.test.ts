import { describe, expect, it } from "vitest";
import {
  canManageOperation,
  canManagePortaria,
  canPerformAttendanceAction,
  canViewAttendances,
  canViewGateHistory,
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
    // O planejador cuida da agenda, não da doca: o pátio fica fora do perfil.
    expect(canViewAttendances("planejador")).toBe(false);
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
      "dibpel",
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

describe("histórico do portão", () => {
  it("é de quem responde pelo conjunto, não de quem trabalha o turno", () => {
    expect(canViewGateHistory("operator")).toBe(true);
    expect(canViewGateHistory("admin")).toBe(true);
    // Portaria e Operação têm uma tela cada: registrar, decidir, conduzir.
    expect(canViewGateHistory("portaria")).toBe(false);
    expect(canViewGateHistory("operacao")).toBe(false);
    expect(canViewGateHistory("planejador")).toBe(false);
    expect(canViewGateHistory("supplier")).toBe(false);
  });

  it("não tira de nenhuma das duas a própria tela", () => {
    // Elas continuam precisando da fila do pátio para trabalhar o turno.
    expect(canViewAttendances("portaria")).toBe(true);
    expect(canViewAttendances("operacao")).toBe(true);
  });
});
