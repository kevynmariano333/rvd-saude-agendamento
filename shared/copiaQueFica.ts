/**
 * Qual cópia de uma nota repetida fica, e quais saem.
 *
 * Apagar duplicata na mão, uma por uma, funciona com três notas e não funciona
 * com trinta — e é justamente quando são trinta que alguém erra e apaga a cópia
 * errada. A escolha precisa de uma regra escrita, que é esta: fica a cópia que
 * carrega mais trabalho.
 *
 * "Mais trabalho" é, em ordem: quem andou mais no fluxo (concluída vale mais
 * que pendente), quem tem MIRO — porque MIRO é lançamento no SAP, e apagar essa
 * cópia deixaria o financeiro apontando para uma nota que não existe mais —, e
 * por fim a mais antiga, que é a que as outras telas já referenciam.
 *
 * A nota recusada fica por último de propósito: ela é a única situação em que o
 * registro diz que a entrega não aconteceu, então entre uma cópia recusada e
 * uma recebida a que conta é a recebida.
 */

export type CopiaDaNota = {
  id: number;
  status: string;
  miroNumber?: string | null;
  createdAt: Date | string;
};

const ORDEM_DO_FLUXO: Record<string, number> = {
  completed: 5,
  received: 4,
  backlog: 3,
  scheduled: 2,
  pending: 1,
  rejected: 0,
};

function peso(nota: CopiaDaNota): number {
  return ORDEM_DO_FLUXO[nota.status] ?? 0;
}

function instante(nota: CopiaDaNota): number {
  const quando = new Date(nota.createdAt).getTime();
  return Number.isNaN(quando) ? Number.MAX_SAFE_INTEGER : quando;
}

/** Compara duas cópias: negativo quando `a` tem mais direito de ficar. */
function compararCopias(a: CopiaDaNota, b: CopiaDaNota): number {
  const fluxo = peso(b) - peso(a);
  if (fluxo !== 0) return fluxo;
  const miro = Number(Boolean(b.miroNumber)) - Number(Boolean(a.miroNumber));
  if (miro !== 0) return miro;
  const idade = instante(a) - instante(b);
  if (idade !== 0) return idade;
  return a.id - b.id;
}

/** A cópia que fica. Nulo quando não há nota nenhuma. */
export function copiaQueFica<T extends CopiaDaNota>(notas: T[]): T | null {
  if (!notas.length) return null;
  return [...notas].sort(compararCopias)[0];
}

/**
 * As cópias que saem — todas menos a que fica.
 *
 * Com uma nota só, devolve lista vazia: não existe "duplicata" de uma cópia, e
 * apagar deixaria a entrega sem registro nenhum.
 */
export function copiasQueSaem<T extends CopiaDaNota>(notas: T[]): T[] {
  const fica = copiaQueFica(notas);
  if (!fica || notas.length < 2) return [];
  return notas.filter(nota => nota.id !== fica.id);
}
