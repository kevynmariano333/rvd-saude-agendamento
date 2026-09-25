import { describe, expect, it } from "vitest";
import { escolherCaminho } from "./mailer";

const vazio = { smtpHost: "", smtpUser: "", smtpPassword: "", resendApiKey: "", mailFrom: "" };

describe("por onde o e-mail sai", () => {
  it("não manda nada quando nada foi configurado", () => {
    expect(escolherCaminho(vazio)).toBeNull();
  });

  it("usa a caixa da empresa quando host, usuário e senha estão lá", () => {
    expect(escolherCaminho({ ...vazio, smtpHost: "smtp.office365.com", smtpUser: "a@b.com", smtpPassword: "x" })).toBe("smtp");
  });

  it("não conta como configurado o SMTP sem senha", () => {
    // Host e usuário sem senha é configuração pela metade: a conexão abriria
    // para ser recusada na autenticação, e o sistema teria prometido um aviso
    // que nunca sai.
    expect(escolherCaminho({ ...vazio, smtpHost: "smtp.office365.com", smtpUser: "a@b.com" })).toBeNull();
  });

  it("cai no Resend quando só ele está configurado", () => {
    expect(escolherCaminho({ ...vazio, resendApiKey: "re_123", mailFrom: "portal@empresa.com" })).toBe("resend");
  });

  it("não usa o Resend sem remetente: a API recusa o envio sem ele", () => {
    expect(escolherCaminho({ ...vazio, resendApiKey: "re_123" })).toBeNull();
  });

  it("com os dois configurados, manda pela caixa da empresa", () => {
    // É o remetente que o fornecedor reconhece; o Resend fica de reserva.
    const config = { ...vazio, smtpHost: "smtp.office365.com", smtpUser: "a@b.com", smtpPassword: "x", resendApiKey: "re_123", mailFrom: "portal@empresa.com" };
    expect(escolherCaminho(config)).toBe("smtp");
  });
});
