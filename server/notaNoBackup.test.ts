import { describe, expect, it } from "vitest";
import {
  acharNotaPeloId,
  acharNotasNoBackup,
  insertDaLinha,
  mesmaNota,
  tabelasPenduradasNaNota,
  valorParaOBanco,
  type ConteudoDoBackup,
} from "./notaNoBackup";

const backup = (dados: Record<string, unknown[]>): ConteudoDoBackup => ({ geradoEm: "2026-10-07T06:00:00.000Z", dados });

const comANota8507 = backup({
  appointments: [
    { id: 42, invoiceNumber: "8507", invoiceSupplierName: "CM HOSPITALAR S.A.", status: "received" },
    { id: 43, invoiceNumber: "9001", invoiceSupplierName: "BAXTER", status: "pending" },
  ],
  appointmentMessages: [
    { id: 7, appointmentId: 42, body: "Posso entregar às 14h?" },
    { id: 8, appointmentId: 42, body: "Pode sim." },
    { id: 9, appointmentId: 43, body: "De outra nota." },
  ],
  appointmentStatusHistory: [{ id: 1, appointmentId: 42, nextStatus: "scheduled" }],
  users: [{ id: 1, email: "quem@rvdsaude.com.br" }],
});

describe("achar a nota apagada no backup", () => {
  it("traz a nota com a conversa e o histórico que eram dela", () => {
    const [achada] = acharNotasNoBackup(comANota8507, "8507");
    expect(achada!.id).toBe(42);
    expect(achada!.fornecedor).toBe("CM HOSPITALAR S.A.");
    expect(achada!.mensagens).toBe(2);
    expect(achada!.historico).toBe(1);
  });

  it("não leva junto o que era de outra nota", () => {
    const [achada] = acharNotasNoBackup(comANota8507, "8507");
    const conversa = achada!.filhas.find(filha => filha.tabela === "appointmentMessages");
    expect(conversa!.linhas.map(linha => linha.id)).toEqual([7, 8]);
  });

  it("número que não está no backup não devolve nada", () => {
    expect(acharNotasNoBackup(comANota8507, "7777")).toEqual([]);
  });

  it("a mesma nota em linhas separadas vem como várias, para quem restaura escolher", () => {
    // O fornecedor emite a nota repetida, uma linha por pedido de compra.
    const varias = backup({
      appointments: [
        { id: 10, invoiceNumber: "8511146", supplierName: "A", status: "pending" },
        { id: 11, invoiceNumber: "8511146", supplierName: "A", status: "rejected" },
      ],
    });
    expect(acharNotasNoBackup(varias, "8511146").map(n => n.id)).toEqual([10, 11]);
  });

  it("backup sem dados não quebra", () => {
    expect(acharNotasNoBackup({}, "8507")).toEqual([]);
    expect(acharNotasNoBackup({ dados: {} }, "8507")).toEqual([]);
  });
});

describe("o número da nota", () => {
  it("zero à esquerda não faz duas notas diferentes", () => {
    // O XML grava "00008507"; quem pede a restauração digita "8507".
    expect(mesmaNota("00008507", "8507")).toBe(true);
    expect(mesmaNota("8507", "008507")).toBe(true);
  });

  it("número diferente continua diferente", () => {
    expect(mesmaNota("8507", "85070")).toBe(false);
    expect(mesmaNota("8507", "")).toBe(false);
    expect(mesmaNota(null, "8507")).toBe(false);
  });

  it("nota com letra é comparada como está escrita", () => {
    expect(mesmaNota("NF-8507", "nf-8507")).toBe(true);
    expect(mesmaNota("NF-8507", "8507")).toBe(false);
  });
});

describe("quais tabelas se penduram na nota", () => {
  it("sai dos dados, e não de uma lista escrita à mão", () => {
    // Uma lista fixa envelheceria na primeira tabela nova, e a restauração
    // passaria a deixar um pedaço para trás sem avisar.
    expect(tabelasPenduradasNaNota(comANota8507).sort()).toEqual(["appointmentMessages", "appointmentStatusHistory"]);
  });

  it("tabela sem ligação com a nota fica de fora", () => {
    expect(tabelasPenduradasNaNota(comANota8507)).not.toContain("users");
  });
});

describe("o valor de volta para o banco", () => {
  it("data ISO vira Date, para a hora que sai ser a hora que entrou", () => {
    const valor = valorParaOBanco("2026-10-07T18:21:29.000Z");
    expect(valor).toBeInstanceOf(Date);
    expect((valor as Date).toISOString()).toBe("2026-10-07T18:21:29.000Z");
  });

  it("texto que só parece data continua texto", () => {
    expect(valorParaOBanco("2026-10-07")).toBe("2026-10-07");
    expect(valorParaOBanco("Entrega marcada para 2026-10-07T10:00")).toBe("Entrega marcada para 2026-10-07T10:00");
  });

  it("coluna JSON volta como texto JSON, e não como [object Object]", () => {
    expect(valorParaOBanco({ itens: 3 })).toBe('{"itens":3}');
  });

  it("nulo continua nulo", () => {
    expect(valorParaOBanco(null)).toBeNull();
    expect(valorParaOBanco(undefined)).toBeNull();
  });
});

describe("o INSERT da linha", () => {
  it("escreve as colunas que a linha tem", () => {
    const { inicio, valores } = insertDaLinha("appointmentMessages", { id: 7, appointmentId: 42, body: "oi" });
    expect(inicio).toBe("INSERT INTO `appointmentMessages` (`id`, `appointmentId`, `body`) VALUES");
    expect(valores).toEqual([7, 42, "oi"]);
  });

  it("nome de tabela ou coluna com crase não escapa do lugar", () => {
    const { inicio } = insertDaLinha("ta`bela", { "co`luna": 1 });
    expect(inicio).toBe("INSERT INTO `ta``bela` (`co``luna`) VALUES");
  });
});

describe("achar pelo id", () => {
  it("traz a nota daquele id com a conversa dela", () => {
    const achada = acharNotaPeloId(comANota8507, 42);
    expect(achada!.numeroDaNota).toBe("8507");
    expect(achada!.mensagens).toBe(2);
  });

  it("id que não existe no backup não devolve nada", () => {
    expect(acharNotaPeloId(comANota8507, 999)).toBeNull();
  });
});
