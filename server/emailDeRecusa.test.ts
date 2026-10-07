import { describe, expect, it } from "vitest";
import { conteudoDaRecusa, oQueFazerAgora, soADescricao, type DadosDaRecusa } from "./emailDeRecusa";

const recusa = (dados: Partial<DadosDaRecusa> = {}): DadosDaRecusa => ({
  invoiceNumber: "8507",
  purchaseOrder: "4000123456",
  scheduledFor: new Date("2026-10-06T13:00:00.000Z"),
  recipientCnpj: "06033403000113",
  motivoCodigo: "DOCUMENTO_IRREGULAR",
  descricao: "A nota veio sem o XML e sem a chave de acesso.",
  recusadaEm: new Date("2026-10-07T17:30:00.000Z"),
  ...dados,
});

describe("o e-mail de recusa", () => {
  it("diz o motivo no assunto, que é o que se lê na lista do celular", () => {
    // "Sua nota foi recusada", sozinho, obriga o fornecedor a ligar para
    // perguntar o que houve — e quem atende é a mesma doca que recusou.
    expect(conteudoDaRecusa(recusa()).subject).toBe("Entrega recusada: Documento fiscal irregular · NF 8507");
  });

  it("leva o motivo, o que houve e o pedido", () => {
    const { text } = conteudoDaRecusa(recusa());
    expect(text).toContain("Motivo da recusa: Documento fiscal irregular");
    expect(text).toContain("O que houve: A nota veio sem o XML e sem a chave de acesso.");
    expect(text).toContain("Pedido de compra: 4000123456");
  });

  it("não repete o rótulo quando a descrição já o carrega", () => {
    // O portal grava "Documento fiscal irregular — A nota veio sem o XML";
    // duas linhas seguidas dizendo a mesma coisa fazem a mensagem gaguejar.
    const { text } = conteudoDaRecusa(recusa({ descricao: "Documento fiscal irregular" }));
    expect(text).not.toContain("O que houve:");
    const comPrefixo = conteudoDaRecusa(recusa({ descricao: "Documento fiscal irregular — A nota veio sem o XML." }));
    expect(comPrefixo.text).toContain("O que houve: A nota veio sem o XML.");
  });

  it("recusa sem motivo gravado não finge ter um", () => {
    const { text, subject } = conteudoDaRecusa(recusa({ motivoCodigo: null, descricao: null }));
    expect(text).toContain("Motivo da recusa: Motivo não informado");
    expect(subject).toContain("Motivo não informado");
  });

  it("nota sem número continua endereçável", () => {
    expect(conteudoDaRecusa(recusa({ invoiceNumber: null })).subject).toContain("sua nota");
    expect(conteudoDaRecusa(recusa({ invoiceNumber: null })).text).toContain("Nota fiscal: não informada");
  });

  it("a data que estava marcada aparece no horário de Brasília", () => {
    expect(conteudoDaRecusa(recusa()).text).toContain("Data que estava marcada: 06/10/2026, 10:00");
  });

  it("recebimento sem agendamento não inventa uma data marcada", () => {
    expect(conteudoDaRecusa(recusa({ scheduledFor: null })).text).not.toContain("Data que estava marcada");
  });

  it("o que o fornecedor digitou não vira HTML dentro do e-mail", () => {
    const { html } = conteudoDaRecusa(recusa({ descricao: '<script>alert("x")</script>' }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("o que fazer agora", () => {
  it("muda com o motivo", () => {
    // Mandar "corrija e reagende" para quem cancelou a própria entrega é
    // ruído; e quem teve a carga avariada precisa saber da coleta.
    expect(oQueFazerAgora("DOCUMENTO_IRREGULAR")).toContain("Corrija o documento fiscal");
    expect(oQueFazerAgora("CARGA_AVARIADA")).toContain("coleta");
    expect(oQueFazerAgora("DUPLICIDADE")).toContain("Não é preciso reenviar");
    expect(oQueFazerAgora("CANCELADA_FORNECEDOR")).toContain("partiu de vocês");
  });

  it("motivo desconhecido ainda diz o caminho", () => {
    expect(oQueFazerAgora(null)).toContain("marque uma nova data pelo portal");
    expect(oQueFazerAgora("MOTIVO_QUE_NAO_EXISTE")).toContain("marque uma nova data pelo portal");
  });
});

describe("a descrição sem o rótulo que ela já carrega", () => {
  it("tira o rótulo que o portal grava junto", () => {
    // O que fica na nota é "Documento fiscal irregular — A nota veio sem o
    // XML". No e-mail o rótulo já tem a linha dele.
    expect(soADescricao("DOCUMENTO_IRREGULAR", "Documento fiscal irregular — A nota veio sem o XML.")).toBe("A nota veio sem o XML.");
    expect(soADescricao("CARGA_AVARIADA", "Carga avariada: três caixas molhadas")).toBe("três caixas molhadas");
  });

  it("descrição que é só o rótulo não vira linha nenhuma", () => {
    expect(soADescricao("NAO_COMPARECEU", "Não compareceu")).toBe("");
  });

  it("descrição que não começa pelo rótulo passa inteira", () => {
    expect(soADescricao("CARGA_AVARIADA", "Três caixas molhadas na chuva")).toBe("Três caixas molhadas na chuva");
  });

  it("sem descrição, não sobra nada", () => {
    expect(soADescricao("OUTRO", null)).toBe("");
    expect(soADescricao(null, "   ")).toBe("");
  });
});
