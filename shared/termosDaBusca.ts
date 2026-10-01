/**
 * A busca aceita vários números de uma vez.
 *
 * Quem trabalha com nota fiscal nunca tem um número na mão: tem a lista que
 * chegou por e-mail, por WhatsApp ou colada de uma planilha. Procurar onze NFs
 * uma a uma, anotando num papel quais apareceram, é como se conferia antes — e
 * é onde some uma. Colando a lista inteira, a tela responde de uma vez quais
 * existem; as que não aparecem são exatamente as que não estão no sistema.
 *
 * Separa por vírgula, ponto e vírgula, quebra de linha ou espaço. Um nome de
 * fornecedor com espaço — "CARDINAL HEALTH" — vira dois termos, e isso está
 * certo: cada um procura em nome, número da nota e pedido, e a nota da Cardinal
 * casa com os dois.
 */
export const LIMITE_DE_TERMOS = 50;

export function termosDaBusca(bruto: string | null | undefined): string[] {
  if (!bruto) return [];
  const vistos = new Set<string>();
  for (const pedaco of bruto.split(/[\s,;]+/)) {
    const termo = pedaco.trim();
    // Um termo de uma letra casa com quase tudo e não ajuda ninguém; o que o
    // teclado deixa escapar — uma vírgula solta, um traço — também não.
    if (termo.length < 2) continue;
    vistos.add(termo);
    if (vistos.size === LIMITE_DE_TERMOS) break;
  }
  return Array.from(vistos);
}
