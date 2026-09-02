import { describe, expect, it } from "vitest";
import { classificationDetailsFor, classificationLabel, formatElapsed, parseInvoiceNumbers, stayDuration } from "./attendance";

describe("rótulos de classificação", () => {
  it("omite o subtipo quando ele não se aplica", () => {
    expect(classificationLabel("llt", "nao_aplicavel")).toBe("LLT");
  });

  it("combina classificação e subtipo quando existe um", () => {
    expect(classificationLabel("amil", "maternidade")).toBe("AMIL · Maternidade");
    expect(classificationLabel("rvd", "mercado_livre")).toBe("RVD · Mercado Livre");
    expect(classificationLabel("rvd", "jamef")).toBe("RVD · Jamef");
  });

  it("oferece os mesmos subtipos aceitos pelo servidor", () => {
    expect(classificationDetailsFor("amil")).toEqual(["maternidade", "hospital"]);
    expect(classificationDetailsFor("rvd")).toEqual([
      "correios",
      "braspress",
      "excargo",
      "rodonaves",
      "br4",
      "jamef",
      "mercado_livre",
      "cliente_retira",
    ]);
    expect(classificationDetailsFor("llt")).toEqual(["nao_aplicavel"]);
  });
});

describe("tempo na unidade", () => {
  const reference = new Date("2026-09-01T12:00:00.000Z");

  it("mostra minutos na primeira hora", () => {
    expect(formatElapsed(new Date("2026-09-01T11:25:00.000Z"), reference)).toBe("35 min");
  });

  it("passa a horas e minutos depois disso", () => {
    expect(formatElapsed(new Date("2026-09-01T09:30:00.000Z"), reference)).toBe("2h 30min");
    expect(formatElapsed(new Date("2026-09-01T09:00:00.000Z"), reference)).toBe("3h");
  });

  it("usa dias para esperas longas", () => {
    expect(formatElapsed(new Date("2026-08-30T10:00:00.000Z"), reference)).toBe("2d 2h");
  });

  it("nunca reporta tempo negativo para uma chegada futura", () => {
    expect(formatElapsed(new Date("2026-09-01T12:30:00.000Z"), reference)).toBe("0 min");
  });
});

describe("notas do protocolo", () => {
  it("lê a lista gravada no registro", () => {
    expect(parseInvoiceNumbers('["123","456"]')).toEqual(["123", "456"]);
  });

  it("devolve lista vazia quando não há nota ou o conteúdo está corrompido", () => {
    expect(parseInvoiceNumbers(null)).toEqual([]);
    expect(parseInvoiceNumbers("")).toEqual([]);
    expect(parseInvoiceNumbers("nao-e-json")).toEqual([]);
    expect(parseInvoiceNumbers('{"a":1}')).toEqual([]);
  });

  it("descarta entradas que não são texto", () => {
    expect(parseInvoiceNumbers('["123",7,null,"456"]')).toEqual(["123", "456"]);
  });
});

describe("permanência na unidade", () => {
  const arrivalAt = new Date("2026-09-01T12:00:00.000Z");
  const agora = new Date("2026-09-01T14:30:00.000Z");

  it("fecha na saída quando o caminhão já foi embora", () => {
    expect(
      stayDuration(
        { status: "concluido", arrivalAt, concludedAt: new Date("2026-09-01T13:10:00.000Z") },
        agora
      )
    ).toEqual({ text: "1h 10min", ongoing: false });
  });

  it("segue correndo enquanto o caminhão está dentro", () => {
    expect(stayDuration({ status: "em_atendimento", arrivalAt, concludedAt: null }, agora)).toEqual({
      text: "2h 30min",
      ongoing: true,
    });
  });

  // O caminhão recusado não entrou, e o que espera no acesso ainda não entrou:
  // nenhum dos dois tem permanência.
  it("não atribui permanência a quem não entrou", () => {
    expect(stayDuration({ status: "recusado", arrivalAt, concludedAt: null }, agora)).toBeNull();
    expect(stayDuration({ status: "aguardando", arrivalAt, concludedAt: null }, agora)).toBeNull();
  });
});
