import { describe, expect, it } from "vitest";
import { classificationDetailsFor, classificationLabel, formatElapsed } from "./attendance";

describe("rótulos de classificação", () => {
  it("omite o subtipo quando ele não se aplica", () => {
    expect(classificationLabel("llt", "nao_aplicavel")).toBe("LLT");
  });

  it("combina classificação e subtipo quando existe um", () => {
    expect(classificationLabel("amil", "maternidade")).toBe("AMIL · Maternidade");
    expect(classificationLabel("rvd", "mercado_livre")).toBe("RVD · Mercado Livre");
  });

  it("oferece os mesmos subtipos aceitos pelo servidor", () => {
    expect(classificationDetailsFor("amil")).toEqual(["maternidade", "hospital"]);
    expect(classificationDetailsFor("rvd")).toEqual(["sedex", "mercado_livre"]);
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
