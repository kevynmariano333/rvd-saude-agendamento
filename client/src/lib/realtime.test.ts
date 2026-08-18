import { describe, expect, it } from "vitest";
import { REALTIME_REFRESH_INTERVAL_MS, realtimeQueryDefaults } from "./realtime";

describe("atualização automática do portal", () => {
  it("mantém a sincronização ativa em segundo plano a cada cinco segundos", () => {
    expect(realtimeQueryDefaults).toMatchObject({
      refetchInterval: REALTIME_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    });
  });
});
