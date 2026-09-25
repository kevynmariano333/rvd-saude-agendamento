import { describe, expect, it } from "vitest";
import { conteudoDoTeste, motivoDaFalha, nomeDoCaminho } from "./emailDeTeste";

describe("e-mail de teste", () => {
  it("diz por onde saiu e com que remetente — é o que se confere", () => {
    const conteudo = conteudoDoTeste({ caminho: "smtp", remetente: "agendamento@rvdsaude.com.br", quando: new Date("2026-09-25T15:30:00Z") });
    expect(conteudo.text).toContain("a caixa de e-mail da empresa (SMTP)");
    expect(conteudo.text).toContain("agendamento@rvdsaude.com.br");
    expect(conteudo.html).toContain("agendamento@rvdsaude.com.br");
  });

  it("chama cada caminho pelo nome de quem lê", () => {
    expect(nomeDoCaminho("smtp")).toContain("empresa");
    expect(nomeDoCaminho("resend")).toContain("Resend");
  });

  it("mostra a hora de Brasília, que é a que o administrador confere no relógio", () => {
    const conteudo = conteudoDoTeste({ caminho: "smtp", remetente: "a@b.com", quando: new Date("2026-09-25T15:30:00Z") });
    expect(conteudo.text).toContain("12:30");
  });
});

describe("motivo da falha de envio", () => {
  it("fica com a primeira linha, que é a que diz o que fazer", () => {
    const erro = new Error("535 5.7.139 Authentication unsuccessful\n    at SMTPConnection._formatError\n    at Socket.emit");
    expect(motivoDaFalha(erro)).toBe("535 5.7.139 Authentication unsuccessful");
  });

  it("corta o que não caberia num aviso de tela", () => {
    expect(motivoDaFalha(new Error("x".repeat(500))).length).toBe(300);
  });

  it("responde alguma coisa mesmo quando o provedor não explica", () => {
    expect(motivoDaFalha(new Error(""))).toBe("Motivo não informado pelo provedor.");
  });
});
