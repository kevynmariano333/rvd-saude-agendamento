import { describe, expect, it } from "vitest";
import { avisoDaEntrega, CAMPOS_DO_OPERADOR, OPERADOR_LOGISTICO } from "./operadorLogistico";

describe("dados do operador logístico", () => {
  it("tem um CNPJ com os catorze dígitos", () => {
    // O print de referência trazia treze — a filial com três dígitos em vez de
    // quatro. Um CNPJ curto no comprovante do motorista é problema na portaria.
    expect(OPERADOR_LOGISTICO.cnpj.replace(/\D/g, "")).toHaveLength(14);
    expect(OPERADOR_LOGISTICO.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });

  it("traz endereço e CEP preenchidos", () => {
    expect(OPERADOR_LOGISTICO.enderecoEntrega.length).toBeGreaterThan(20);
    expect(OPERADOR_LOGISTICO.cep).toMatch(/^\d{5}-\d{3}$/);
  });

  it("lista os quatro campos na ordem em que são lidos", () => {
    expect(CAMPOS_DO_OPERADOR.map(campo => campo.rotulo)).toEqual(["Operador", "CNPJ", "Endereço de entrega", "CEP"]);
    for (const campo of CAMPOS_DO_OPERADOR) expect(campo.valor.trim()).not.toBe("");
  });
});

describe("o aviso de entrega por empresa", () => {
  const HOSPITAL = "06033403000113";
  const RVD = "39283469000110";
  const LLT = "45295469000133";

  it("a nota da Amil mantém o aviso de sempre", () => {
    expect(avisoDaEntrega(HOSPITAL)).toBe(OPERADOR_LOGISTICO.aviso);
  });

  it("a da LLT não diz que a entrega é para a Amil", () => {
    // O texto único dizia "operador logístico da Amil", e o fornecedor da LLT
    // leria que estava entregando para outro cliente.
    const aviso = avisoDaEntrega(LLT);
    expect(aviso).toContain("LLT Distribuição de Produtos");
    expect(aviso).not.toContain("Amil");
    expect(aviso).toContain("operador logístico RVD");
  });

  it("a da RVD também diz para quem é", () => {
    const aviso = avisoDaEntrega(RVD);
    expect(aviso).toContain("RVD Distribuidora de Produtos");
    expect(aviso).not.toContain("Amil");
  });

  it("aceita o CNPJ pontuado, como vem do XML lido na tela", () => {
    expect(avisoDaEntrega("45.295.469/0001-33")).toContain("LLT");
  });

  it("sem destinatário conhecido, não afirma de quem é a carga", () => {
    for (const desconhecido of [null, undefined, "", "99999999999999"]) {
      const aviso = avisoDaEntrega(desconhecido);
      expect(aviso).not.toContain("Amil");
      expect(aviso).toContain("confira o destinatário");
    }
  });
});
