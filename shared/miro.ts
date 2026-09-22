// Número MIRO: o lançamento da nota no SAP.
//
// É pedido no momento de concluir o recebimento, que é quando a pessoa tem o
// número na tela do SAP. Depois disso ninguém volta para preencher, e a
// conciliação entre o portal e o financeiro se perde.

export const MIRO_DIGITS = 10;

/**
 * Devolve o número pronto para gravar, ou null quando não serve.
 *
 * Espaços são tolerados porque o valor quase sempre vem colado do SAP; letras e
 * pontuação, não — um número com dígito trocado por letra é erro de digitação,
 * e limpar em silêncio gravaria um MIRO que não existe.
 */
export function normalizeMiroNumber(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const limpo = bruto.replace(/\s/g, "");
  return new RegExp(`^\\d{${MIRO_DIGITS}}$`).test(limpo) ? limpo : null;
}
