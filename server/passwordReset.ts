// Password reset tokens.
//
// The link e-mailed to the user carries a random token; only its SHA-256 digest
// is stored, so a leaked database dump cannot be used to reset anyone's password.
// A token is single-use and expires an hour after it is issued.

import { createHash, randomBytes } from "crypto";
import { MARCA } from "../shared/marca";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS);
}

export type StoredResetToken = {
  expiresAt: Date;
  usedAt: Date | null;
};

/**
 * A token is only good while it is unused and unexpired. Both rejections are
 * reported the same way to the user, so a spent link cannot be distinguished
 * from one that never existed.
 */
export function isResetTokenUsable(
  stored: StoredResetToken | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!stored) return false;
  if (stored.usedAt) return false;
  return stored.expiresAt.getTime() > now.getTime();
}

export function buildResetUrl(baseUrl: string, token: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  return `${root}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

export function resetEmailContent(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: `Redefinição de senha · ${MARCA.nome}`,
    text: [
      `Recebemos um pedido para redefinir a senha da sua conta no ${MARCA.nome}.`,
      "",
      `Abra este endereço para definir uma nova senha: ${resetUrl}`,
      "",
      "O link vale por 1 hora e só pode ser usado uma vez.",
      "Se não foi você que pediu, ignore esta mensagem — sua senha atual continua valendo.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#f6f4f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#782078;padding:24px 28px">
          <p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold">${MARCA.nome}</p>
          <p style="margin:6px 0 0;color:#c9e1ee;font-size:12px;letter-spacing:1.6px;text-transform:uppercase">${MARCA.descricao}</p>
        </td></tr>
        <tr><td style="padding:30px 28px">
          <h1 style="margin:0;color:#782078;font-size:22px">Redefinição de senha</h1>
          <p style="margin:16px 0 0;color:#3f3244;font-size:15px;line-height:1.6">
            Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para escolher uma nova senha.
          </p>
          <p style="margin:26px 0">
            <a href="${resetUrl}" style="display:inline-block;background:#782078;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:12px">Definir nova senha</a>
          </p>
          <p style="margin:0;color:#6c5c70;font-size:13px;line-height:1.6">
            O link vale por 1 hora e só pode ser usado uma vez.<br>
            Se não foi você que pediu, ignore esta mensagem — sua senha atual continua valendo.
          </p>
          <p style="margin:22px 0 0;color:#9b8c9f;font-size:12px;word-break:break-all">
            Se o botão não funcionar, copie este endereço no navegador:<br>${resetUrl}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}
