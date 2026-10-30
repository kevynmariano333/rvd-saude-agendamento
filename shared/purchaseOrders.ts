// O pedido de compra como a tabela mostra.
//
// A validação de entrada fica em `server/purchaseOrder.ts`; aqui é só leitura.
// Uma nota pode cobrir mais de um pedido, e quem digita separa como quiser —
// vírgula, barra, ponto e vírgula ou espaço. Na tela cada pedido é uma etiqueta
// própria, empilhada, porque uma linha corrida de números vira um borrão.

export function pedidosDaNota(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return valor
    .split(/[\s,;/]+/)
    .map(pedido => pedido.trim())
    .filter(pedido => pedido.length > 0);
}

/**
 * Pedidos que começam assim são de compra urgente.
 *
 * A regra é do ERP, não deste sistema: a faixa 4000 é reservada para o que não
 * pode esperar. Como está no próprio número do pedido, a nota se marca sozinha
 * — ninguém precisa lembrar de sinalizar, e ninguém marca urgente o que não é.
 */
export const PREFIXO_URGENTE = "4000";

export function pedidoEhUrgente(pedido: string): boolean {
  return pedido.trim().startsWith(PREFIXO_URGENTE);
}

/** Uma nota é urgente quando qualquer um dos seus pedidos é. */
export function notaEhUrgente(valor: string | null | undefined): boolean {
  return pedidosDaNota(valor).some(pedidoEhUrgente);
}

/**
 * Pedido feito só de zeros não é pedido: é o campo preenchido por preencher.
 * A nota traz o número de verdade, e é ele que o recebimento confere.
 */
export function pedidoEhZerado(pedido: string): boolean {
  const digitos = pedido.replace(/\D/g, "");
  return digitos.length > 0 && /^0+$/.test(digitos);
}

/** Os mesmos pedidos, na mesma quantidade, em qualquer ordem? */
export function mesmosPedidos(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(numero => b.includes(numero));
}
