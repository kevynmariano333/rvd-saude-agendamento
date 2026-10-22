import { describe, expect, it } from "vitest";
import {
  cargoExisteNaEmpresa,
  cnpjsDaEmpresa,
  EMPRESAS,
  empresaDoCnpj,
  ehCargoDeMesa,
  nomeDaEmpresa,
  notaNoEscopo,
  recursosDaEmpresa,
  recursosDaNota,
} from "./empresas";
import { UNIDADES } from "./recipients";

const HOSPITAL = "06033403000113";
const MATERNIDADE = "43293604002120";
const RVD = "39283469000110";
const LLT = "45295469000133";

describe("de qual empresa é a nota", () => {
  it("reconhece a empresa pelo CNPJ de quem recebe", () => {
    expect(empresaDoCnpj(HOSPITAL)).toBe("amil");
    expect(empresaDoCnpj(MATERNIDADE)).toBe("amil");
    expect(empresaDoCnpj(RVD)).toBe("rvd");
    expect(empresaDoCnpj(LLT)).toBe("llt");
  });

  it("aceita o CNPJ pontuado, como vem de um filtro digitado", () => {
    expect(empresaDoCnpj("39.283.469/0001-10")).toBe("rvd");
    expect(empresaDoCnpj("45.295.469/0001-33")).toBe("llt");
  });

  it("a nota sem destinatário reconhecível é da Amil", () => {
    // O portal nasceu só com a Amil: o acervo antigo não tem CNPJ de unidade, e
    // tratá-lo como "de ninguém" o faria sumir da mesa que sempre o viu.
    expect(empresaDoCnpj(null)).toBe("amil");
    expect(empresaDoCnpj("")).toBe("amil");
    expect(empresaDoCnpj("99999999999999")).toBe("amil");
  });
});

describe("o corte de quem enxerga a nota", () => {
  it("sem corte, vê tudo", () => {
    for (const cnpj of [HOSPITAL, RVD, LLT, null]) expect(notaNoEscopo(null, cnpj)).toBe(true);
  });

  it("cada empresa vê só a dela", () => {
    expect(notaNoEscopo("rvd", RVD)).toBe(true);
    expect(notaNoEscopo("rvd", HOSPITAL)).toBe(false);
    expect(notaNoEscopo("rvd", LLT)).toBe(false);
    expect(notaNoEscopo("llt", LLT)).toBe(true);
    expect(notaNoEscopo("llt", RVD)).toBe(false);
    expect(notaNoEscopo("amil", HOSPITAL)).toBe(true);
    expect(notaNoEscopo("amil", RVD)).toBe(false);
    expect(notaNoEscopo("amil", LLT)).toBe(false);
  });

  it("a nota sem destinatário não vaza para a RVD nem para a LLT", () => {
    expect(notaNoEscopo("rvd", null)).toBe(false);
    expect(notaNoEscopo("llt", null)).toBe(false);
    expect(notaNoEscopo("amil", null)).toBe(true);
  });

  it("toda nota é de exatamente uma empresa: nenhuma fica sem dono nem com dois", () => {
    for (const cnpj of [HOSPITAL, MATERNIDADE, RVD, LLT, null, "99999999999999"]) {
      const donas = EMPRESAS.filter(empresa => notaNoEscopo(empresa.codigo, cnpj));
      expect(donas).toHaveLength(1);
    }
  });
});

describe("o cadastro das empresas", () => {
  it("cada unidade pertence a uma empresa que existe", () => {
    for (const unidade of UNIDADES) expect(EMPRESAS.map(empresa => empresa.codigo)).toContain(unidade.empresa);
  });

  it("cada empresa tem ao menos uma unidade", () => {
    for (const empresa of EMPRESAS) expect(cnpjsDaEmpresa(empresa.codigo).length).toBeGreaterThan(0);
  });

  it("nenhum CNPJ está em duas empresas", () => {
    const todos = UNIDADES.map(unidade => unidade.cnpj);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("os CNPJs cadastrados têm 14 dígitos", () => {
    for (const unidade of UNIDADES) expect(unidade.cnpj).toMatch(/^\d{14}$/);
  });

  it("diz o nome da empresa, e \"todas\" quando não há corte", () => {
    expect(nomeDaEmpresa("rvd")).toBe("RVD Saúde");
    expect(nomeDaEmpresa("llt")).toBe("LLT Saúde");
    expect(nomeDaEmpresa(null)).toBe("Todas as empresas");
  });
});

describe("o que cada empresa usa", () => {
  it("a Amil usa tudo", () => {
    expect(recursosDaEmpresa("amil")).toEqual({ temMiro: true, temBacklog: true, temPlanejador: true });
  });

  it("a RVD e a LLT não têm MIRO, backlog nem planejador", () => {
    for (const empresa of ["rvd", "llt"]) {
      expect(recursosDaEmpresa(empresa)).toEqual({ temMiro: false, temBacklog: false, temPlanejador: false });
    }
  });

  it("empresa desconhecida ganha o mais restrito", () => {
    expect(recursosDaEmpresa("outra")).toEqual({ temMiro: false, temBacklog: false, temPlanejador: false });
    expect(recursosDaEmpresa(null)).toEqual({ temMiro: false, temBacklog: false, temPlanejador: false });
  });

  it("os recursos de uma nota saem do destinatário dela", () => {
    expect(recursosDaNota(HOSPITAL).temMiro).toBe(true);
    expect(recursosDaNota(RVD).temMiro).toBe(false);
    expect(recursosDaNota(LLT).temBacklog).toBe(false);
    // Acervo antigo sem CNPJ continua com MIRO e backlog, como sempre teve.
    expect(recursosDaNota(null).temBacklog).toBe(true);
  });
});

describe("os cargos por empresa", () => {
  it("só operador e planejador trabalham dentro de uma empresa", () => {
    expect(ehCargoDeMesa("operator")).toBe(true);
    expect(ehCargoDeMesa("planejador")).toBe(true);
    expect(ehCargoDeMesa("planejador_leitura")).toBe(true);
    for (const outro of ["admin", "supplier", "portaria", "operacao"]) expect(ehCargoDeMesa(outro)).toBe(false);
  });

  it("planejador só existe na Amil, por enquanto", () => {
    expect(cargoExisteNaEmpresa("planejador", "amil")).toBe(true);
    expect(cargoExisteNaEmpresa("planejador", "rvd")).toBe(false);
    expect(cargoExisteNaEmpresa("planejador_leitura", "llt")).toBe(false);
  });

  it("operador existe nas três", () => {
    for (const empresa of ["amil", "rvd", "llt"]) expect(cargoExisteNaEmpresa("operator", empresa)).toBe(true);
  });
});
