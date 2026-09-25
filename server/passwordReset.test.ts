import { describe, expect, it } from "vitest";
import { MARCA } from "../shared/marca";
import {
  buildResetUrl,
  enderecoDoPortal,
  createResetToken,
  hashResetToken,
  isResetTokenUsable,
  resetEmailContent,
  resetTokenExpiry,
  RESET_TOKEN_TTL_MS,
} from "./passwordReset";

describe("password reset tokens", () => {
  it("stores only a digest, never the token that goes in the e-mail", () => {
    const { token, tokenHash } = createResetToken();
    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetToken(token)).toBe(tokenHash);
  });

  it("issues a distinct token each time", () => {
    const a = createResetToken();
    const b = createResetToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("accepts a fresh, unused token", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    expect(isResetTokenUsable({ expiresAt: resetTokenExpiry(now), usedAt: null }, now)).toBe(true);
  });

  it("rejects a token past its expiry", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const expiresAt = resetTokenExpiry(now);
    const later = new Date(now.getTime() + RESET_TOKEN_TTL_MS + 1000);
    expect(isResetTokenUsable({ expiresAt, usedAt: null }, later)).toBe(false);
  });

  it("rejects a token that was already spent", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const stored = { expiresAt: resetTokenExpiry(now), usedAt: new Date("2026-08-24T12:10:00Z") };
    expect(isResetTokenUsable(stored, now)).toBe(false);
  });

  it("rejects an unknown token", () => {
    expect(isResetTokenUsable(null)).toBe(false);
    expect(isResetTokenUsable(undefined)).toBe(false);
  });

  it("builds a reset link without doubling the slash", () => {
    expect(buildResetUrl("https://app.exemplo.com/", "abc")).toBe(
      "https://app.exemplo.com/redefinir-senha?token=abc"
    );
    expect(buildResetUrl("https://app.exemplo.com", "abc")).toBe(
      "https://app.exemplo.com/redefinir-senha?token=abc"
    );
  });

  it("escapes tokens carrying URL-significant characters", () => {
    const url = buildResetUrl("https://app.exemplo.com", "a+b/c=d");
    expect(url).toBe("https://app.exemplo.com/redefinir-senha?token=a%2Bb%2Fc%3Dd");
    expect(new URL(url).searchParams.get("token")).toBe("a+b/c=d");
  });

  it("puts the link in both the html and the plain-text body", () => {
    const url = "https://app.exemplo.com/redefinir-senha?token=xyz";
    const content = resetEmailContent(url);
    // O assunto leva o nome do sistema, e é dele que o nome sai — não de um
    // texto copiado aqui, que ficaria para trás no dia em que ele mudar.
    expect(content.subject).toContain(MARCA.nome);
    expect(content.html).toContain(url);
    expect(content.text).toContain(url);
  });
});

describe("endereço do portal para os links de e-mail", () => {
  it("usa o APP_URL quando ele existe, sem barra sobrando", () => {
    expect(enderecoDoPortal({ appUrl: "https://portal.exemplo.com/", host: "outro.com" })).toBe("https://portal.exemplo.com");
  });

  it("cai no endereço da própria requisição quando ninguém configurou APP_URL", () => {
    // É o que impedia a recuperação de senha inteira: sem a variável, o
    // e-mail não era nem enviado.
    expect(enderecoDoPortal({ appUrl: "", proto: "https", host: "agendamento.rvdsaude.com.br" })).toBe("https://agendamento.rvdsaude.com.br");
  });

  it("assume HTTPS quando o proxy não diz o protocolo", () => {
    expect(enderecoDoPortal({ appUrl: "", host: "portal.exemplo.com" })).toBe("https://portal.exemplo.com");
  });

  it("fica com o primeiro da cadeia quando o proxy encadeia os cabeçalhos", () => {
    expect(enderecoDoPortal({ appUrl: "", proto: "https, http", host: "portal.exemplo.com, interno:8080" })).toBe("https://portal.exemplo.com");
  });

  it("recusa um host estranho em vez de montar um link para qualquer lugar", () => {
    expect(enderecoDoPortal({ appUrl: "", host: "site-do-atacante.com/@outro" })).toBeNull();
    expect(enderecoDoPortal({ appUrl: "", host: "" })).toBeNull();
    expect(enderecoDoPortal({ appUrl: "" })).toBeNull();
  });
});
