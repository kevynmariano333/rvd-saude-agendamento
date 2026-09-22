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
