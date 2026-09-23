import { describe, expect, it } from "vitest";
import { pedidosCabem, PURCHASE_ORDER_MAX, normalizePurchaseOrder, PURCHASE_ORDER_MAX } from "./purchaseOrder";

describe("pedido de compra informado pelo fornecedor", () => {
  it("mantém o número como foi digitado", () => {
    expect(normalizePurchaseOrder("4504748409")).toBe("4504748409");
    expect(normalizePurchaseOrder("PC-2026/0431")).toBe("PC-2026/0431");
  });

  it("tira o espaço que vem junto do copiar e colar", () => {
    expect(normalizePurchaseOrder("  4504748409 ")).toBe("4504748409");
    expect(normalizePurchaseOrder("4504 \n 748409")).toBe("4504 748409");
  });

  it("trata como ausente o que só tem espaço", () => {
    for (const vazio of ["", "   ", "\t\n", null, undefined]) {
      expect(normalizePurchaseOrder(vazio)).toBeNull();
    }
  });

  it("corta no tamanho da coluna em vez de estourar a gravação", () => {
    const longo = "9".repeat(PURCHASE_ORDER_MAX + 50);
    expect(normalizePurchaseOrder(longo)).toHaveLength(PURCHASE_ORDER_MAX);
  });
});

describe("vários pedidos numa nota só", () => {
  const dez = (inicio: string) => inicio.padEnd(10, "0");

  it("nove pedidos de dez dígitos cabem", () => {
    const pedidos = Array.from({ length: 9 }, (_, i) => dez(`450480000${i}`)).join(" ");
    expect(pedidos.length).toBeLessThanOrEqual(PURCHASE_ORDER_MAX);
    expect(pedidosCabem(pedidos)).toBe(true);
  });

  it("o décimo não cabe, e recusar é melhor que cortar pela metade", () => {
    const pedidos = Array.from({ length: 10 }, (_, i) => dez(`450480000${i}`)).join(" ");
    expect(pedidosCabem(pedidos)).toBe(false);
    // O que o corte silencioso fazia: gravava um pedido que não existe.
    expect(normalizePurchaseOrder(pedidos)).toHaveLength(PURCHASE_ORDER_MAX);
  });

  it("campo vazio cabe: quem valida a presença é outra regra", () => {
    expect(pedidosCabem("")).toBe(true);
    expect(pedidosCabem(null)).toBe(true);
  });
});
