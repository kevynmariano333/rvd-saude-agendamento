import { describe, expect, it } from "vitest";
import { REALTIME_REFRESH_INTERVAL_MS, REALTIME_STALE_TIME_MS, realtimeQueryDefaults } from "./realtime";

describe("atualização automática do portal", () => {
  it("pergunta de novo de minuto em minuto, e não de cinco em cinco segundos", () => {
    expect(realtimeQueryDefaults).toMatchObject({
      refetchInterval: REALTIME_REFRESH_INTERVAL_MS,
      staleTime: REALTIME_STALE_TIME_MS,
      refetchOnWindowFocus: true,
    });
    expect(REALTIME_REFRESH_INTERVAL_MS).toBe(60_000);
  });

  it("não pergunta nada com a aba fora da vista", () => {
    // Era isto que rodava de madrugada e no fim de semana: aba esquecida aberta
    // repetindo a lista de notas 17.280 vezes por dia, cada uma batendo no
    // banco e saindo pela rede.
    expect(realtimeQueryDefaults.refetchIntervalInBackground).toBe(false);
  });

  it("quem volta para a aba não encontra tela velha", () => {
    // É o que paga a conta de pedir menos: em vez de perguntar sem parar, o
    // portal pergunta quando alguém volta a olhar.
    expect(realtimeQueryDefaults.refetchOnWindowFocus).toBe(true);
  });
});
