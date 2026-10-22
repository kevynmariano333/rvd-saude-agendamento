import { describe, expect, it } from "vitest";
import {
  cargoExisteNaEmpresa,
  cargoExisteNasEmpresas,
  gravarEmpresas,
  lerEmpresas,
  recursosDasEmpresas,
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
    expect(notaNoEscopo(["rvd"], RVD)).toBe(true);
    expect(notaNoEscopo(["rvd"], HOSPITAL)).toBe(false);
    expect(notaNoEscopo(["rvd"], LLT)).toBe(false);
    expect(notaNoEscopo(["llt"], LLT)).toBe(true);
    expect(notaNoEscopo(["llt"], RVD)).toBe(false);
    expect(notaNoEscopo(["amil"], HOSPITAL)).toBe(true);
    expect(notaNoEscopo(["amil"], RVD)).toBe(false);
    expect(notaNoEscopo(["amil"], LLT)).toBe(false);
  });

  it("a nota sem destinatário não vaza para a RVD nem para a LLT", () => {
    expect(notaNoEscopo(["rvd"], null)).toBe(false);
    expect(notaNoEscopo(["llt"], null)).toBe(false);
    expect(notaNoEscopo(["amil"], null)).toBe(true);
  });

  it("toda nota é de exatamente uma empresa: nenhuma fica sem dono nem com dois", () => {
    for (const cnpj of [HOSPITAL, MATERNIDADE, RVD, LLT, null, "99999999999999"]) {
      const donas = EMPRESAS.filter(empresa => notaNoEscopo([empresa.codigo], cnpj));
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
    expect(recursosDaEmpresa("amil")).toEqual({ temMiro: true, temBacklog: true, temPlanejador: true, temNotaDeServico: true });
  });

  it("a RVD e a LLT não têm MIRO, backlog nem planejador", () => {
    for (const empresa of ["rvd", "llt"]) {
      expect(recursosDaEmpresa(empresa)).toEqual({ temMiro: false, temBacklog: false, temPlanejador: false, temNotaDeServico: false });
    }
  });

  it("empresa desconhecida ganha o mais restrito", () => {
    expect(recursosDaEmpresa("outra")).toEqual({ temMiro: false, temBacklog: false, temPlanejador: false, temNotaDeServico: false });
    expect(recursosDaEmpresa(null)).toEqual({ temMiro: false, temBacklog: false, temPlanejador: false, temNotaDeServico: false });
  });

  it("a nota de serviço é só da Amil", () => {
    expect(recursosDaEmpresa("amil").temNotaDeServico).toBe(true);
    expect(recursosDaEmpresa("rvd").temNotaDeServico).toBe(false);
    expect(recursosDaEmpresa("llt").temNotaDeServico).toBe(false);
    expect(recursosDaNota(RVD).temNotaDeServico).toBe(false);
    expect(recursosDaNota(HOSPITAL).temNotaDeServico).toBe(true);
    // Quem atende a Amil e a RVD tem a nota de serviço: a Amil a usa.
    expect(recursosDasEmpresas(["amil", "rvd"]).temNotaDeServico).toBe(true);
    expect(recursosDasEmpresas(["rvd", "llt"]).temNotaDeServico).toBe(false);
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

describe("quem atende mais de uma empresa", () => {
  it("lê a lista que a conta guarda, na ordem do cadastro", () => {
    expect(lerEmpresas("rvd,llt")).toEqual(["rvd", "llt"]);
    expect(lerEmpresas("llt,rvd")).toEqual(["rvd", "llt"]);
    expect(lerEmpresas("amil")).toEqual(["amil"]);
    expect(lerEmpresas("amil, rvd , llt")).toEqual(["amil", "rvd", "llt"]);
  });

  it("não repete nem aceita o que não existe", () => {
    expect(lerEmpresas("rvd,rvd,xyz")).toEqual(["rvd"]);
  });

  it("valor vazio ou ilegível é Amil, e nunca abre as outras", () => {
    for (const ruim of [null, undefined, "", "   ", "todas", "rvd;llt", "RVD"]) expect(lerEmpresas(ruim)).toEqual(["amil"]);
  });

  it("grava sempre do mesmo jeito: o mesmo conjunto dá o mesmo texto", () => {
    expect(gravarEmpresas(["llt", "rvd"])).toBe("rvd,llt");
    expect(gravarEmpresas(["rvd", "llt"])).toBe("rvd,llt");
    expect(gravarEmpresas(["rvd", "rvd"])).toBe("rvd");
  });

  it("nunca grava uma lista vazia", () => {
    expect(gravarEmpresas([])).toBe("amil");
    expect(gravarEmpresas(["xyz"])).toBe("amil");
  });

  it("o que se grava cabe na coluna, mesmo com as três", () => {
    expect(gravarEmpresas(["amil", "rvd", "llt"]).length).toBeLessThanOrEqual(30);
  });

  it("o que se grava volta igual quando é lido", () => {
    for (const conjunto of [["amil"], ["rvd"], ["rvd", "llt"], ["amil", "rvd", "llt"]]) {
      expect(lerEmpresas(gravarEmpresas(conjunto))).toEqual(conjunto);
    }
  });

  it("o corte com duas empresas deixa passar as duas e barra a terceira", () => {
    expect(notaNoEscopo(["rvd", "llt"], RVD)).toBe(true);
    expect(notaNoEscopo(["rvd", "llt"], LLT)).toBe(true);
    expect(notaNoEscopo(["rvd", "llt"], HOSPITAL)).toBe(false);
    expect(notaNoEscopo(["rvd", "llt"], null)).toBe(false);
  });

  it("os recursos são os que qualquer uma das empresas tem", () => {
    // Quem cuida da Amil e da RVD precisa do Backlog: a Amil o usa.
    expect(recursosDasEmpresas(["amil", "rvd"]).temBacklog).toBe(true);
    expect(recursosDasEmpresas(["rvd", "llt"])).toEqual({ temMiro: false, temBacklog: false, temPlanejador: false, temNotaDeServico: false });
    expect(recursosDasEmpresas(null)).toEqual({ temMiro: true, temBacklog: true, temPlanejador: true, temNotaDeServico: true });
  });

  it("o planejador pede que todas as empresas da conta o tenham", () => {
    expect(cargoExisteNasEmpresas("planejador", ["amil"])).toBe(true);
    expect(cargoExisteNasEmpresas("planejador", ["amil", "rvd"])).toBe(false);
    expect(cargoExisteNasEmpresas("operator", ["rvd", "llt"])).toBe(true);
  });
});
