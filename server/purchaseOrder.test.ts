import { describe, expect, it } from "vitest";
import { normalizePurchaseOrder, PURCHASE_ORDER_MAX } from "./purchaseOrder";

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
