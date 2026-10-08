import { describe, expect, it } from "vitest";
import { dataQueValeNoCalendario, notasDoCalendario, propostasNoPeriodo , volumesDasNotas } from "./dataDoCalendario";

const setembro = { inicio: new Date("2026-09-01T00:00:00Z"), fim: new Date("2026-09-30T23:59:59Z") };
const outubro = { inicio: new Date("2026-10-01T00:00:00Z"), fim: new Date("2026-10-31T23:59:59Z") };

const pendente = { id: 1, status: "pending", scheduledFor: new Date("2026-09-29T10:00:00Z") };
const agendada = { id: 2, status: "scheduled", scheduledFor: new Date("2026-09-29T10:00:00Z") };
const proposta = { appointmentId: 1, suggestedFor: new Date("2026-10-01T14:00:00Z") };

describe("a data que vale no calendário", () => {
  it("usa a data proposta quando a nota ainda está pendente", () => {
    expect(dataQueValeNoCalendario(pendente, proposta.suggestedFor)).toEqual(proposta.suggestedFor);
  });

  it("ignora proposta em nota já agendada: o combinado não se desloca", () => {
    expect(dataQueValeNoCalendario(agendada, proposta.suggestedFor)).toEqual(agendada.scheduledFor);
  });

  it("sem proposta, fica no agendamento", () => {
    expect(dataQueValeNoCalendario(pendente, undefined)).toEqual(pendente.scheduledFor);
  });
});

describe("as notas do mês", () => {
  it("tira do mês a pendente que foi proposta para outro", () => {
    const linhas = notasDoCalendario([pendente], [proposta], setembro.inicio, setembro.fim);
    expect(linhas).toEqual([]);
  });

  it("coloca a pendente no mês da proposta, e no dia dela", () => {
    const linhas = notasDoCalendario([pendente], [proposta], outubro.inicio, outubro.fim);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].dataDoCalendario).toEqual(proposta.suggestedFor);
  });

  it("mantém a agendada no dia cravado, mesmo com proposta em aberto", () => {
    const linhas = notasDoCalendario([agendada], [{ ...proposta, appointmentId: 2 }], setembro.inicio, setembro.fim);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].dataDoCalendario).toEqual(agendada.scheduledFor);
  });

  it("não repete a nota que veio pelas duas buscas", () => {
    const linhas = notasDoCalendario([pendente, pendente], [], setembro.inicio, setembro.fim);
    expect(linhas).toHaveLength(1);
  });

  it("entrega em ordem de dia", () => {
    const tarde = { id: 3, status: "scheduled", scheduledFor: new Date("2026-09-30T08:00:00Z") };
    const linhas = notasDoCalendario([tarde, agendada], [], setembro.inicio, setembro.fim);
    expect(linhas.map(linha => linha.id)).toEqual([2, 3]);
  });
});

describe("as propostas do período", () => {
  it("devolve só as notas propostas para dentro dele", () => {
    expect(propostasNoPeriodo([proposta], outubro.inicio, outubro.fim)).toEqual([1]);
    expect(propostasNoPeriodo([proposta], setembro.inicio, setembro.fim)).toEqual([]);
  });
});

describe("os volumes do dia", () => {
  it("soma o que as notas trazem", () => {
    // Cinco notas de uma caixa ocupam a doca por vinte minutos; uma nota de
    // trezentos volumes toma a manhã inteira. O número de notas não diz isso.
    expect(volumesDasNotas([{ invoiceVolumeCount: 12 }, { invoiceVolumeCount: 300 }])).toEqual({ total: 312, semContagem: 0 });
  });

  it("nota sem contagem não vira zero: volta contada à parte", () => {
    // Zero diria que a carga é vazia; o que houve é que ninguém informou.
    expect(volumesDasNotas([{ invoiceVolumeCount: 10 }, { invoiceVolumeCount: null }, {}])).toEqual({ total: 10, semContagem: 2 });
  });

  it("valor estragado no banco não contamina a soma", () => {
    expect(volumesDasNotas([{ invoiceVolumeCount: -5 }, { invoiceVolumeCount: 0 }, { invoiceVolumeCount: 7.8 }])).toEqual({ total: 7, semContagem: 2 });
  });

  it("dia sem nota nenhuma soma zero", () => {
    expect(volumesDasNotas([])).toEqual({ total: 0, semContagem: 0 });
  });
});
