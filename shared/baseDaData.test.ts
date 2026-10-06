import { describe, expect, it } from "vitest";
import { BASES_DA_DATA, BASE_DA_DATA_PADRAO, ehBaseDaData, ROTULOS_DA_BASE } from "./baseDaData";

describe("a que data o período do relatório se aplica", () => {
  it("o padrão é o agendamento, que é como o relatório sempre funcionou", () => {
    // Trocar o padrão mudaria em silêncio o número que alguém usa para fechar
    // o mês, e sem ninguém ter pedido.
    expect(BASE_DA_DATA_PADRAO).toBe("agendamento");
  });

  it("aceita só as três que a tela oferece", () => {
    for (const base of BASES_DA_DATA) expect(ehBaseDaData(base)).toBe(true);
    expect(ehBaseDaData("conclusao")).toBe(false);
    expect(ehBaseDaData("")).toBe(false);
    expect(ehBaseDaData(null)).toBe(false);
    expect(ehBaseDaData(undefined)).toBe(false);
  });

  it("cada escolha muda o que os campos de data dizem", () => {
    // O campo não pode continuar escrito "Agendamento: início" depois de a
    // pessoa escolher recebimento: era exatamente essa leitura que enganava.
    expect(ROTULOS_DA_BASE.recebimento.inicio).toContain("Recebimento");
    expect(ROTULOS_DA_BASE.criacao.inicio).toContain("Criação");
    expect(ROTULOS_DA_BASE.agendamento.inicio).toContain("Agendamento");
  });

  it("toda base tem rótulo, e nenhuma fica sem explicação", () => {
    for (const base of BASES_DA_DATA) {
      expect(ROTULOS_DA_BASE[base].nome.length).toBeGreaterThan(5);
      expect(ROTULOS_DA_BASE[base].explica.length).toBeGreaterThan(20);
    }
  });
});
