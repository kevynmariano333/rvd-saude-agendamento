import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chaveConfere, notaParaOBi, registrarLeituraDoBi } from "./leituraDoBi";

const HSH = "06033403000113";
const MSH = "43293604002120";

describe("notaParaOBi", () => {
  const base = { invoiceNumber: " 12345 ", status: "completed", updatedAt: new Date("2026-10-15T13:00:00Z"), scheduledFor: new Date("2026-10-14T12:00:00Z"), receivedAt: new Date("2026-10-14T15:30:00Z"), recipientCnpj: HSH };

  it("leva só o que a conta do D+1 usa", () => {
    expect(notaParaOBi(base)).toEqual({
      nota: "12345",
      status: "completed",
      recebidoEm: "2026-10-14T15:30:00.000Z",
      ultimoStatusEm: "2026-10-15T13:00:00.000Z",
      agendadoPara: "2026-10-14T12:00:00.000Z",
      unidade: "HSH",
    });
    expect(notaParaOBi({ ...base, recipientCnpj: MSH })?.unidade).toBe("MSH");
    // Nota do acervo antigo, sem a data do Recebido: vai com null, e o BI decide.
    expect(notaParaOBi({ ...base, receivedAt: null })?.recebidoEm).toBeNull();
  });

  it("deixa de fora status que não é recebimento, outra unidade e nota sem número", () => {
    expect(notaParaOBi({ ...base, status: "scheduled" })).toBeNull();
    expect(notaParaOBi({ ...base, status: "rejected" })).toBeNull();
    expect(notaParaOBi({ ...base, recipientCnpj: "11111111000111" })).toBeNull();
    expect(notaParaOBi({ ...base, invoiceNumber: "  " })).toBeNull();
  });
});

describe("chaveConfere", () => {
  it("aceita a chave com ou sem Bearer e recusa o resto", () => {
    expect(chaveConfere("Bearer segredo-longo", "segredo-longo")).toBe(true);
    expect(chaveConfere("segredo-longo", "segredo-longo")).toBe(true);
    expect(chaveConfere("Bearer outra", "segredo-longo")).toBe(false);
    expect(chaveConfere(undefined, "segredo-longo")).toBe(false);
    expect(chaveConfere("Bearer ", "segredo-longo")).toBe(false);
  });
  it("sem chave configurada, ninguém entra", () => {
    expect(chaveConfere("", "")).toBe(false);
    expect(chaveConfere("Bearer qualquer", "")).toBe(false);
  });
});

describe("rota /api/bi/notas-recebimento", () => {
  let url = "";
  let chave = "";
  const servidor = (() => {
    const app = express();
    registrarLeituraDoBi(app, () => chave);
    return createServer(app);
  })();
  beforeAll(async () => {
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/bi/notas-recebimento`;
  });
  afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

  it("fica fechada sem BI_LEITURA_TOKEN", async () => {
    chave = "";
    const r = await fetch(`${url}?desde=2026-10-01`, { headers: { Authorization: "Bearer x" } });
    expect(r.status).toBe(503);
  });
  it("recusa chave errada e data torta antes de tocar no banco", async () => {
    chave = "segredo-longo";
    expect((await fetch(`${url}?desde=2026-10-01`, { headers: { Authorization: "Bearer errada" } })).status).toBe(401);
    expect((await fetch(`${url}?desde=ontem`, { headers: { Authorization: "Bearer segredo-longo" } })).status).toBe(400);
  });
});
