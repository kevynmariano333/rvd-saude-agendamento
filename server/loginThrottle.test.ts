import { beforeEach, describe, expect, it } from "vitest";
import { JANELA_MS, LIMITE_DE_FALHAS, limparFalhas, registrarFalha, segundosDeEspera, zerarFreio } from "./loginThrottle";

const CHAVE = ["ip:10.0.0.1"];

describe("freio de tentativas de login", () => {
  beforeEach(() => zerarFreio());

  it("deixa passar enquanto as falhas estão abaixo do limite", () => {
    const agora = 1_000_000;
    for (let i = 0; i < LIMITE_DE_FALHAS - 1; i += 1) registrarFalha(CHAVE, agora + i);
    expect(segundosDeEspera(CHAVE, agora + LIMITE_DE_FALHAS)).toBe(0);
  });

  it("fecha a porta ao atingir o limite", () => {
    const agora = 1_000_000;
    for (let i = 0; i < LIMITE_DE_FALHAS; i += 1) registrarFalha(CHAVE, agora + i);
    expect(segundosDeEspera(CHAVE, agora + LIMITE_DE_FALHAS)).toBeGreaterThan(0);
  });

  it("a janela desliza: esperar limpa a conta sozinho", () => {
    const agora = 1_000_000;
    for (let i = 0; i < LIMITE_DE_FALHAS; i += 1) registrarFalha(CHAVE, agora + i);
    expect(segundosDeEspera(CHAVE, agora + JANELA_MS + 1)).toBe(0);
  });

  it("acertar a senha limpa o histórico de quem errou antes", () => {
    const agora = 1_000_000;
    for (let i = 0; i < LIMITE_DE_FALHAS; i += 1) registrarFalha(CHAVE, agora + i);
    limparFalhas(CHAVE);
    expect(segundosDeEspera(CHAVE, agora + LIMITE_DE_FALHAS)).toBe(0);
  });

  it("conta cada chave por si: o IP do vizinho não paga pelo meu erro", () => {
    const agora = 1_000_000;
    for (let i = 0; i < LIMITE_DE_FALHAS; i += 1) registrarFalha(["ip:10.0.0.1"], agora + i);
    expect(segundosDeEspera(["ip:10.0.0.2"], agora + LIMITE_DE_FALHAS)).toBe(0);
  });

  it("basta uma das chaves estar no limite para a porta fechar", () => {
    // O ataque que distribui tentativas por muitos IPs contra o mesmo login
    // não acumula em IP nenhum, mas acumula no login.
    const agora = 1_000_000;
    for (let i = 0; i < LIMITE_DE_FALHAS; i += 1) registrarFalha([`ip:10.0.0.${i}`, "login:alvo@empresa.com"], agora + i);
    expect(segundosDeEspera(["ip:10.0.0.99", "login:alvo@empresa.com"], agora + LIMITE_DE_FALHAS)).toBeGreaterThan(0);
  });
});
