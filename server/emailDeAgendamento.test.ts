import { describe, expect, it } from "vitest";
import { conteudoDoAgendamento, destinoDaCarga, diaEHora } from "./emailDeAgendamento";
import { UNIDADES } from "../shared/recipients";

/** 14:30 em Brasília é 17:30 em UTC. */
const quinzeDeOutubro = new Date(Date.UTC(2026, 9, 15, 17, 30, 0));

describe("o dia e a hora que o motorista lê", () => {
  it("usa o horário de Brasília, e não o do servidor", () => {
    // O servidor roda em UTC. Escrever a hora dele mandaria o caminhão três
    // horas depois do combinado.
    expect(diaEHora(quinzeDeOutubro).hora).toBe("14:30");
  });

  it("escreve o dia da semana junto, que é como as pessoas combinam", () => {
    expect(diaEHora(quinzeDeOutubro).dia).toContain("15/10/2026");
    expect(diaEHora(quinzeDeOutubro).dia).toMatch(/quinta/i);
  });

  it("não troca o dia quando o horário é de madrugada", () => {
    // 00:30 de Brasília é 03:30 UTC do mesmo dia — mas 23:00 de Brasília é
    // 02:00 UTC do dia seguinte, e é aí que a conta erra se for pela UTC.
    const onzeDaNoite = new Date(Date.UTC(2026, 9, 16, 2, 0, 0));
    expect(diaEHora(onzeDaNoite).dia).toContain("15/10/2026");
    expect(diaEHora(onzeDaNoite).hora).toBe("23:00");
  });
});

describe("o destinatário da carga", () => {
  it("escreve a sigla e o nome da unidade", () => {
    const unidade = UNIDADES[0];
    expect(destinoDaCarga(unidade.cnpj)).toBe(`${unidade.sigla} — ${unidade.nome}`);
  });

  it("não inventa unidade para um CNPJ desconhecido", () => {
    expect(destinoDaCarga("00000000000000")).toBeNull();
    expect(destinoDaCarga(null)).toBeNull();
  });
});

describe("a mensagem do agendamento", () => {
  const base = {
    invoiceNumber: "8511146",
    purchaseOrder: "4504887156",
    scheduledFor: quinzeDeOutubro,
    recipientCnpj: UNIDADES[0].cnpj,
    supplierName: "SUPRICORP SUPRIMENTOS LTDA",
    remarcado: false,
  };

  it("leva dia, hora e local — as três coisas que o motorista precisa", () => {
    const { text, subject } = conteudoDoAgendamento(base);
    expect(text).toContain("15/10/2026");
    expect(text).toContain("14:30");
    expect(text).toContain("Rua Antônio Mestriner, 194");
    expect(subject).toContain("15/10/2026");
    expect(subject).toContain("14:30");
  });

  it("leva o endereço do operador logístico, e não o do hospital", () => {
    // É o erro mais caro: o fornecedor manda o caminhão para o hospital que
    // comprou, do outro lado da cidade.
    const { text } = conteudoDoAgendamento(base);
    expect(text).toContain("Local da entrega");
    expect(text).toContain("Guarulhos");
  });

  it("diz que foi remarcada quando a data mudou", () => {
    const remarcado = conteudoDoAgendamento({ ...base, remarcado: true });
    expect(remarcado.subject).toContain("remarcada");
    expect(remarcado.text).toContain("foi remarcada");
    expect(conteudoDoAgendamento(base).text).not.toContain("foi remarcada");
  });

  it("funciona sem número de nota e sem pedido", () => {
    const magro = conteudoDoAgendamento({ ...base, invoiceNumber: null, purchaseOrder: null });
    expect(magro.subject).toContain("sua nota");
    expect(magro.text).toContain("14:30");
    expect(magro.text).not.toContain("Pedido de compra");
  });

  it("escapa o que vai para o HTML", () => {
    // O nome do fornecedor e o número da nota vêm do XML: são texto de fora.
    const comTag = conteudoDoAgendamento({ ...base, invoiceNumber: '<script>alert("x")</script>' });
    expect(comTag.html).not.toContain("<script>");
    expect(comTag.html).toContain("&lt;script&gt;");
  });
});
