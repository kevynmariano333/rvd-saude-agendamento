import { afterEach, describe, expect, it, vi } from "vitest";
import { enderecoIPv4, escolherCaminho } from "./mailer";

const vazio = { brevoApiKey: "", smtpHost: "", smtpUser: "", smtpPassword: "", resendApiKey: "", mailFrom: "" };

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

  it("usa o Brevo quando a chave e o remetente estão lá", () => {
    expect(escolherCaminho({ ...vazio, brevoApiKey: "xkeysib-123", mailFrom: "agendamento@empresa.com" })).toBe("brevo");
  });

  it("não usa o Brevo sem remetente: ele recusa o envio sem um confirmado", () => {
    expect(escolherCaminho({ ...vazio, brevoApiKey: "xkeysib-123" })).toBeNull();
  });

  it("prefere o que sai por HTTPS ao SMTP configurado", () => {
    // A hospedagem bloqueia a porta de SMTP: com os dois ligados, mandar por
    // ela seria escolher justamente o caminho que não chega.
    const config = { ...vazio, brevoApiKey: "xkeysib-123", smtpHost: "smtp.office365.com", smtpUser: "a@b.com", smtpPassword: "x", mailFrom: "agendamento@empresa.com" };
    expect(escolherCaminho(config)).toBe("brevo");
    expect(escolherCaminho({ ...config, brevoApiKey: "", resendApiKey: "re_123" })).toBe("resend");
  });

  it("sobra o SMTP quando é o único configurado", () => {
    const config = { ...vazio, smtpHost: "smtp.office365.com", smtpUser: "a@b.com", smtpPassword: "x", mailFrom: "portal@empresa.com" };
    expect(escolherCaminho(config)).toBe("smtp");
  });
});

describe("endereço do servidor de e-mail", () => {
  it("devolve o próprio valor quando já é um IP", async () => {
    // Quem configurou o host com o endereço direto não precisa de DNS.
    await expect(enderecoIPv4("127.0.0.1")).resolves.toBe("127.0.0.1");
    await expect(enderecoIPv4("::1")).resolves.toBe("::1");
  });

  it("devolve nulo quando o nome não resolve, para o envio cair no nome mesmo", async () => {
    await expect(enderecoIPv4("nao-existe.invalid")).resolves.toBeNull();
  });
});

describe("envio pelo Brevo", () => {
  const original = { ...process.env };

  async function mailerComBrevo() {
    vi.resetModules();
    process.env.BREVO_API_KEY = "xkeysib-chave-de-teste";
    process.env.MAIL_FROM = "agendamento@rvdsaude.com.br";
    return import("./mailer");
  }

  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("manda o que a API espera, com a chave no cabeçalho e o remetente confirmado", async () => {
    const { sendMail } = await mailerComBrevo();
    const fetchFalso = vi.fn().mockResolvedValue(new Response("{}", { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchFalso);

    await sendMail({ to: "fornecedor@exemplo.com", subject: "Assunto", html: "<p>oi</p>", text: "oi" });

    const [url, opcoes] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(opcoes.headers["api-key"]).toBe("xkeysib-chave-de-teste");
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.sender.email).toBe("agendamento@rvdsaude.com.br");
    expect(corpo.to).toEqual([{ email: "fornecedor@exemplo.com" }]);
    expect(corpo.htmlContent).toBe("<p>oi</p>");
    expect(corpo.textContent).toBe("oi");
  });

  it("repete o motivo que a API deu, que é o que diz o que arrumar", async () => {
    const { sendMail } = await mailerComBrevo();
    const recusa = new Response(JSON.stringify({ code: "invalid_parameter", message: "Sender not valid: agendamento@rvdsaude.com.br" }), {
      status: 400,
      statusText: "Bad Request",
      headers: { "content-type": "application/json" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(recusa));

    await expect(sendMail({ to: "a@b.com", subject: "x", html: "x", text: "x" })).rejects.toThrow(/Sender not valid/);
  });
});
