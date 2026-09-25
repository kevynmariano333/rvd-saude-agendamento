/**
 * Por que uma nota foi recusada.
 *
 * Antes o sistema gravava sempre a mesma frase — "Recusado pelo operador" —,
 * que não responde nada: o relatório de recusas ficava com trezentas linhas
 * iguais, e ninguém conseguia dizer se o problema era fornecedor que não
 * aparece, documento errado ou carga avariada. Sem saber o motivo, não há o
 * que cobrar de quem entrega.
 *
 * A lista é curta de propósito. Motivo demais vira campo que todo mundo
 * responde no primeiro da lista; estes são os que a doca de fato encontra.
 */

export type MotivoDeRecusa = {
  codigo: string;
  rotulo: string;
  /** Uma linha explicando quando usar, para dois motivos parecidos não se confundirem. */
  quando: string;
};

export const MOTIVOS_DE_RECUSA: MotivoDeRecusa[] = [
  { codigo: "NAO_COMPARECEU", rotulo: "Não compareceu", quando: "A data estava marcada e o caminhão não chegou." },
  { codigo: "FORA_DO_HORARIO", rotulo: "Chegou fora do horário", quando: "Chegou, mas fora da janela combinada." },
  { codigo: "SEM_AGENDAMENTO", rotulo: "Veio sem agendamento", quando: "Apareceu na doca sem data marcada." },
  { codigo: "DOCUMENTO_IRREGULAR", rotulo: "Documento fiscal irregular", quando: "Nota com erro, sem XML ou sem os dados que a entrada exige." },
  { codigo: "DIVERGENCIA_PEDIDO", rotulo: "Divergência com o pedido", quando: "Item, quantidade ou valor diferentes do pedido de compra." },
  { codigo: "CARGA_AVARIADA", rotulo: "Carga avariada", quando: "Mercadoria danificada, violada ou fora da temperatura." },
  { codigo: "DUPLICIDADE", rotulo: "Nota em duplicidade", quando: "A mesma nota já havia sido agendada ou recebida." },
  { codigo: "CANCELADA_FORNECEDOR", rotulo: "Cancelada pelo fornecedor", quando: "O próprio fornecedor desistiu da entrega." },
  { codigo: "OUTRO", rotulo: "Outro motivo", quando: "Nenhum dos anteriores — descreva o que houve." },
];

export function motivoDeRecusaPorCodigo(codigo: string | null | undefined): MotivoDeRecusa | undefined {
  if (!codigo) return undefined;
  return MOTIVOS_DE_RECUSA.find(motivo => motivo.codigo === codigo);
}

export function rotuloDaRecusa(codigo: string | null | undefined): string {
  if (!codigo) return "Motivo não informado";
  return motivoDeRecusaPorCodigo(codigo)?.rotulo ?? codigo;
}

/** "Outro motivo" sem descrição não explica nada: ali o texto é obrigatório. */
export function recusaExigeDescricao(codigo: string | null | undefined): boolean {
  return codigo === "OUTRO";
}

/**
 * O que fica gravado na nota.
 *
 * Rótulo e descrição numa linha só, como o backlog já faz — a coluna é de
 * texto, e quem lê o relatório lê a frase, não o código.
 */
export function textoDaRecusa(codigo: string | null | undefined, descricao?: string | null): string {
  const rotulo = rotuloDaRecusa(codigo);
  const detalhe = (descricao ?? "").trim();
  if (!detalhe) return rotulo;
  // A descrição que já repete o rótulo viraria "Não compareceu — Não compareceu".
  if (detalhe.toLocaleLowerCase().startsWith(rotulo.toLocaleLowerCase())) return detalhe;
  return `${rotulo} — ${detalhe}`;
}
