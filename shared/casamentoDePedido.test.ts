import { describe, expect, it } from "vitest";
import { casarItensComPedido, type ItemDaNota, type ItemDoPedido } from "./casamentoDePedido";

/** O caso real: a nota do coletor contra o pedido 4504872329. */
const notaDoColetor: ItemDaNota[] = [
  { description: "COLETOR PERFURO CORTANTE 03L PREMIUM DESCARBOX (20) LOTE: 13608", quantity: 180, unitPriceCents: 249 },
  { description: "COLETOR PERFURO CORTANTE 03L PREMIUM DESCARBOX (20) LOTE: 13763", quantity: 220, unitPriceCents: 249 },
];

const pedido4504872329: ItemDoPedido[] = [
  { item: "10", description: "ABSORVENTE GRAN CAN CAL SODADA BBA", orderedQuantity: "6.000", unitPriceCents: 15161 },
  { item: "20", description: "COBERTURA OBITO ZIPER G 0,9X2,2M", orderedQuantity: "25.000", unitPriceCents: 1230 },
  { item: "30", description: "LANCETA AMOST SANG ACCUCHEK 23G 200UN", orderedQuantity: "15600.000", unitPriceCents: 10 },
  { item: "40", description: "CAIXA PERF-CORT RET PAP M-PERF AM 3L", orderedQuantity: "400.000", unitPriceCents: 249 },
  { item: "50", description: "CURATIVO BAND BLOOD STOP C/500 AD", orderedQuantity: "24.000", unitPriceCents: 1500 },
  { item: "80", description: "CAIXA PERF-CORT RET PAP AM 90L", orderedQuantity: "50.000", unitPriceCents: 4453 },
];

describe("casar a nota com o item do pedido", () => {
  it("acha o coletor mesmo com o SAP chamando de caixa", () => {
    // 180 + 220 = 400, ao mesmo preço de R$ 2,49: é a linha 40, escrita de
    // outro jeito. Nenhuma palavra das duas descrições coincide.
    const casados = casarItensComPedido(notaDoColetor, pedido4504872329);
    expect(casados).toHaveLength(1);
    expect(casados[0].item.item).toBe("40");
    expect(casados[0].motivo).toBe("preço e quantidade");
  });

  it("casa uma linha só da nota, sem precisar somar", () => {
    const umaLinha: ItemDaNota[] = [{ description: "CURATIVO", quantity: 24, unitPriceCents: 1500 }];
    const casados = casarItensComPedido(umaLinha, pedido4504872329);
    expect(casados.map(c => c.item.item)).toEqual(["50"]);
  });

  it("descarta o casamento fraco quando existe um forte", () => {
    // O item 80 tem quantidade 50, que ninguém na nota tem; o 40 casa pelos
    // dois. Mostrar os dois faria o operador conferir a linha errada.
    const comRuido: ItemDoPedido[] = [...pedido4504872329, { item: "90", description: "OUTRO", orderedQuantity: "400.000", unitPriceCents: 999 }];
    const casados = casarItensComPedido(notaDoColetor, comRuido);
    expect(casados.map(c => c.item.item)).toEqual(["40"]);
  });

  it("aceita o casamento só pelo preço quando a quantidade não fecha", () => {
    // Entrega parcial: a nota trouxe 100 dos 400 comprados.
    const parcial: ItemDaNota[] = [{ description: "COLETOR", quantity: 100, unitPriceCents: 249 }];
    const casados = casarItensComPedido(parcial, pedido4504872329);
    expect(casados.map(c => c.item.item)).toEqual(["40"]);
    expect(casados[0].motivo).toBe("preço unitário");
  });

  it("não inventa casamento quando nada bate", () => {
    // Melhor devolver nada — quem chama mostra o pedido inteiro — do que
    // apontar uma linha errada e esconder a certa.
    const estranha: ItemDaNota[] = [{ description: "QUALQUER COISA", quantity: 7, unitPriceCents: 333 }];
    expect(casarItensComPedido(estranha, pedido4504872329)).toEqual([]);
  });

  it("item sem preço ou sem quantidade não casa com nada", () => {
    const incompleta: ItemDaNota[] = [{ description: "SEM NUMEROS", quantity: null, unitPriceCents: null }];
    expect(casarItensComPedido(incompleta, pedido4504872329)).toEqual([]);
    expect(casarItensComPedido(notaDoColetor, [])).toEqual([]);
    expect(casarItensComPedido([], pedido4504872329)).toEqual([]);
  });
});
