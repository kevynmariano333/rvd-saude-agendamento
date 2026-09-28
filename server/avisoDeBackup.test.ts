import { describe, expect, it } from "vitest";
import { conteudoDoAvisoDeBackup, deveAvisarDoBackup, IDADE_LIMITE_MS, INTERVALO_ENTRE_AVISOS_MS } from "./avisoDeBackup";

const AGORA = new Date("2026-09-28T12:00:00Z");
const atras = (ms: number) => new Date(AGORA.getTime() - ms);
const HORA = 60 * 60 * 1000;

describe("quando avisar que o backup parou", () => {
  it("cala enquanto o backup de ontem está no lugar", () => {
    expect(
      deveAvisarDoBackup({ agora: AGORA, ultimoSucessoEm: atras(20 * HORA), primeiraTentativaEm: atras(300 * HORA), ultimoAvisoEm: null }),
    ).toBe(false);
  });

  it("cala depois de uma noite ruim, que acontece", () => {
    expect(
      deveAvisarDoBackup({ agora: AGORA, ultimoSucessoEm: atras(30 * HORA), primeiraTentativaEm: atras(300 * HORA), ultimoAvisoEm: null }),
    ).toBe(false);
  });

  it("avisa depois de duas, que já não é acaso", () => {
    expect(
      deveAvisarDoBackup({ agora: AGORA, ultimoSucessoEm: atras(IDADE_LIMITE_MS + HORA), primeiraTentativaEm: atras(300 * HORA), ultimoAvisoEm: null }),
    ).toBe(true);
  });

  it("avisa quem nunca conseguiu um backup, contando da primeira tentativa", () => {
    expect(
      deveAvisarDoBackup({ agora: AGORA, ultimoSucessoEm: null, primeiraTentativaEm: atras(IDADE_LIMITE_MS + HORA), ultimoAvisoEm: null }),
    ).toBe(true);
  });

  it("não avisa sobre o nada: sistema recém-instalado, sem tentativa nenhuma", () => {
    expect(deveAvisarDoBackup({ agora: AGORA, ultimoSucessoEm: null, primeiraTentativaEm: null, ultimoAvisoEm: null })).toBe(false);
  });

  it("não repete o aviso no mesmo dia — aviso repetido é aviso ignorado", () => {
    const parado = { agora: AGORA, ultimoSucessoEm: atras(10 * 24 * HORA), primeiraTentativaEm: atras(300 * HORA) };
    expect(deveAvisarDoBackup({ ...parado, ultimoAvisoEm: atras(3 * HORA) })).toBe(false);
    expect(deveAvisarDoBackup({ ...parado, ultimoAvisoEm: atras(INTERVALO_ENTRE_AVISOS_MS + HORA) })).toBe(true);
  });
});

describe("o texto do aviso", () => {
  it("diz desde quando e o que o sistema viu", () => {
    const aviso = conteudoDoAvisoDeBackup({
      agora: AGORA,
      ultimoSucessoEm: new Date("2026-09-25T06:00:00Z"),
      ultimoErro: "Access Denied",
      appUrl: "https://portal.exemplo",
    });
    expect(aviso.subject).toContain("backup");
    expect(aviso.text).toContain("25/09/2026");
    expect(aviso.text).toContain("faz 3 dias");
    expect(aviso.text).toContain("Access Denied");
    expect(aviso.text).toContain("https://portal.exemplo/operador/acessos");
  });

  it("escreve um dia no singular, que é onde essas frases sempre escorregam", () => {
    const aviso = conteudoDoAvisoDeBackup({ agora: AGORA, ultimoSucessoEm: atras(30 * HORA), ultimoErro: null, appUrl: null });
    expect(aviso.text).toContain("faz 1 dia.");
  });

  it("não inventa data quando nunca houve backup bom", () => {
    const aviso = conteudoDoAvisoDeBackup({ agora: AGORA, ultimoSucessoEm: null, ultimoErro: null, appUrl: null });
    expect(aviso.text).toContain("Nenhum backup chegou a dar certo");
    expect(aviso.text).not.toContain("http");
  });

  it("escapa o erro do provedor, que entra no HTML sem ninguém ter escrito", () => {
    const aviso = conteudoDoAvisoDeBackup({
      agora: AGORA,
      ultimoSucessoEm: null,
      ultimoErro: "<script>alert(1)</script>",
      appUrl: null,
    });
    expect(aviso.html).not.toContain("<script>");
    expect(aviso.html).toContain("&lt;script&gt;");
  });
});
