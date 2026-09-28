import { describe, expect, it } from "vitest";
import { chaveEmGrupos, dadosDaChave, espelhoDaNotaFileName } from "./espelhoDaNota";

const CHAVE = "35260922333444000172550010000088421000088429";

describe("a chave de acesso na folha", () => {
  it("sai em grupos de quatro, que é como se confere dígito a dígito", () => {
    expect(chaveEmGrupos(CHAVE)).toBe("3526 0922 3334 4400 0172 5500 1000 0088 4210 0008 8429");
  });

  it("aceita a chave que veio com espaços e não duplica a formatação", () => {
    expect(chaveEmGrupos("3526 0922 3334")).toBe("3526 0922 3334");
  });

  it("não inventa nada quando a nota não trouxe chave", () => {
    expect(chaveEmGrupos(null)).toBe("");
    expect(chaveEmGrupos("")).toBe("");
  });
});

describe("o que a própria chave conta", () => {
  it("lê modelo, série e número das posições fixas", () => {
    expect(dadosDaChave(CHAVE)).toEqual({ modelo: "55", serie: "001", numero: "000008842" });
  });

  it("recusa a chave de tamanho errado em vez de ler posição que não existe", () => {
    expect(dadosDaChave("352609223334")).toBeNull();
    expect(dadosDaChave(null)).toBeNull();
  });
});

describe("o nome do arquivo", () => {
  it("leva o número da nota, que é como a pessoa procura depois", () => {
    expect(espelhoDaNotaFileName("8842")).toBe("espelho-nota-8842.pdf");
  });

  it("não gera arquivo chamado 'null' quando a nota não tem número", () => {
    expect(espelhoDaNotaFileName(null)).toBe("espelho-nota-sem-numero.pdf");
  });
});
