// Transactional e-mail. Três caminhos, porque nenhum serve a toda empresa:
//
// - Brevo, por HTTPS. O remetente é confirmado por um link que chega na própria
//   caixa — sem DNS e sem administrador de domínio, que foi o que travou aqui.
// - Resend, por HTTPS, quando o domínio estiver verificado lá.
// - SMTP, pela caixa da empresa (Microsoft 365, Google Workspace).
//
// A ordem é essa de propósito. SMTP parece o mais direto, mas muitas
// hospedagens bloqueiam a porta de saída — a Railway bloqueia, e foi assim que
// se descobriu: a conexão morria em "Connection timeout" sem nunca chegar na
// Microsoft. O que sai por HTTPS passa onde o SMTP não passa, então ele vem
// primeiro; o SMTP fica para quem hospeda em outro lugar.

import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import nodemailer, { type Transporter } from "nodemailer";
import { MARCA } from "../../shared/marca";
import { ENV } from "./env";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type CaminhoDoEnvio = "brevo" | "resend" | "smtp" | null;

/**
 * O que está configurado de verdade — não o que se pretendia configurar.
 *
 * Os dois caminhos por HTTPS vêm antes do SMTP: onde a hospedagem bloqueia a
 * porta de e-mail, o SMTP configurado é uma promessa que não se cumpre, e
 * quem deixou as duas coisas ligadas quer que o aviso saia.
 */
export function escolherCaminho(config: {
  brevoApiKey: string;
  smtpHost: string;
  smtpUser: string;
  smtpPassword: string;
  resendApiKey: string;
  mailFrom: string;
}): CaminhoDoEnvio {
  // Sem remetente confirmado, as duas APIs recusam o envio — chave sozinha não
  // manda nada.
  if (config.brevoApiKey && config.mailFrom) return "brevo";
  if (config.resendApiKey && config.mailFrom) return "resend";
  // A senha entra na conta: host e usuário sem ela é configuração pela metade,
  // e uma conexão que vai falhar na autenticação não é "configurado".
  if (config.smtpHost && config.smtpUser && config.smtpPassword) return "smtp";
  return null;
}

export function caminhoDoEnvio(): CaminhoDoEnvio {
  return escolherCaminho({
    brevoApiKey: ENV.brevoApiKey,
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
  const caminho = caminhoDoEnvio();
  if (caminho === "smtp") return `${ENV.smtpHost}:${Number(ENV.smtpPort) || 587}`;
  if (caminho === "brevo") return "api.brevo.com";
  if (caminho === "resend") return "api.resend.com";
  return "nenhum servidor configurado";
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

  if (caminho === "brevo") {
    const resposta = await comLimiteDeTempo(
      fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": ENV.brevoApiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: MARCA.nome, email: remetente() },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
          textContent: input.text,
        }),
        signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS),
      }),
      LIMITE_DO_ENVIO_MS,
    );
    if (!resposta.ok) throw new Error(await recusa("Brevo", resposta));
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

  if (!response.ok) throw new Error(await recusa("Resend", response));
}

/**
 * A recusa da API, com o motivo que ela mesma deu.
 *
 * As duas respondem o erro em JSON — "remetente não verificado", "chave
 * inválida" —, e é essa frase que diz o que arrumar. Sem ela sobra o número do
 * status, que não ajuda ninguém a resolver nada.
 */
async function recusa(provedor: string, resposta: Response): Promise<string> {
  const corpo = await resposta.text().catch(() => "");
  let detalhe = corpo;
  try {
    const json = JSON.parse(corpo);
    detalhe = json?.message || json?.error?.message || corpo;
  } catch {
    // Não era JSON; fica o texto puro mesmo.
  }
  return `${provedor} recusou o envio (${resposta.status} ${resposta.statusText})${detalhe ? `: ${detalhe}` : ""}`;
}
