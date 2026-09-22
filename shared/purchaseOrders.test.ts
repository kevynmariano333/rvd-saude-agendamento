import { describe, expect, it } from "vitest";
import { notaEhUrgente, pedidoEhUrgente, pedidosDaNota } from "./purchaseOrders";

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

describe("urgência pelo número do pedido", () => {
  it("marca como urgente o pedido da faixa 4000", () => {
    expect(notaEhUrgente("4000251922")).toBe(true);
    expect(pedidoEhUrgente("4000251925")).toBe(true);
  });

  it("basta um pedido urgente para a nota ser urgente", () => {
    // É o caso comum: a nota cobre vários pedidos e só um deles é da faixa.
    expect(notaEhUrgente("4504877360, 4000251922, 4000251924")).toBe(true);
  });

  it("não marca a faixa normal", () => {
    expect(notaEhUrgente("4504877360")).toBe(false);
    expect(notaEhUrgente("4504748409 4504751122")).toBe(false);
    expect(pedidoEhUrgente("4004251922")).toBe(false);
  });

  it("não marca um pedido que só contém 4000 no meio", () => {
    // "começa com" é a regra; 4000 no meio do número é outro pedido qualquer.
    expect(notaEhUrgente("4514000922")).toBe(false);
  });

  it("nota sem pedido não é urgente", () => {
    expect(notaEhUrgente(null)).toBe(false);
    expect(notaEhUrgente("")).toBe(false);
  });
});
