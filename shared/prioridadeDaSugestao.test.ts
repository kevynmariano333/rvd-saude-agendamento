import { describe, expect, it } from "vitest";
import { compararSugestoes, ehDoPlanejamento, sugestaoPrioritaria } from "./prioridadeDaSugestao";

const doFornecedor = (createdAt: string) => ({ createdByRole: "supplier", createdAt, quem: "fornecedor" as const });
const doPlanejamento = (createdAt: string) => ({ createdByRole: "planejador", createdAt, quem: "planejamento" as const });

describe("de quem é a sugestão", () => {
  it("reconhece o planejamento", () => {
    expect(ehDoPlanejamento(doPlanejamento("2026-09-28T10:00:00Z"))).toBe(true);
  });

  it("trata qualquer outro perfil como fornecedor, inclusive o vazio", () => {
    expect(ehDoPlanejamento(doFornecedor("2026-09-28T10:00:00Z"))).toBe(false);
    expect(ehDoPlanejamento({ createdByRole: null, createdAt: "2026-09-28T10:00:00Z" })).toBe(false);
  });
});

describe("qual sugestão vale", () => {
  it("a do planejamento ganha da do fornecedor, mesmo sendo mais antiga", () => {
    const escolhida = sugestaoPrioritaria([doFornecedor("2026-09-28T18:00:00Z"), doPlanejamento("2026-09-28T09:00:00Z")]);
    expect(escolhida?.quem).toBe("planejamento");
  });

  it("entre duas do planejamento, vale a mais nova", () => {
    const escolhida = sugestaoPrioritaria([doPlanejamento("2026-09-26T09:00:00Z"), doPlanejamento("2026-09-28T09:00:00Z")]);
    expect(escolhida?.createdAt).toBe("2026-09-28T09:00:00Z");
  });

  it("sem sugestão do planejamento, vale a mais nova do fornecedor", () => {
    const escolhida = sugestaoPrioritaria([doFornecedor("2026-09-20T09:00:00Z"), doFornecedor("2026-09-27T09:00:00Z")]);
    expect(escolhida?.createdAt).toBe("2026-09-27T09:00:00Z");
  });

  it("não inventa sugestão quando não há nenhuma", () => {
    expect(sugestaoPrioritaria([])).toBeNull();
  });

  it("não quebra com data que não dá para ler", () => {
    const escolhida = sugestaoPrioritaria([doFornecedor("data torta"), doFornecedor("2026-09-27T09:00:00Z")]);
    expect(escolhida?.createdAt).toBe("2026-09-27T09:00:00Z");
  });
});

describe("a ordem na janela de agendamento", () => {
  it("põe o planejamento em cima e o resto por data, da mais nova para a mais velha", () => {
    const lista = [doFornecedor("2026-09-20T09:00:00Z"), doPlanejamento("2026-09-21T09:00:00Z"), doFornecedor("2026-09-27T09:00:00Z")];
    expect([...lista].sort(compararSugestoes).map(item => item.createdAt)).toEqual([
      "2026-09-21T09:00:00Z",
      "2026-09-27T09:00:00Z",
      "2026-09-20T09:00:00Z",
    ]);
  });
});

describe("o administrador cobrindo o planejamento", () => {
  it("a proposta dele vale como a do planejamento", () => {
    // O que distingue não é o crachá, é o lado: a proposta de dentro enxerga
    // a doca inteira, a do fornecedor enxerga a entrega dele.
    expect(ehDoPlanejamento({ createdByRole: "admin", createdAt: new Date() })).toBe(true);
    expect(ehDoPlanejamento({ createdByRole: "supplier", createdAt: new Date() })).toBe(false);
  });

  it("e ganha da do fornecedor, mesmo sendo mais antiga", () => {
    const doAdmin = { createdByRole: "admin", createdAt: new Date("2026-01-01T10:00:00.000Z") };
    const doFornecedor = { createdByRole: "supplier", createdAt: new Date("2026-02-01T10:00:00.000Z") };
    expect(sugestaoPrioritaria([doFornecedor, doAdmin])).toBe(doAdmin);
  });
});
