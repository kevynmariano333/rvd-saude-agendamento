import { describe, expect, it } from "vitest";
import { configuracaoDoAviso, montarPayloadDaPortaria } from "./notificacoesPush";

describe("configuracaoDoAviso", () => {
  it("fica desligada sem as duas chaves: o portal segue igual", () => {
    expect(configuracaoDoAviso({})).toBeNull();
    expect(configuracaoDoAviso({ VAPID_PUBLIC_KEY: "publica" })).toBeNull();
    expect(configuracaoDoAviso({ VAPID_PRIVATE_KEY: "privada" })).toBeNull();
  });

  it("liga com as chaves e usa o endereço do app quando não há assunto", () => {
    const config = configuracaoDoAviso({ VAPID_PUBLIC_KEY: " publica ", VAPID_PRIVATE_KEY: "privada", APP_URL: "https://exemplo.test" });
    expect(config).toEqual({ publicKey: "publica", privateKey: "privada", subject: "https://exemplo.test" });
  });
});

describe("montarPayloadDaPortaria", () => {
  it("diz a placa, o fornecedor e quantos caminhões esperam, e leva para a Operação", () => {
    const payload = montarPayloadDaPortaria({ placa: "ABC1D23", fornecedor: "Cremer", contagem: 3 });
    expect(payload.corpo).toContain("ABC1D23");
    expect(payload.corpo).toContain("Cremer");
    expect(payload.contagem).toBe(3);
    expect(payload.url).toBe("/operacao");
  });

  it("não leva nome nem documento do motorista para a notificação", () => {
    const payload = JSON.stringify(montarPayloadDaPortaria({ placa: "ABC1D23", fornecedor: "Cremer", contagem: 1 }));
    expect(payload).not.toMatch(/motorista|cpf|rg/i);
  });
});
