// Transactional e-mail through Resend's HTTP API. Called over fetch rather than
// the SDK so the deployment carries no extra dependency for a single endpoint.

import { ENV } from "./env";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isMailerConfigured(): boolean {
  return Boolean(ENV.resendApiKey && ENV.mailFrom);
}

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends one message. Throws on a rejected request so callers can decide whether
 * the failure is worth surfacing — the password reset flow deliberately does
 * not, to avoid turning a delivery problem into an account-existence oracle.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  if (!isMailerConfigured()) {
    throw new Error(
      "Envio de e-mail não configurado: defina RESEND_API_KEY e MAIL_FROM.",
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ENV.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: ENV.mailFrom,
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
