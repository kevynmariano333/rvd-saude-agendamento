import { describe, expect, it } from "vitest";
import {
  chegouNoDia,
  compromissosDaEntrega,
  faixaDaNota,
  furouOCompromisso,
  MINIMO_PARA_RANQUEAR,
  notaFinal,
  ranquearFornecedores,
  recortarRanking,
  temDesfecho,
  type EntregaAvaliada,
  type NotaDoFornecedor,
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

describe("a data que o reagendamento apagava", () => {
  const troca = (dados: Partial<Parameters<typeof furouOCompromisso>[0]> = {}) => ({
    statusAnterior: "scheduled",
    dataAnterior: "2026-09-10T11:00:00.000Z",
    dataNova: "2026-09-17T11:00:00.000Z",
    trocadaEm: "2026-09-11T08:00:00.000Z",
    ...dados,
  });

  it("remarcar depois do dia perdido deixa a falta registrada", () => {
    // É o caso que motivou tudo: a doca separou a terça, o caminhão não veio,
    // e o reagendamento reescrevia o combinado como se a nova data sempre
    // tivesse sido a combinada.
    expect(furouOCompromisso(troca())).toBe(true);
  });

  it("remarcar antes do dia não é falta de ninguém", () => {
    expect(furouOCompromisso(troca({ trocadaEm: "2026-09-08T15:00:00.000Z" }))).toBe(false);
  });

  it("mudar a hora dentro do próprio dia combinado não fura nada", () => {
    // O dia é o que está sob o controle do fornecedor; a hora é a fila da
    // doca, igual ao que `chegouNoDia` já decidia.
    expect(furouOCompromisso(troca({ trocadaEm: "2026-09-10T18:00:00.000Z", dataNova: "2026-09-10T16:00:00.000Z" }))).toBe(false);
  });

  it("data que a nota pedia enquanto estava pendente não era compromisso", () => {
    // O fornecedor pede um dia ao mandar a nota; o balcão confirmar depois
    // dele não quer dizer que alguém faltou.
    expect(furouOCompromisso(troca({ statusAnterior: "pending" }))).toBe(false);
  });

  it("confirmar a mesma data de novo não conta falta", () => {
    expect(furouOCompromisso(troca({ dataNova: "2026-09-10T11:00:00.000Z" }))).toBe(false);
  });

  it("troca sem as duas pontas gravadas não vira acusação", () => {
    expect(furouOCompromisso(troca({ dataAnterior: null }))).toBe(false);
    expect(furouOCompromisso(troca({ dataNova: null }))).toBe(false);
    expect(furouOCompromisso(troca({ trocadaEm: null }))).toBe(false);
  });
});

describe("quantos compromissos cada entrega gerou", () => {
  it("entrega sem remarcação é um compromisso só", () => {
    expect(compromissosDaEntrega(entrega())).toEqual({ combinados: 1, cumpridos: 1 });
  });

  it("cada data furada no caminho entra como mais uma", () => {
    // Remarcada duas vezes e entregue na terceira: a doca foi preparada três
    // vezes e o caminhão veio numa. Vale 1 de 3, e não 1 de 1.
    expect(compromissosDaEntrega(entrega({ datasFuradas: 2 }))).toEqual({ combinados: 3, cumpridos: 1 });
  });

  it("a nota que furou e nunca chegou conta só as faltas", () => {
    expect(compromissosDaEntrega(entrega({ datasFuradas: 1, receivedAt: null, status: "rejected" }))).toEqual({ combinados: 1, cumpridos: 0 });
  });

  it("a nota ainda aberta vale pelas datas que já queimou", () => {
    // Remarcar devolve a nota para "agendada": ela perde o desfecho, e
    // esperar a carga chegar para contar a falta é o que fazia o fornecedor
    // que nunca apareceu sumir do ranking.
    expect(compromissosDaEntrega(entrega({ status: "scheduled", receivedAt: null, datasFuradas: 2 }))).toEqual({ combinados: 2, cumpridos: 0 });
  });

  it("entrega sem data combinada e sem falta não é cobrada", () => {
    expect(compromissosDaEntrega(entrega({ semAgendamento: true }))).toEqual({ combinados: 0, cumpridos: 0 });
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

  it("reagendar não limpa a ficha: a data perdida continua pesando", () => {
    // Quatro entregas limpas e uma que furou o dia e foi remarcada. Antes a
    // quinta chegava "no dia" e o fornecedor ficava com 100; agora são seis
    // datas combinadas e cinco cumpridas.
    const [linha] = ranquearFornecedores([...varias(4), entrega({ datasFuradas: 1 })]);
    expect(linha!.entregas).toBe(5);
    expect(linha!.comDataCombinada).toBe(6);
    expect(linha!.noPrazo).toBe(5);
    expect(linha!.datasFuradas).toBe(1);
    expect(linha!.pontualidade).toBe(83);
  });

  it("furar de novo conta de novo", () => {
    // É a regra que o balcão pediu: a segunda ausência não é a mesma falta
    // contada outra vez, é mais uma.
    const uma = ranquearFornecedores([...varias(4), entrega({ datasFuradas: 1 })])[0]!;
    const duas = ranquearFornecedores([...varias(4), entrega({ datasFuradas: 2 })])[0]!;
    expect(duas.comDataCombinada).toBe(uma.comDataCombinada + 1);
    expect(duas.noPrazo).toBe(uma.noPrazo);
    expect(duas.pontualidade!).toBeLessThan(uma.pontualidade!);
  });

  it("o fornecedor que só faltou aparece, e no topo da cobrança", () => {
    // O caso que motivou a mudança: onze notas, onze ausências, nenhuma
    // entrega — e uma lista de qualificação onde ele simplesmente não existia.
    const faltas = Array.from({ length: 11 }, () => entrega({ status: "scheduled", receivedAt: null, datasFuradas: 1 }));
    const [linha] = ranquearFornecedores(faltas);
    expect(linha!.entregas).toBe(0);
    expect(linha!.comDataCombinada).toBe(11);
    expect(linha!.datasFuradas).toBe(11);
    expect(linha!.pontualidade).toBe(0);
    // Nenhuma carga foi conferida: não há aceitação boa nem ruim para somar.
    expect(linha!.aceitacao).toBeNull();
    expect(linha!.temBase).toBe(true);
    expect(linha!.nota).toBe(0);
  });

  it("a falta acumula entrega a entrega", () => {
    const faltas = (quantas: number) => ranquearFornecedores(Array.from({ length: quantas }, () => entrega({ status: "scheduled", receivedAt: null, datasFuradas: 1 })))[0]!;
    expect(faltas(5).comDataCombinada).toBe(5);
    expect(faltas(11).comDataCombinada).toBe(11);
  });

  it("a nota aberta não dilui a recusa de quem entregou", () => {
    // Aceitação é sobre carga conferida. A nota que nunca chegou não foi
    // aceita nem recusada, e contá-la ali faria a recusa parecer menor.
    const [linha] = ranquearFornecedores([
      ...varias(4),
      entrega({ status: "rejected", receivedAt: null, rejectionReasonCode: "CARGA_AVARIADA" }),
      entrega({ status: "scheduled", receivedAt: null, datasFuradas: 1 }),
    ]);
    expect(linha!.entregas).toBe(5);
    expect(linha!.aceitacao).toBe(80);
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

describe("o que cabe no card", () => {
  const linha = (dados: Partial<NotaDoFornecedor>): NotaDoFornecedor => ({
    cnpj: "1",
    nome: "Fornecedor",
    entregas: 10,
    comDataCombinada: 10,
    noPrazo: 10,
    datasFuradas: 0,
    recusadas: 0,
    recusasPorMotivo: {},
    pontualidade: 100,
    aceitacao: 100,
    nota: 100,
    temBase: true,
    ...dados,
  });

  it("não corta ninguém quando todos cabem", () => {
    const poucos = [linha({ cnpj: "a" }), linha({ cnpj: "b" })];
    expect(recortarRanking(poucos, 12)).toEqual(poucos);
  });

  it("quem furou data nunca é cortado, por pior que seja a nota", () => {
    // É o fim da ordem que a tesoura pegava — e é lá que fica o fornecedor
    // que não apareceu nenhuma vez.
    const otimos = Array.from({ length: 12 }, (_, i) => linha({ cnpj: `otimo-${i}` }));
    const faltoso = linha({ cnpj: "faltoso", nota: 0, datasFuradas: 11, noPrazo: 0, entregas: 0 });
    const mostradas = recortarRanking([...otimos, faltoso], 12);
    expect(mostradas).toHaveLength(12);
    expect(mostradas.map(l => l.cnpj)).toContain("faltoso");
  });

  it("o corte come a ponta de cima, onde a informação se repete", () => {
    const otimos = Array.from({ length: 12 }, (_, i) => linha({ cnpj: `otimo-${i}` }));
    const faltoso = linha({ cnpj: "faltoso", nota: 0, datasFuradas: 3, entregas: 0 });
    const mostradas = recortarRanking([...otimos, faltoso], 12);
    // Sai o último dos ótimos, não o que precisa ser cobrado.
    expect(mostradas.map(l => l.cnpj)).not.toContain("otimo-11");
    expect(mostradas[mostradas.length - 1]!.cnpj).toBe("faltoso");
  });

  it("com faltosos demais, ficam os que mais furaram", () => {
    const faltosos = Array.from({ length: 15 }, (_, i) => linha({ cnpj: `faltoso-${i}`, datasFuradas: i + 1, nota: 10 }));
    const mostradas = recortarRanking(faltosos, 12);
    expect(mostradas).toHaveLength(12);
    expect(mostradas.map(l => l.cnpj)).toContain("faltoso-14");
    expect(mostradas.map(l => l.cnpj)).not.toContain("faltoso-0");
  });

  it("a ordem de exibição continua a do ranking", () => {
    const linhas = [linha({ cnpj: "a" }), linha({ cnpj: "b", datasFuradas: 2, nota: 40 }), linha({ cnpj: "c" })];
    expect(recortarRanking(linhas, 2).map(l => l.cnpj)).toEqual(["a", "b"]);
  });
});
