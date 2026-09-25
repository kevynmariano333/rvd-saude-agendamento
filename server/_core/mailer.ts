// Transactional e-mail. Dois caminhos, porque nem toda empresa consegue os dois:
//
// - SMTP, para mandar pela própria caixa da empresa (Outlook/Microsoft 365,
//   Google Workspace). Não depende de mexer no DNS do domínio, que foi
//   justamente o que travou aqui — quem tem a conta de e-mail já tem tudo.
// - Resend, pela API HTTP, quando o domínio estiver verificado lá.
//
// SMTP tem prioridade: se alguém configurou os dois, o que manda é a caixa da
// empresa, que é a que o fornecedor reconhece no remetente.

import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
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

/**
 * Para onde o sistema tenta mandar, em uma linha.
 *
 * Entra no aviso de falha porque "não respondeu" sem dizer a quem não ajuda
 * ninguém: é por esta linha que se descobre que a porta está errada, ou que o
 * servidor no ar ainda é o antigo. Nunca inclui a senha.
 */
export function descricaoDoDestino(): string {
  if (caminhoDoEnvio() === "smtp") return `${ENV.smtpHost}:${Number(ENV.smtpPort) || 587}`;
  return "api.resend.com";
}

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let transporte: { criadoEm: number; transporter: Transporter } | null = null;

/** Por quanto tempo o endereço resolvido vale antes de ser perguntado de novo. */
const VALIDADE_DO_ENDERECO_MS = 10 * 60_000;

/**
 * O endereço IPv4 do servidor de e-mail.
 *
 * O provedor publica endereços IPv4 e IPv6 para o mesmo nome, e a biblioteca
 * sorteia um deles. Onde a hospedagem não tem rota para IPv6 — a Railway não
 * tem —, o sorteio decide se o e-mail sai ou morre em "ENETUNREACH". Resolver
 * aqui, só em IPv4, tira o azar da conta.
 *
 * Devolve `null` quando não dá para resolver; aí vale o nome, que é o
 * comportamento de antes.
 */
export async function enderecoIPv4(host: string): Promise<string | null> {
  if (isIP(host)) return host;
  try {
    const [primeiro] = await resolve4(host);
    return primeiro ?? null;
  } catch {
    return null;
  }
}

/**
 * A conexão SMTP, reaproveitada.
 *
 * Abrir e autenticar uma conexão por e-mail enviado é lento e, nos provedores
 * que contam conexões por minuto, é o que faz o servidor começar a recusar.
 *
 * O endereço resolvido não vale para sempre: os servidores da Microsoft e do
 * Google trocam de IP, e um processo que fica semanas no ar guardaria um
 * endereço morto. Passados dez minutos, pergunta de novo.
 */
async function transporteSmtp(): Promise<Transporter> {
  const agora = Date.now();
  if (transporte && agora - transporte.criadoEm < VALIDADE_DO_ENDERECO_MS) return transporte.transporter;
  transporte?.transporter.close();
  const porta = Number(ENV.smtpPort) || 587;
  const endereco = await enderecoIPv4(ENV.smtpHost);
  const transporter = nodemailer.createTransport({
    host: endereco ?? ENV.smtpHost,
    port: porta,
    // O certificado é do nome do servidor, não do IP: sem isto, conectar pelo
    // endereço faria a verificação do TLS falhar.
    tls: { servername: ENV.smtpHost },
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
  transporte = { criadoEm: agora, transporter };
  return transporter;
}

/** Quanto tempo o sistema inteiro espera por um envio, aconteça o que acontecer. */
export const LIMITE_DO_ENVIO_MS = 25_000;

/**
 * Desiste depois do tempo, mesmo que a promessa não saiba desistir.
 *
 * Os tempos do SMTP cobrem conexão, saudação e socket — não cobrem uma
 * resolução de DNS pendurada, nem a fila do pool. Sem um limite por fora, um
 * desses casos deixa a tela em "Enviando..." até o proxy da hospedagem cortar,
 * e a pessoa fica sem resposta nenhuma. Aqui a resposta é garantida: ou o
 * provedor respondeu, ou o sistema diz que esperou demais.
 */
async function comLimiteDeTempo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let despertador: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, rejeitar) => {
        despertador = setTimeout(
          () => rejeitar(new Error(`O servidor de e-mail não respondeu em ${Math.round(ms / 1000)} segundos. A porta pode estar bloqueada pela hospedagem.`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (despertador) clearTimeout(despertador);
  }
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
    // A resolução do endereço entra no mesmo limite de tempo: um DNS pendurado
    // deixaria a tela esperando exatamente como a conexão deixava.
    await comLimiteDeTempo(
      (async () => {
        const transporter = await transporteSmtp();
        await transporter.sendMail({
          from: remetente(),
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
      })(),
      LIMITE_DO_ENVIO_MS,
    );
    return;
  }

  const response = await comLimiteDeTempo(
    fetch(RESEND_ENDPOINT, {
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
      signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS),
    }),
    LIMITE_DO_ENVIO_MS,
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend recusou o envio (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }
}
