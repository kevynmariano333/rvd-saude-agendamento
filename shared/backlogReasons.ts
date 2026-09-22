// Por que uma nota não fechou no recebimento.
//
// A lista é fechada de propósito. Motivo digitado à mão vira quinze grafias da
// mesma coisa e nenhum número confiável no fim do mês; com código, dá para
// contar quantas notas travaram por divergência de preço e cobrar de quem
// resolve. A descrição continua livre, e obrigatória: o código diz a categoria,
// só o texto diz o que houve naquela nota.

export type MotivoDeBacklog = {
  /** O que fica gravado. Não muda depois de existir, ou o histórico mente. */
  codigo: string;
  rotulo: string;
  /** Como aparece na etiqueta da lista, onde não cabe o rótulo inteiro. */
  curto: string;
};

export const MOTIVOS_DE_BACKLOG: MotivoDeBacklog[] = [
  { codigo: "AVALIACAO_LOTE_INCOMPLETA", rotulo: "Avaliação de lote incompleta", curto: "Lote" },
  { codigo: "DIVERGENCIA_CNPJ_PEDIDO_NOTA", rotulo: "Divergência CNPJ pedido x nota", curto: "CNPJ pedido" },
  { codigo: "DIVERGENCIA_CNPJ", rotulo: "Divergência de CNPJ", curto: "CNPJ" },
  { codigo: "DIVERGENCIA_PRECO", rotulo: "Divergência de preço", curto: "Preço" },
  { codigo: "DIVERGENCIA_QUANTIDADE", rotulo: "Divergência de quantidade", curto: "Quantidade" },
  { codigo: "DIVERGENCIA_QUANTIDADE_NOTA_PEDIDO", rotulo: "Divergência de quantidade nota x pedido", curto: "Qtde nota x pedido" },
  { codigo: "DIVERGENCIA_VALOR_NOTA_PEDIDO", rotulo: "Divergência de valor nota x pedido", curto: "Valor nota x pedido" },
  { codigo: "ERRO_ATRIBUICAO_ITENS", rotulo: "Erro na atribuição de itens", curto: "Atribuição de itens" },
  { codigo: "ERRO_SISTEMA_ERP", rotulo: "Erro no sistema ERP", curto: "ERP" },
  { codigo: "ERRO_TRIBUTARIO_FISCAL", rotulo: "Erro tributário / fiscal", curto: "Tributário" },
  { codigo: "FORNECIMENTO_CONCLUIR", rotulo: "Fornecimento a concluir", curto: "Fornecimento" },
  { codigo: "PENDENCIA_PEDIDO_COMPRA", rotulo: "Pendência em pedido de compra", curto: "Pedido de compra" },
  { codigo: "UNIDADE_MEDIDA_CAIXARIA", rotulo: "Unidade de medida — caixaria", curto: "Caixaria" },
  { codigo: "OUTRO", rotulo: "Outro motivo", curto: "Outro" },
];

export function motivoPorCodigo(codigo: string | null | undefined): MotivoDeBacklog | null {
  if (!codigo) return null;
  return MOTIVOS_DE_BACKLOG.find(motivo => motivo.codigo === codigo) ?? null;
}

export function ehMotivoConhecido(codigo: string | null | undefined): boolean {
  return motivoPorCodigo(codigo) !== null;
}

/**
 * O rótulo de um código gravado. Um código que saiu da lista — porque foi
 * renomeado ou removido depois — mostra o próprio código, e não "Outro": a nota
 * antiga continua dizendo a verdade sobre o que foi registrado nela.
 */
export function rotuloDoMotivo(codigo: string | null | undefined): string {
  if (!codigo) return "Motivo não informado";
  return motivoPorCodigo(codigo)?.rotulo ?? codigo;
}

export function curtoDoMotivo(codigo: string | null | undefined): string {
  if (!codigo) return "Sem motivo";
  return motivoPorCodigo(codigo)?.curto ?? codigo;
}
