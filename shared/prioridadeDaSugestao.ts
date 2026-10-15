/**
 * Qual sugestão de data vale, quando há mais de uma.
 *
 * Duas pessoas propõem data para a mesma nota: o fornecedor, que sabe quando a
 * carga sai, e o planejamento, que sabe o que a operação aguenta receber
 * naquele dia. Quando as duas propõem, a do planejamento vale — é ela que
 * enxerga a doca inteira, e não uma entrega só.
 *
 * Antes disso, a linha mostrava a data mais distante entre as propostas, sem
 * olhar de quem era: o Operador abria a nota achando que a data na tela era a
 * combinada e encontrava outra dentro da janela.
 *
 * Entre propostas do mesmo lado vale a mais nova, que é a que está sendo
 * negociada agora.
 */

export type SugestaoComparavel = {
  /** O perfil de quem escreveu. É o de dentro da casa que tem prioridade. */
  createdByRole?: string | null;
  createdAt: Date | string;
};

/**
 * Quem escreveu manda mais do que quando escreveu.
 *
 * O administrador conta como planejamento: quando ele propõe data, está
 * cobrindo essa mesa, e a proposta enxerga a doca inteira do mesmo jeito. O
 * que distingue não é o crachá, é o lado — de dentro ou de fora.
 */
const DE_DENTRO = new Set(["planejador", "admin"]);

export function ehDoPlanejamento(sugestao: SugestaoComparavel): boolean {
  return DE_DENTRO.has(sugestao.createdByRole ?? "");
}

function instante(valor: Date | string): number {
  const quando = valor instanceof Date ? valor : new Date(valor);
  const marca = quando.getTime();
  return Number.isNaN(marca) ? 0 : marca;
}

/**
 * A ordem em que as sugestões aparecem: a que vale primeiro.
 *
 * Serve para ordenar a lista na janela de agendamento e para escolher a que a
 * linha mostra — os dois lugares precisam concordar, ou a tela diz uma coisa e
 * a janela outra.
 */
export function compararSugestoes(a: SugestaoComparavel, b: SugestaoComparavel): number {
  const pesoA = ehDoPlanejamento(a) ? 1 : 0;
  const pesoB = ehDoPlanejamento(b) ? 1 : 0;
  if (pesoA !== pesoB) return pesoB - pesoA;
  return instante(b.createdAt) - instante(a.createdAt);
}

/** A sugestão que vale para esta nota, ou nada quando não há nenhuma. */
export function sugestaoPrioritaria<T extends SugestaoComparavel>(sugestoes: readonly T[]): T | null {
  if (!sugestoes.length) return null;
  return [...sugestoes].sort(compararSugestoes)[0] ?? null;
}
