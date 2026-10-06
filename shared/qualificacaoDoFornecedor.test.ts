import { describe, expect, it } from "vitest";
import {
  chegouNoDia,
  faixaDaNota,
  MINIMO_PARA_RANQUEAR,
  notaFinal,
  ranquearFornecedores,
  temDesfecho,
  type EntregaAvaliada,
} from "./qualificacaoDoFornecedor";

const entrega = (dados: Partial<EntregaAvaliada> = {}): EntregaAvaliada => ({
  cnpj: "12420164000580",
  nome: "CM HOSPITALAR S.A.",
  status: "completed",
  scheduledFor: "2026-09-10T11:00:00.000Z",
  receivedAt: "2026-09-10T14:30:00.000Z",
  ...dados,
});

describe("chegou no dia combinado", () => {
  it("o dia conta, a hora não", () => {
    // Cobrar o horário exato puniria o fornecedor pela fila da doca: quem
    // chega às 8h e é descarregado às 11h não atrasou.
    expect(chegouNoDia(entrega())).toBe(true);
  });

  it("chegar noutro dia é atraso", () => {
    expect(chegouNoDia(entrega({ receivedAt: "2026-09-11T09:00:00.000Z" }))).toBe(false);
  });

  it("nota que nunca teve data combinada não entra na conta", () => {
    // O horário gravado ali é o do clique de quem registrou a carga avulsa.
    // Contar aquilo como compromisso cobraria do fornecedor uma hora que
    // ninguém marcou com ele.
    expect(chegouNoDia(entrega({ semAgendamento: true }))).toBeNull();
  });

  it("entrega que ainda não chegou não é julgada", () => {
    expect(chegouNoDia(entrega({ receivedAt: null }))).toBeNull();
  });
});

describe("quais entregas são julgadas", () => {
  it("recebida, concluída e recusada têm desfecho", () => {
    for (const status of ["received", "completed", "rejected"]) {
      expect(temDesfecho(entrega({ status }))).toBe(true);
    }
  });

  it("o que ainda está em aberto não conta contra ninguém", () => {
    for (const status of ["pending", "scheduled", "backlog"]) {
      expect(temDesfecho(entrega({ status }))).toBe(false);
    }
  });
});

describe("a nota final", () => {
  it("pontualidade e aceitação pesam igual", () => {
    expect(notaFinal(80, 100)).toBe(90);
    expect(notaFinal(100, 100)).toBe(100);
  });

  it("sem pontualidade para medir, a nota é só a aceitação", () => {
    // Não é zero: o fornecedor não falhou numa data que nunca foi marcada.
    expect(notaFinal(null, 90)).toBe(90);
  });

  it("a faixa traduz o número", () => {
    expect(faixaDaNota(97)).toBe("ótimo");
    expect(faixaDaNota(88)).toBe("bom");
    expect(faixaDaNota(75)).toBe("atenção");
    expect(faixaDaNota(40)).toBe("crítico");
    expect(faixaDaNota(null)).toBe("sem base");
  });
});

describe("o ranking", () => {
  const varias = (quantas: number, dados: Partial<EntregaAvaliada> = {}) =>
    Array.from({ length: quantas }, () => entrega(dados));

  it("agrupa pelo emitente da nota, não por quem lançou o agendamento", () => {
    // Foi assim que o operador do sistema apareceu em primeiro lugar num
    // ranking de fornecedores: o card agrupava pela conta que criou a nota.
    const linhas = ranquearFornecedores([
      ...varias(5, { cnpj: "11111111111111", nome: "BBRAUN" }),
      ...varias(5, { cnpj: "22222222222222", nome: "BAXTER" }),
    ]);
    expect(linhas.map(l => l.nome)).toEqual(["BBRAUN", "BAXTER"]);
  });

  it("entrega sem emitente identificado fica de fora", () => {
    expect(ranquearFornecedores(varias(5, { cnpj: null }))).toEqual([]);
    expect(ranquearFornecedores(varias(5, { cnpj: "   " }))).toEqual([]);
  });

  it("conta pontualidade só sobre as entregas com data combinada", () => {
    const [linha] = ranquearFornecedores([
      ...varias(3),
      ...varias(2, { semAgendamento: true }),
    ]);
    expect(linha!.entregas).toBe(5);
    expect(linha!.comDataCombinada).toBe(3);
    expect(linha!.pontualidade).toBe(100);
  });

  it("a recusa derruba a aceitação e aparece separada por motivo", () => {
    const [linha] = ranquearFornecedores([
      ...varias(8),
      ...varias(2, { status: "rejected", rejectionReasonCode: "CARGA_AVARIADA" }),
    ]);
    expect(linha!.recusadas).toBe(2);
    expect(linha!.aceitacao).toBe(80);
    expect(linha!.recusasPorMotivo).toEqual({ CARGA_AVARIADA: 2 });
  });

  it("recusa antiga sem código não some: entra como sem código", () => {
    const [linha] = ranquearFornecedores([...varias(4), entrega({ status: "rejected" })]);
    expect(linha!.recusasPorMotivo).toEqual({ SEM_CODIGO: 1 });
  });

  it("quem tem pouco volume não é ranqueado por acaso", () => {
    // Com duas entregas, uma recusa derruba a nota para 50 e o fornecedor
    // aparece em último — sem ninguém saber se é padrão ou dia ruim.
    const [linha] = ranquearFornecedores(varias(MINIMO_PARA_RANQUEAR - 1));
    expect(linha!.temBase).toBe(false);
    expect(linha!.nota).toBeNull();
  });

  it("quem tem base vem antes de quem não tem, mesmo com nota pior", () => {
    const linhas = ranquearFornecedores([
      ...varias(6, { cnpj: "11111111111111", nome: "COM BASE" }),
      ...varias(5, { cnpj: "11111111111111", nome: "COM BASE", status: "rejected" }),
      ...varias(2, { cnpj: "22222222222222", nome: "POUCO VOLUME" }),
    ]);
    expect(linhas.map(l => l.nome)).toEqual(["COM BASE", "POUCO VOLUME"]);
    expect(linhas[0]!.temBase).toBe(true);
    expect(linhas[1]!.temBase).toBe(false);
  });

  it("ordena do melhor para o pior entre quem tem base", () => {
    const linhas = ranquearFornecedores([
      ...varias(5, { cnpj: "11111111111111", nome: "PONTUAL" }),
      ...varias(4, { cnpj: "22222222222222", nome: "ATRASADO", receivedAt: "2026-09-12T09:00:00.000Z" }),
      ...varias(1, { cnpj: "22222222222222", nome: "ATRASADO" }),
    ]);
    expect(linhas.map(l => l.nome)).toEqual(["PONTUAL", "ATRASADO"]);
    expect(linhas[0]!.nota).toBe(100);
    expect(linhas[1]!.nota).toBe(60);
  });

  it("o que está em aberto não entra na conta de ninguém", () => {
    const linhas = ranquearFornecedores(varias(5, { status: "scheduled" }));
    expect(linhas).toEqual([]);
  });
});
