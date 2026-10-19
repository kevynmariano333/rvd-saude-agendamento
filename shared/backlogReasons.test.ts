import { describe, expect, it } from "vitest";
import { MOTIVOS_DE_BACKLOG, curtoDoMotivo, ehMotivoConhecido, motivoPorCodigo, rotuloDoMotivo } from "./backlogReasons";

describe("motivos de backlog", () => {
  it("reconhece um código da lista", () => {
    expect(motivoPorCodigo("DIVERGENCIA_PRECO")?.rotulo).toBe("Divergência de preço");
    expect(ehMotivoConhecido("OUTRO")).toBe(true);
  });

  it("não aceita código inventado", () => {
    expect(ehMotivoConhecido("QUALQUER_COISA")).toBe(false);
    expect(ehMotivoConhecido("")).toBe(false);
    expect(ehMotivoConhecido(null)).toBe(false);
  });

  it("mostra o código gravado quando ele não está mais na lista", () => {
    // Uma nota antiga continua dizendo a verdade sobre o que foi registrado
    // nela, em vez de virar "Outro" por um motivo ter sido renomeado.
    expect(rotuloDoMotivo("MOTIVO_APOSENTADO")).toBe("MOTIVO_APOSENTADO");
    expect(curtoDoMotivo("MOTIVO_APOSENTADO")).toBe("MOTIVO_APOSENTADO");
    expect(rotuloDoMotivo(null)).toBe("Motivo não informado");
  });

  it("não tem código repetido, que gravaria duas categorias como uma", () => {
    const codigos = MOTIVOS_DE_BACKLOG.map(motivo => motivo.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("a bonificação é um motivo próprio, e não \"Outro\"", () => {
    // Nota de bonificação não é erro de ninguém: é brinde que chega sem pedido
    // de compra. Jogada em "Outro motivo", sumia no meio de tudo que não tem
    // categoria, e ninguém conseguia contar quantas foram.
    expect(rotuloDoMotivo("NOTA_BONIFICACAO")).toBe("Nota de bonificação");
    expect(curtoDoMotivo("NOTA_BONIFICACAO")).toBe("Bonificação");
  });

  it("cabe na coluna do banco", () => {
    for (const motivo of MOTIVOS_DE_BACKLOG) expect(motivo.codigo.length).toBeLessThanOrEqual(60);
  });
});
