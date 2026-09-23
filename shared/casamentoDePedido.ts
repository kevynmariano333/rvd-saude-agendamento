/**
 * Qual item do pedido corresponde ao que veio na nota.
 *
 * As duas pontas descrevem o mesmo material com palavras diferentes: o
 * fornecedor emite "COLETOR PERFURO CORTANTE 03L PREMIUM DESCARBOX" e o SAP
 * cadastrou "CAIXA PERF-CORT RET PAP M-PERF AM 3L". Comparar texto não resolve.
 *
 * O que não muda entre os dois lados é o número: o preço unitário negociado e a
 * quantidade comprada. São eles que casam as linhas — e, quando casam, a tela
 * pode mostrar só o item que interessa em vez do pedido inteiro.
 */

export type ItemDaNota = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
};

export type ItemDoPedido = {
  item: string;
  description: string | null;
  orderedQuantity: string | null;
  unitPriceCents: number | null;
};

/** Por que a linha do pedido foi escolhida. Sai na tela, para ninguém adivinhar. */
export type MotivoDoCasamento = "preço e quantidade" | "preço unitário" | "quantidade";

export type Casamento<T> = { item: T; motivo: MotivoDoCasamento };

function comoNumero(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * As quantidades que a nota pode representar para um mesmo preço unitário.
 *
 * Uma nota costuma trazer o mesmo material em mais de uma linha, separado por
 * lote — 180 de um, 220 de outro — para uma única linha de 400 no pedido. Por
 * isso conta tanto cada linha quanto a soma das que dividem o preço.
 */
function quantidadesPorPreco(itens: ItemDaNota[]): Map<number, Set<number>> {
  const porPreco = new Map<number, Set<number>>();
  const somas = new Map<number, number>();
  for (const item of itens) {
    const preco = comoNumero(item.unitPriceCents);
    const quantidade = comoNumero(item.quantity);
    if (preco === null || quantidade === null) continue;
    if (!porPreco.has(preco)) porPreco.set(preco, new Set());
    porPreco.get(preco)!.add(quantidade);
    somas.set(preco, (somas.get(preco) ?? 0) + quantidade);
  }
  for (const [preco, soma] of Array.from(somas.entries())) porPreco.get(preco)?.add(soma);
  return porPreco;
}

/** Todas as quantidades da nota, linha a linha e somadas por preço. */
function todasAsQuantidades(itens: ItemDaNota[]): Set<number> {
  const todas = new Set<number>();
  for (const conjunto of Array.from(quantidadesPorPreco(itens).values())) {
    for (const quantidade of Array.from(conjunto)) todas.add(quantidade);
  }
  return todas;
}

/**
 * Os itens do pedido que a nota está entregando.
 *
 * Devolve lista vazia quando nada casa — e aí quem chama mostra o pedido
 * inteiro, que é melhor do que mostrar nada. Um palpite fraco seria pior que
 * nenhum: esconderia do operador a linha certa.
 */
export function casarItensComPedido<T extends ItemDoPedido>(itensDaNota: ItemDaNota[], itensDoPedido: T[]): Casamento<T>[] {
  if (!itensDaNota.length || !itensDoPedido.length) return [];
  const porPreco = quantidadesPorPreco(itensDaNota);
  const quantidades = todasAsQuantidades(itensDaNota);

  const casados: Casamento<T>[] = [];
  for (const doPedido of itensDoPedido) {
    const preco = comoNumero(doPedido.unitPriceCents);
    const quantidade = comoNumero(doPedido.orderedQuantity);
    const precoBate = preco !== null && porPreco.has(preco);
    const quantidadeBate = quantidade !== null && quantidades.has(quantidade);

    if (precoBate && quantidadeBate && porPreco.get(preco!)!.has(quantidade!)) {
      casados.push({ item: doPedido, motivo: "preço e quantidade" });
      continue;
    }
    // O preço unitário sozinho já é forte: é o valor negociado daquele material
    // naquele pedido, e raramente dois materiais do mesmo pedido têm o mesmo.
    if (precoBate) casados.push({ item: doPedido, motivo: "preço unitário" });
    else if (quantidadeBate) casados.push({ item: doPedido, motivo: "quantidade" });
  }

  // Quando algum item casou pelos dois, os que casaram por um só são ruído: o
  // preço de um material pode coincidir com a quantidade de outro.
  const porAmbos = casados.filter(casamento => casamento.motivo === "preço e quantidade");
  return porAmbos.length ? porAmbos : casados;
}

/**
 * A linha do pedido que corresponde a cada linha da nota, uma a uma.
 *
 * O casamento acima responde "quais itens do pedido esta nota entrega". Este
 * responde a pergunta da tela de itens: "de onde veio o código SAP desta
 * linha". São perguntas diferentes — uma nota com dois materiais precisa de um
 * código para cada linha, e não de um conjunto sem dono.
 *
 * Só o preço unitário identifica: é o valor negociado daquele material naquele
 * pedido. Quando dois itens do pedido têm o mesmo preço, a quantidade desempata;
 * se nem ela desempatar, a linha fica sem código. "Não mapeado" é honesto;
 * escrever o código do material errado ao lado da descrição certa não é.
 */
export function pedidoDeCadaLinhaDaNota<T extends ItemDoPedido>(itensDaNota: ItemDaNota[], itensDoPedido: T[]): (T | null)[] {
  return itensDaNota.map(daNota => {
    const preco = comoNumero(daNota.unitPriceCents);
    if (preco === null) return null;
    const mesmoPreco = itensDoPedido.filter(doPedido => comoNumero(doPedido.unitPriceCents) === preco);
    if (mesmoPreco.length === 1) return mesmoPreco[0];
    if (!mesmoPreco.length) return null;
    const quantidade = comoNumero(daNota.quantity);
    if (quantidade === null) return null;
    const mesmaQuantidade = mesmoPreco.filter(doPedido => comoNumero(doPedido.orderedQuantity) === quantidade);
    return mesmaQuantidade.length === 1 ? mesmaQuantidade[0] : null;
  });
}
