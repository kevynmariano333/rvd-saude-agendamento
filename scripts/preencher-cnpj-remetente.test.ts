import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — script em JavaScript puro, para rodar no container sem tsx.
import { cnpjDoEmitente } from "./preencher-cnpj-remetente.mjs";

const PASTA = new URL("../docs/demonstracao/", import.meta.url);

describe("leitura do CNPJ do emitente nos XMLs guardados", () => {
  it("pega o emitente, e não o destinatário", () => {
    // O destinatário (RVD) aparece depois no arquivo; uma busca solta por CNPJ
    // acharia o dele primeiro em algumas notas.
    const xml = '<NFe><emit><CNPJ>98.765.432/0001-55</CNPJ><xNome>Emitente</xNome></emit><dest><CNPJ>06033403000113</CNPJ></dest></NFe>';
    expect(cnpjDoEmitente(xml)).toBe("98765432000155");
  });

  it("lê os XMLs reais de demonstração", () => {
    const arquivos = readdirSync(PASTA).filter(nome => nome.endsWith(".xml"));
    expect(arquivos.length).toBeGreaterThan(0);
    for (const arquivo of arquivos) {
      const cnpj = cnpjDoEmitente(readFileSync(new URL(arquivo, PASTA), "utf8"));
      expect(cnpj).toMatch(/^\d{14}$/);
      expect(cnpj).not.toBe("06033403000113");
    }
  });

  it("aceita CPF e prefixo de namespace", () => {
    expect(cnpjDoEmitente("<nfe:emit><nfe:CPF>123.456.789-09</nfe:CPF></nfe:emit>")).toBe("12345678909");
  });

  it("devolve nulo quando não há emitente ou o número é curto demais", () => {
    expect(cnpjDoEmitente("<NFe><dest><CNPJ>06033403000113</CNPJ></dest></NFe>")).toBeNull();
    expect(cnpjDoEmitente("<emit><CNPJ>123</CNPJ></emit>")).toBeNull();
    expect(cnpjDoEmitente("")).toBeNull();
  });
});
