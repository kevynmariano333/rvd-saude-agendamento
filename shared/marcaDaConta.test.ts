import { describe, expect, it } from "vitest";
import { marcaDoEmail, MARCAS_DA_CONTA } from "./marcaDaConta";

describe("de qual empresa é a conta", () => {
  it("o domínio da RVD traz o logo da RVD", () => {
    expect(marcaDoEmail("kevyn.mariano@rvdsaude.com.br")).toBe("rvd");
    expect(marcaDoEmail("BRENNA.DIAS@RVDSAUDE.COM.BR")).toBe("rvd");
  });

  it("o domínio da Amil traz o logo da Amil", () => {
    // É por onde entram os planejadores.
    expect(marcaDoEmail("lorran.santos@amil.com.br")).toBe("amil");
  });

  it("fornecedor não vira gente de dentro", () => {
    expect(marcaDoEmail("vendas30106@ablbrasil.com.br")).toBeNull();
    expect(marcaDoEmail("agendamento@ativalog.com.br")).toBeNull();
  });

  it("o nome não decide nada: só o que vem depois do @", () => {
    // "Amil Distribuidora" não é a Amil, e "rvd" no nome de alguém não faz
    // dele da RVD.
    expect(marcaDoEmail("rvd.logistica@outroprovedor.com")).toBeNull();
    expect(marcaDoEmail("contato@amil.com.br.fornecedor.com")).toBeNull();
    expect(marcaDoEmail("vendas@naoamil.com.br")).toBeNull();
  });

  it("subdomínio da empresa continua sendo a empresa", () => {
    expect(marcaDoEmail("ti@suporte.rvdsaude.com.br")).toBe("rvd");
    expect(marcaDoEmail("x@corp.amil.com.br")).toBe("amil");
  });

  it("conta sem e-mail não ganha marca nenhuma", () => {
    expect(marcaDoEmail(null)).toBeNull();
    expect(marcaDoEmail("")).toBeNull();
    expect(marcaDoEmail("admin")).toBeNull();
  });

  it("cada marca aponta para um arquivo que o portal serve", () => {
    for (const marca of Object.values(MARCAS_DA_CONTA)) {
      expect(marca.logo.startsWith("/")).toBe(true);
      expect(marca.nome.length).toBeGreaterThan(0);
    }
  });
});
