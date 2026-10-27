import { describe, expect, it } from "vitest";
import { horarioSugeridoPorOutro, type SugestaoEmAberto } from "./sugestoesEmAberto";

const AMIL = "06033403000113";
const RVD = "39283469000110";
// 10:00 em Brasília (horário de verão não existe mais; o offset é -03:00).
const DIA_10H = new Date("2030-09-02T13:00:00Z");
const DIA_11H = new Date("2030-09-02T14:00:00Z");

const sugestao = (extra: Partial<SugestaoEmAberto>): SugestaoEmAberto => ({
  supplierId: 1,
  suggestedFor: DIA_10H,
  recipientCnpj: AMIL,
  ...extra,
});

describe("horarioSugeridoPorOutro", () => {
  it("bloqueia a mesma data e hora sugerida por outro fornecedor da mesma empresa", () => {
    expect(horarioSugeridoPorOutro(DIA_10H, { supplierId: 2, recipientCnpj: AMIL }, [sugestao({ supplierId: 1 })])).toBe(true);
  });

  it("não bloqueia quem já sugeriu esse horário", () => {
    expect(horarioSugeridoPorOutro(DIA_10H, { supplierId: 1, recipientCnpj: AMIL }, [sugestao({ supplierId: 1 })])).toBe(false);
  });

  it("não bloqueia outra hora do mesmo dia", () => {
    expect(horarioSugeridoPorOutro(DIA_11H, { supplierId: 2, recipientCnpj: AMIL }, [sugestao({ supplierId: 1 })])).toBe(false);
  });

  it("não bloqueia outra empresa: RVD e Amil recebem ao mesmo tempo", () => {
    expect(horarioSugeridoPorOutro(DIA_10H, { supplierId: 2, recipientCnpj: RVD }, [sugestao({ supplierId: 1, recipientCnpj: AMIL })])).toBe(false);
  });

  it("não bloqueia a mesma hora em outro dia", () => {
    const outroDia = new Date("2030-09-03T13:00:00Z");
    expect(horarioSugeridoPorOutro(outroDia, { supplierId: 2, recipientCnpj: AMIL }, [sugestao({ supplierId: 1 })])).toBe(false);
  });

  it("sem sugestões em aberto, o horário está livre", () => {
    expect(horarioSugeridoPorOutro(DIA_10H, { supplierId: 2, recipientCnpj: AMIL }, [])).toBe(false);
  });
});
