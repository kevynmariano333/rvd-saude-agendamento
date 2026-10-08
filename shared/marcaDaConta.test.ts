import { describe, expect, it } from "vitest";
import { corDaConta, CORES_DA_CONTA, inicialDaConta, marcaDoEmail, MARCAS_DA_CONTA } from "./marcaDaConta";

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

describe("a letra da conta", () => {
  it("é a inicial de quem usa", () => {
    expect(inicialDaConta("Kevyn Mariano")).toBe("K");
    expect(inicialDaConta("brenna.dias@rvdsaude.com.br")).toBe("B");
  });

  it("pula o que não é letra", () => {
    // "3M Brasil" começa com um número, e um avatar com "3" não ajuda
    // ninguém a reconhecer a conta.
    expect(inicialDaConta("3M Brasil")).toBe("M");
    expect(inicialDaConta("  ável")).toBe("Á");
  });

  it("cai para o próximo candidato quando o primeiro está vazio", () => {
    expect(inicialDaConta(null, "", "Transportadora Ativa")).toBe("T");
  });

  it("sem nada, não inventa uma letra", () => {
    expect(inicialDaConta(null, undefined, "   ")).toBe("?");
    expect(inicialDaConta("123")).toBe("?");
  });
});

describe("a cor do retrato", () => {
  it("é sempre a mesma para a mesma conta", () => {
    // Cor que muda de tela para tela não ajuda a reconhecer ninguém.
    expect(corDaConta("kevyn.mariano@rvdsaude.com.br")).toBe(corDaConta("KEVYN.MARIANO@rvdsaude.com.br "));
  });

  it("usa só as duas cores da marca", () => {
    const usadas = new Set(["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"].map(conta => corDaConta(conta).fundo));
    for (const fundo of Array.from(usadas)) {
      expect(CORES_DA_CONTA.some(cor => cor.fundo === fundo)).toBe(true);
    }
  });

  it("não devolve sempre a mesma: a lista precisa variar", () => {
    const fundos = new Set(Array.from({ length: 20 }, (_, i) => corDaConta(`pessoa${i}@rvdsaude.com.br`).fundo));
    expect(fundos.size).toBe(2);
  });

  it("conta sem chave ainda tem cor", () => {
    expect(corDaConta(null).fundo).toBeTruthy();
  });
});
