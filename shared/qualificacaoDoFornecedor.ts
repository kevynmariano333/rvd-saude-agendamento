// Como se mede um fornecedor com o que o sistema já gravou.
//
// A tentação é criar uma tela de avaliação para alguém preencher nota de 1 a 5
// depois de cada entrega. Isso não é preenchido: quem recebe carga está com o
// caminhão na doca, não com o formulário. Um mês depois a tela tem três
// avaliações e nenhuma serve de argumento numa reunião com o fornecedor.
//
// O que o sistema já sabe, porque foi registrado no trabalho do dia, responde
// as duas perguntas que a operação faz: ele vem no dia combinado, e a carga
// dele presta? A primeira sai da comparação entre a data agendada e a data em
// que a carga entrou. A segunda sai das recusas.

import { apenasDigitos } from "./recipients";

/** O que cada entrega contribui para a nota do fornecedor. */
export type EntregaAvaliada = {
  cnpj: string | null;
  nome: string | null;
  status: string;
  scheduledFor: Date | string | null;
  receivedAt: Date | string | null;
  /** O horário agendado nunca foi combinado — não dá para cobrar pontualidade. */
  semAgendamento?: boolean | null;
  rejectionReasonCode?: string | null;
  /**
   * Quantas datas já confirmadas passaram sem a carga chegar.
   *
   * Vem do histórico da nota, e não do estado dela: o reagendamento apaga a
   * data antiga do cadastro, e sem este número a entrega remarcada três vezes
   * fica indistinguível da que foi combinada uma vez e cumprida.
   */
  datasFuradas?: number | null;
};

/**
 * Quantas entregas um fornecedor precisa ter para entrar no ranking.
 *
 * Com duas entregas, uma recusa derruba a nota para 50 e o fornecedor aparece
 * em último lugar — sem que ninguém saiba se aquilo é um padrão ou um dia
 * ruim. Quem tem pouco volume continua na lista, marcado como sem base
 * suficiente, em vez de ser ranqueado por acaso.
 */
export const MINIMO_PARA_RANQUEAR = 5;

export type NotaDoFornecedor = {
  cnpj: string;
  nome: string;
  /** Entregas que chegaram a um desfecho: recebidas, concluídas ou recusadas. */
  entregas: number;
  /** Quantas tinham data combinada — só essas valem para pontualidade. */
  comDataCombinada: number;
  noPrazo: number;
  /** Datas confirmadas que passaram em branco, somadas as de todas as entregas. */
  datasFuradas: number;
  recusadas: number;
  recusasPorMotivo: Record<string, number>;
  /** 0 a 100, ou null quando não há data combinada para medir. */
  pontualidade: number | null;
  /**
   * 0 a 100: a proporção de entregas que não acabaram recusadas.
   *
   * Null quando nenhuma entrega chegou a um desfecho no período — é o caso do
   * fornecedor que só deixou datas passarem em branco. Ele não tem aceitação
   * boa nem ruim; tem ausência, e é a pontualidade que fala por ele.
   */
  aceitacao: number | null;
  /** A nota final, 0 a 100. Null quando não há base para calcular. */
  nota: number | null;
  /** Tem entregas suficientes para ser comparado com os outros? */
  temBase: boolean;
};

