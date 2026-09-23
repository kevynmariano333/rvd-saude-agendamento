import { describe, expect, it } from "vitest";
import { deveFazerBackup, horaEmSaoPaulo, INTERVALO_MINIMO_MS } from "./agendadorDeBackup";

/** 03:00 em São Paulo (UTC-3) é 06:00 em UTC. */
const tresDaManha = (dia: number) => new Date(Date.UTC(2026, 8, dia, 6, 0, 0));
const horas = (n: number) => n * 60 * 60 * 1000;

describe("a hora de São Paulo, e não a do servidor", () => {
  it("lê 03:00 de Brasília a partir das 06:00 UTC", () => {
    // O servidor roda em UTC. Usar a hora dele faria o backup rodar às
    // 03:00 UTC, que é meia-noite aqui — dentro do expediente de quem varia
    // o turno.
    expect(horaEmSaoPaulo(tresDaManha(24))).toBe(3);
  });

  it("não se confunde à meia-noite", () => {
    expect(horaEmSaoPaulo(new Date(Date.UTC(2026, 8, 24, 3, 0, 0)))).toBe(0);
  });
});

describe("quando fazer o backup", () => {
  it("faz o primeiro assim que passa das três", () => {
    expect(deveFazerBackup({ agora: tresDaManha(24), ultimoEm: null })).toBe(true);
  });

  it("não faz antes das três", () => {
    const umaDaManha = new Date(Date.UTC(2026, 8, 24, 4, 0, 0));
    expect(deveFazerBackup({ agora: umaDaManha, ultimoEm: null })).toBe(false);
  });

  it("não repete depois de um deploy no mesmo dia", () => {
    // Era o risco real: cada subida do servidor dispara uma conferência, e sem
    // o intervalo mínimo um dia de ajustes geraria dez backups iguais.
    const cincoDaManha = new Date(tresDaManha(24).getTime() + horas(2));
    expect(deveFazerBackup({ agora: cincoDaManha, ultimoEm: tresDaManha(24) })).toBe(false);
  });

  it("volta a fazer no dia seguinte", () => {
    expect(deveFazerBackup({ agora: tresDaManha(25), ultimoEm: tresDaManha(24) })).toBe(true);
  });

  it("recupera o dia perdido assim que o servidor volta", () => {
    // Servidor fora do ar a madrugada inteira: o backup sai às duas da tarde,
    // porque atrasado é melhor que pulado.
    const duasDaTarde = new Date(Date.UTC(2026, 8, 25, 17, 0, 0));
    expect(deveFazerBackup({ agora: duasDaTarde, ultimoEm: tresDaManha(24) })).toBe(true);
  });

  it("não dispara duas vezes na mesma noite por causa da folga do intervalo", () => {
    const quaseUmDia = new Date(tresDaManha(24).getTime() + INTERVALO_MINIMO_MS - 1000);
    expect(deveFazerBackup({ agora: quaseUmDia, ultimoEm: tresDaManha(24) })).toBe(false);
  });
});
