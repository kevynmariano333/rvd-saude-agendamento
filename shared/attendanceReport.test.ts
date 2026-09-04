import { describe, expect, it } from "vitest";
import {
  formatMinutes,
  gateReportColumns,
  minutesBetween,
  reportDate,
  reportTime,
  toGateReportRow,
} from "./attendanceReport";

const labels = {
  status: (value: string) => ({ concluido: "Concluído", aguardando: "Aguardando" })[value] ?? value,
  serviceType: (value: string) => (value === "coleta" ? "Coleta" : "Recebimento"),
  classification: () => "RVD · Braspress",
};

function source(overrides: Record<string, unknown> = {}) {
  return {
    protocol: "PRT-260902-AB12X",
    driverName: "João da Silva",
    driverDocument: "12.345.678-9",
    licensePlate: "ABC1D23",
    supplierName: "Braspress",
    serviceType: "recebimento" as const,
    classification: "rvd" as const,
    classificationDetail: "braspress",
    status: "concluido",
    dockNumber: 2,
    invoiceNumbersJson: JSON.stringify(["123456", "123457"]),
    refusalReason: null,
    notes: null,
    // 08:00 em São Paulo é 11:00 em UTC.
    arrivalAt: new Date("2026-09-02T11:00:00.000Z"),
    decisionAt: new Date("2026-09-02T11:12:00.000Z"),
    enteredAt: new Date("2026-09-02T11:20:00.000Z"),
    releasedAt: new Date("2026-09-02T12:05:00.000Z"),
    concludedAt: new Date("2026-09-02T12:15:00.000Z"),
    ...overrides,
  };
}

describe("linhas do histórico do portão", () => {
  it("leva cada tempo escrito e em minutos", () => {
    const row = toGateReportRow(source(), labels);

    expect(row["Permanência"]).toBe("1h 15min");
    expect(row["Permanência (min)"]).toBe(75);
    expect(row["Espera pela Operação (min)"]).toBe(12);
    expect(row["Tempo na doca (min)"]).toBe(45);
  });

  // Rodando em UTC, um horário sem fuso mostraria 11:00 para um caminhão que
  // chegou às 8 da manhã no Brasil.
  it("escreve data e hora no fuso de São Paulo", () => {
    const row = toGateReportRow(source(), labels);

    expect(row.Data).toBe("02/09/2026");
    expect(row.Chegada).toBe("08:00");
    expect(row.Entrada).toBe("08:20");
    expect(row["Saída"]).toBe("09:15");
  });

  it("deixa em branco o tempo que ainda não aconteceu", () => {
    const row = toGateReportRow(
      source({ status: "aguardando", decisionAt: null, enteredAt: null, releasedAt: null, concludedAt: null }),
      labels
    );

    expect(row["Saída"]).toBe("");
    expect(row["Permanência"]).toBe("");
    expect(row["Permanência (min)"]).toBe("");
    expect(row["Espera pela Operação (min)"]).toBe("");
    expect(row.Status).toBe("Aguardando");
  });

  it("junta as notas do mesmo motorista numa célula", () => {
    expect(toGateReportRow(source(), labels).Notas).toBe("123456, 123457");
    expect(toGateReportRow(source({ invoiceNumbersJson: null }), labels).Notas).toBe("");
    // Um JSON quebrado no banco não pode derrubar a exportação inteira.
    expect(toGateReportRow(source({ invoiceNumbersJson: "{quebrado" }), labels).Notas).toBe("");
  });

  it("não inventa campo que o atendimento não tem", () => {
    const row = toGateReportRow(source({ supplierName: null, dockNumber: null }), labels, {
      includeDriverDocument: true,
    });

    expect(row.Fornecedor).toBe("");
    expect(row.Doca).toBe("");
  });

  // O RG é dado pessoal: fora da planilha do administrador a coluna não
  // existe, em vez de existir vazia — uma coluna "RG" em branco convida a
  // preencher à mão o que o portal decidiu não entregar.
  it("leva o RG só quando quem exporta pode vê-lo", () => {
    expect(toGateReportRow(source(), labels)).not.toHaveProperty("RG");
    expect(toGateReportRow(source(), labels, { includeDriverDocument: true }).RG).toBe("12.345.678-9");
    expect(gateReportColumns().some(column => column.key === "RG")).toBe(false);
    expect(gateReportColumns({ includeDriverDocument: true }).some(column => column.key === "RG")).toBe(true);
  });
});

describe("cálculo de tempo", () => {
  it("arredonda para minutos inteiros", () => {
    expect(minutesBetween("2026-09-02T11:00:00.000Z", "2026-09-02T11:00:40.000Z")).toBe(1);
  });

  // Um relógio fora de hora poderia gravar uma saída antes da chegada; um
  // número negativo na planilha estragaria qualquer média.
  it("descarta um intervalo negativo", () => {
    expect(minutesBetween("2026-09-02T12:00:00.000Z", "2026-09-02T11:00:00.000Z")).toBe("");
  });

  it("escreve horas e minutos", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(95)).toBe("1h 35min");
    expect(formatMinutes("")).toBe("");
  });

  it("não quebra com data inválida", () => {
    expect(reportDate("não é data")).toBe("");
    expect(reportTime(null)).toBe("");
    expect(minutesBetween("não é data", new Date())).toBe("");
  });
});
