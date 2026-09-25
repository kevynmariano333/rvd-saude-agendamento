// Transactional e-mail. Dois caminhos, porque nem toda empresa consegue os dois:
//
// - SMTP, para mandar pela própria caixa da empresa (Outlook/Microsoft 365,
//   Google Workspace). Não depende de mexer no DNS do domínio, que foi
//   justamente o que travou aqui — quem tem a conta de e-mail já tem tudo.
// - Resend, pela API HTTP, quando o domínio estiver verificado lá.
//
// SMTP tem prioridade: se alguém configurou os dois, o que manda é a caixa da
// empresa, que é a que o fornecedor reconhece no remetente.

import nodemailer, { type Transporter } from "nodemailer";
import { ENV } from "./env";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type CaminhoDoEnvio = "smtp" | "resend" | null;

/** O que está configurado de verdade — não o que se pretendia configurar. */
export function escolherCaminho(config: {
  smtpHost: string;
  smtpUser: string;
  smtpPassword: string;
  resendApiKey: string;
  mailFrom: string;
}): CaminhoDoEnvio {
  // A senha entra na conta: host e usuário sem ela é configuração pela metade,
  // e uma conexão que vai falhar na autenticação não é "configurado".
  if (config.smtpHost && config.smtpUser && config.smtpPassword) return "smtp";
  if (config.resendApiKey && config.mailFrom) return "resend";
  return null;
}

export function caminhoDoEnvio(): CaminhoDoEnvio {
  return escolherCaminho({
    smtpHost: ENV.smtpHost,
    smtpUser: ENV.smtpUser,
    smtpPassword: ENV.smtpPassword,
    resendApiKey: ENV.resendApiKey,
    mailFrom: ENV.mailFrom,
  });
}

export function isMailerConfigured(): boolean {
  return caminhoDoEnvio() !== null;
}

/**
 * Quem assina a mensagem.
 *
 * No SMTP da Microsoft e do Google, o remetente tem que ser a própria caixa
 * autenticada — mandar em nome de outro endereço é recusado no servidor. Por
 * isso, sem MAIL_FROM, o remetente é o usuário do SMTP: é o único endereço que
 * com certeza vai passar.
 */
export function remetente(): string {
  if (caminhoDoEnvio() === "smtp") return ENV.mailFrom || ENV.smtpUser;
  return ENV.mailFrom;
}

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let transporte: Transporter | null = null;

/**
 * A conexão SMTP, reaproveitada.
 *
 * Abrir e autenticar uma conexão por e-mail enviado é lento e, nos provedores
 * que contam conexões por minuto, é o que faz o servidor começar a recusar.
 */
function transporteSmtp(): Transporter {
  if (transporte) return transporte;
  const porta = Number(ENV.smtpPort) || 587;
  transporte = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: porta,
    // 465 é TLS desde o "alô"; 587 abre em claro e sobe para TLS no STARTTLS,
    // que é o que a Microsoft e o Google usam.
    secure: porta === 465,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPassword },
    pool: true,
    maxConnections: 2,
    // Sem estes tempos, uma porta bloqueada pela hospedagem não dá erro: a
    // conexão fica pendurada até o TCP desistir, dois minutos depois, e quem
    // clicou recebe do proxy um "upstream error" em vez do motivo. Falhar em
    // segundos, com a razão escrita, é melhor do que esperar em silêncio.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporte;
}

/**
 * Sends one message. Throws on a rejected request so callers can decide whether
 * the failure is worth surfacing — the password reset flow deliberately does
 * not, to avoid turning a delivery problem into an account-existence oracle.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const caminho = caminhoDoEnvio();
  if (!caminho) {
    throw new Error(
      "Envio de e-mail não configurado: defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD, ou RESEND_API_KEY e MAIL_FROM.",
    );
  }

  if (caminho === "smtp") {
    await transporteSmtp().sendMail({
      from: remetente(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ENV.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: remetente(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend recusou o envio (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }
}
