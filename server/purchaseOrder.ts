// Número do pedido de compra que acompanha a nota.
//
// Antes ele só era lido do XML, na tag xPed, que boa parte das notas não traz —
// e sem o pedido o recebimento não fecha contra a compra que o originou. Por
// isso o fornecedor passou a informá-lo na mão, e o que ele informa é o que
// vale: é a única fonte que sempre existe.

/** Limite da coluna `appointments.purchaseOrder`. */
export const PURCHASE_ORDER_MAX = 100;

/**
 * Devolve o pedido pronto para gravar, ou null quando não há pedido nenhum.
 *
 * Espaços sobrando são comuns em valor copiado do ERP; colapsá-los evita que o
 * mesmo pedido entre duas vezes com grafias que só diferem no espaçamento.
 */
export function normalizePurchaseOrder(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const limpo = bruto.replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  return limpo.slice(0, PURCHASE_ORDER_MAX);
}
