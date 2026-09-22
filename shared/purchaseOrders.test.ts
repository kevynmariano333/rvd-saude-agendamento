import { describe, expect, it } from "vitest";
import { pedidosDaNota } from "./purchaseOrders";

describe("pedidos de compra de uma nota", () => {
  it("devolve o pedido único como está", () => {
    expect(pedidosDaNota("4504748409")).toEqual(["4504748409"]);
    expect(pedidosDaNota("PC-2026/0431")).toEqual(["PC-2026", "0431"]);
  });

  it("separa vários pedidos, do jeito que a pessoa digitou", () => {
    expect(pedidosDaNota("4504638337, 4504638338")).toEqual(["4504638337", "4504638338"]);
    expect(pedidosDaNota("4504638337;4504638338 4504672359")).toEqual(["4504638337", "4504638338", "4504672359"]);
  });

  it("não devolve etiqueta vazia para nota sem pedido", () => {
    for (const vazio of ["", "   ", ",,", null, undefined]) {
      expect(pedidosDaNota(vazio)).toEqual([]);
    }
  });
});
