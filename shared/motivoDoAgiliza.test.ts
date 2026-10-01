import { describe, expect, it } from "vitest";
import { codigoDoAgilizaNaLinha, codigoDoAgilizaNoHistorico } from "./motivoDoAgiliza";

const linhaDoAcervo = (codigo: string) =>
  `Importação do histórico do Agiliza: Nota enviada ao backlog no sistema Agiliza (motivo: ${codigo}).`;

describe("o motivo que o Agiliza deu, lido do histórico", () => {
  it("tira o código da linha que a importação escreveu", () => {
    expect(codigoDoAgilizaNaLinha(linhaDoAcervo("divergencia_preco"))).toBe("divergencia_preco");
  });

  it("uma ida ao backlog sem motivo no acervo não inventa um", () => {
    expect(codigoDoAgilizaNaLinha("Importação do histórico do Agiliza: Nota enviada ao backlog no sistema Agiliza.")).toBeNull();
    expect(codigoDoAgilizaNaLinha("")).toBeNull();
    expect(codigoDoAgilizaNaLinha(null)).toBeNull();
  });

  it("não confunde com o resto do histórico", () => {
    expect(codigoDoAgilizaNaLinha("Importação do histórico do Agiliza: Data agendada no sistema Agiliza.")).toBeNull();
    expect(codigoDoAgilizaNaLinha("Devolvida ao backlog pelo administrador: Divergência de preço.")).toBeNull();
  });

  it("de duas idas ao backlog, vale a mais recente", () => {
    // As linhas chegam da mais nova para a mais velha: a nota travou por preço,
    // foi resolvida, e travou de novo por caixaria — é caixaria que estava
    // aberto quando o acervo foi importado.
    expect(codigoDoAgilizaNoHistorico([
      linhaDoAcervo("caixaria"),
      "Importação do histórico do Agiliza: Backlog resolvido no sistema Agiliza.",
      linhaDoAcervo("divergencia_preco"),
    ])).toBe("caixaria");
  });

  it("nota que nunca veio do Agiliza não tem motivo a recuperar", () => {
    expect(codigoDoAgilizaNoHistorico(["Agendada pelo operador.", "Recebida na doca."])).toBeNull();
    expect(codigoDoAgilizaNoHistorico([])).toBeNull();
  });
});