function paraData(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * A entrega chegou no dia combinado?
 *
 * O dia, e não a hora. Cobrar o horário exato puniria o fornecedor pela fila
 * da doca: o caminhão que chega às 8h e é descarregado às 11h não atrasou — a
 * operação é que estava ocupada. O que está sob o controle dele é o dia.
 */
export function chegouNoDia(entrega: EntregaAvaliada): boolean | null {
  if (entrega.semAgendamento) return null;
  const combinado = paraData(entrega.scheduledFor);
  const chegou = paraData(entrega.receivedAt);
  if (!combinado || !chegou) return null;
  return (
    combinado.getFullYear() === chegou.getFullYear() &&
    combinado.getMonth() === chegou.getMonth() &&
    combinado.getDate() === chegou.getDate()
  );
}

/**
 * A data combinada passou em branco antes de ser trocada?
 *
 * Esta é a pergunta que o reagendamento apagava. Remarcar reescreve o
 * `scheduledFor` da nota, então a entrega que furou terça e chegou na
 * quinta ficava registrada como se quinta sempre tivesse sido o combinado —
 * pontualidade cheia, e o fornecedor que obrigou a doca a se reorganizar
 * saía igual ao que veio no dia.
 *
 * Só conta o que era compromisso de verdade: a data tem que ter sido
 * confirmada (o estado anterior era "agendada"). A data que o fornecedor
 * pediu enquanto a nota estava pendente é pedido, não acordo, e o balcão
 * confirmar depois dela não é falta de ninguém.
 *
 * E conta pelo dia, não pela hora — do mesmo jeito que `chegouNoDia`. Mudar
 * das 10h para as 15h da mesma terça é a doca se reorganizando; o que
 * desorganiza a semana é a terça inteira passar sem o caminhão.
 */
export function furouOCompromisso(troca: {
  statusAnterior: string | null | undefined;
  dataAnterior: Date | string | null | undefined;
  dataNova: Date | string | null | undefined;
  trocadaEm: Date | string | null | undefined;
}): boolean {
  if (troca.statusAnterior !== "scheduled") return false;
  const combinada = paraData(troca.dataAnterior);
  const nova = paraData(troca.dataNova);
  const trocadaEm = paraData(troca.trocadaEm);
  if (!combinada || !nova || !trocadaEm) return false;
  // Remarcação que não mexeu na data não desmarcou compromisso nenhum.
  if (nova.getTime() === combinada.getTime()) return false;
  const fimDoDiaCombinado = new Date(combinada);
  fimDoDiaCombinado.setHours(23, 59, 59, 999);
  return trocadaEm.getTime() > fimDoDiaCombinado.getTime();
}

/**
 * Quantos compromissos a entrega gerou, e quantos foram cumpridos.
 *
 * Um por data confirmada, e não um por nota: cada remarcação depois do dia
 * perdido é mais uma vez que a operação contou com um caminhão que não veio.
 * A nota remarcada duas vezes e entregue na terceira vale 1 de 3, não 1 de 1.
 */
export function compromissosDaEntrega(entrega: EntregaAvaliada): { combinados: number; cumpridos: number } {
  const furadas = Math.max(0, entrega.datasFuradas ?? 0);
  // A nota remarcada volta para "agendada" e deixa de ter desfecho. A falta
  // que já aconteceu não espera por ele: o dia perdido é fato consumado, e
  // esperar a carga chegar para contá-lo é o que fazia o fornecedor que não
  // apareceu nenhuma vez sumir do ranking em vez de encabeçá-lo.
  const chegou = temDesfecho(entrega) ? chegouNoDia(entrega) : null;
  return {
    combinados: furadas + (chegou === null ? 0 : 1),
    cumpridos: chegou === true ? 1 : 0,
  };
}

/** Só entrega com desfecho é julgada: o que ainda está em aberto não conta. */
export function temDesfecho(entrega: EntregaAvaliada): boolean {
  return entrega.status === "received" || entrega.status === "completed" || entrega.status === "rejected";
}

/**
 * A nota final: pontualidade e aceitação, com o mesmo peso.
 *
 * Os dois pesam igual porque a operação sofre igual com os dois. O fornecedor
 * que nunca vem no dia desorganiza a doca da semana inteira; o que vem no dia
 * com a carga avariada ocupa a doca e não entrega nada.
 *
 * Fornecedor sem nenhuma entrega com data combinada não tem pontualidade para
 * medir — a nota dele é só a aceitação, e não um zero que ele não mereceu. E
 * quem só deixou datas passarem em branco não tem aceitação para medir: a nota
 * dele é a pontualidade, que é o que ele de fato produziu.
 */
export function notaFinal(pontualidade: number | null, aceitacao: number | null): number {
  if (aceitacao === null) return Math.round(pontualidade ?? 0);
  if (pontualidade === null) return Math.round(aceitacao);
  return Math.round(pontualidade * 0.5 + aceitacao * 0.5);
}

/** Como a nota se chama na tela, para ninguém ter que interpretar o número. */
export function faixaDaNota(nota: number | null): "sem base" | "ótimo" | "bom" | "atenção" | "crítico" {
  if (nota === null) return "sem base";
  if (nota >= 95) return "ótimo";
  if (nota >= 85) return "bom";
  if (nota >= 70) return "atenção";
  return "crítico";
}

/**
 * O ranking, do melhor para o pior.
 *
 * Agrupa pelo CNPJ do emitente da nota, e não pela conta que lançou o
 * agendamento. São coisas diferentes: a nota lançada à mão pelo balcão carrega
 * o usuário de dentro como "fornecedor", e foi assim que o operador do sistema
 * apareceu em primeiro lugar num ranking de fornecedores.
 *
 * Entrega sem emitente identificado fica de fora: não é de ninguém, e somá-la
 * a um grupo chamado "não identificado" só cria uma linha que não serve para
 * cobrar nada.
 */
export function ranquearFornecedores(entregas: EntregaAvaliada[]): NotaDoFornecedor[] {
  const porCnpj = new Map<string, EntregaAvaliada[]>();
  for (const entrega of entregas) {
    // Entra quem tem o que mostrar: uma entrega que acabou, ou uma data que
    // ficou pelo caminho. A nota ainda aberta que já queimou um dia conta pelo
    // dia queimado — era isso que fazia o fornecedor de onze faltas e nenhuma
    // entrega desaparecer da lista, que é exatamente onde ele precisa estar.
    if (!temDesfecho(entrega) && !(entrega.datasFuradas ?? 0)) continue;
    const cnpj = apenasDigitos(entrega.cnpj ?? "");
    if (!cnpj) continue;
    const lista = porCnpj.get(cnpj);
    if (lista) lista.push(entrega);
    else porCnpj.set(cnpj, [entrega]);
  }

  const linhas: NotaDoFornecedor[] = [];
  for (const [cnpj, lista] of Array.from(porCnpj)) {
    const compromissos = lista.map(compromissosDaEntrega);
    const comDataCombinada = compromissos.reduce((total, item) => total + item.combinados, 0);
    const noPrazo = compromissos.reduce((total, item) => total + item.cumpridos, 0);
    const datasFuradas = comDataCombinada - noPrazo;
    // Aceitação é sobre carga que foi conferida: a nota que nunca chegou não
    // foi aceita nem recusada, e somá-la aqui diluiria a recusa de verdade.
    const concluidas = lista.filter(temDesfecho);
    const recusadas = concluidas.filter(entrega => entrega.status === "rejected");
    const recusasPorMotivo: Record<string, number> = {};
    for (const recusada of recusadas) {
      const motivo = recusada.rejectionReasonCode?.trim() || "SEM_CODIGO";
      recusasPorMotivo[motivo] = (recusasPorMotivo[motivo] ?? 0) + 1;
    }
    const pontualidade = comDataCombinada ? (noPrazo / comDataCombinada) * 100 : null;
    const aceitacao = concluidas.length ? ((concluidas.length - recusadas.length) / concluidas.length) * 100 : null;
    // A falta conta como acontecimento observado, igual à entrega: onze datas
    // perdidas são um padrão, não um dia ruim, e mandá-las para o rodapé de
    // "sem base" seria esconder justamente quem precisa ser cobrado.
    const temBase = concluidas.length + datasFuradas >= MINIMO_PARA_RANQUEAR;
    linhas.push({
      cnpj,
      // O nome mais recente que apareceu nas notas daquele CNPJ.
      nome: lista.map(entrega => entrega.nome?.trim()).filter(Boolean).pop() || "Fornecedor não identificado",
      entregas: concluidas.length,
      comDataCombinada,
      noPrazo,
      datasFuradas,
      recusadas: recusadas.length,
      recusasPorMotivo,
      pontualidade: pontualidade === null ? null : Math.round(pontualidade),
      aceitacao: aceitacao === null ? null : Math.round(aceitacao),
      nota: temBase ? notaFinal(pontualidade === null ? null : Math.round(pontualidade), aceitacao === null ? null : Math.round(aceitacao)) : null,
      temBase,
    });
  }

  // Quem tem base vem primeiro, do melhor para o pior. Quem não tem fica no
  // fim, ordenado por volume — está ali para ser visto, não para ser cobrado.
  return linhas.sort((a, b) => {
    if (a.temBase !== b.temBase) return a.temBase ? -1 : 1;
    if (a.temBase && b.temBase) return (b.nota ?? 0) - (a.nota ?? 0) || b.entregas - a.entregas;
    return b.entregas - a.entregas;
  });
}

/** Quantos fornecedores cabem no card sem ele virar uma tabela. */
export const CABEM_NO_RANKING = 12;

/**
 * Quem fica quando não cabem todos.
 *
 * Cortar os doze primeiros guarda os melhores e joga fora os piores — o
 * contrário do que o card serve para fazer. O fornecedor que não apareceu
 * nenhuma vez fica no fim da ordem, que é exatamente onde a tesoura caía: ele
 * passaria a existir no cálculo e continuaria invisível na tela.
 *
 * Então quem furou data nunca é cortado, e o corte come a ponta de cima, onde
 * o décimo primeiro fornecedor nota 100 não diz nada que o primeiro já não
 * tenha dito. A ordem de exibição continua a mesma: do melhor para o pior.
 */
export function recortarRanking(linhas: NotaDoFornecedor[], cabem = CABEM_NO_RANKING): NotaDoFornecedor[] {
  if (linhas.length <= cabem) return linhas;
  const faltaram = linhas
    .filter(linha => linha.datasFuradas > 0)
    .sort((a, b) => b.datasFuradas - a.datasFuradas)
    .slice(0, cabem);
  const ficam = new Set(faltaram);
  for (const linha of linhas) {
    if (ficam.size >= cabem) break;
    ficam.add(linha);
  }
  return linhas.filter(linha => ficam.has(linha));
}
