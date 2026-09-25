import { describe, expect, it } from "vitest";
import { chavePermitida } from "./_core/storageProxy";

describe("chaves que o proxy de arquivos entrega", () => {
  it("entrega os anexos das notas", () => {
    expect(chavePermitida("agendamentos-xml/12/nota_a1b2c3d4.xml")).toBe(true);
    expect(chavePermitida("recebimentos-avulsos/12/nota_a1b2c3d4.xml")).toBe(true);
    // O PDF da nota de serviço mora em outra pasta, e ficava de fora: o clipe
    // da linha abria e respondia "Arquivo não encontrado".
    expect(chavePermitida("notas-servico/12/nota_a1b2c3d4.pdf")).toBe(true);
  });

  it("recusa os backups do banco", () => {
    // O nome de um backup é previsível pela data, então servi-lo pelo proxy
    // entregaria o banco inteiro a quem tentasse alguns horários.
    expect(chavePermitida("backups/rvd-saude-2026-09-21-1740.json.gz")).toBe(false);
  });

  it("recusa qualquer prefixo que não seja de anexo", () => {
    for (const chave of ["", "/", "outro/arquivo.xml", "logo.png", "agendamentos-xml", "agendamentos"]) {
      expect(chavePermitida(chave)).toBe(false);
    }
  });

  it("recusa caminho que tente escapar do prefixo", () => {
    expect(chavePermitida("agendamentos-xml/../backups/rvd-saude.json.gz")).toBe(false);
    expect(chavePermitida("agendamentos-xml/12/../../backups/x.gz")).toBe(false);
  });

  it("não se deixa enganar por prefixo apenas parecido", () => {
    // A barra no fim do prefixo é o que impede que um nome vizinho passe: sem
    // ela, criar "agendamentos-xml-publico/" abriria o proxy de novo.
    expect(chavePermitida("agendamentos-xml-publico/x.xml")).toBe(false);
    expect(chavePermitida("nao-agendamentos-xml/x.xml")).toBe(false);
  });
});
