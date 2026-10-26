import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diasDoPeriodo, registrarApiDeRecebimento, resumoDeRecebimento, type LinhaDeRecebimento } from "./recebimentoApi";

const HSH = "06033403000113";
const MSH = "43293604002120";
const RVD = "39283469000110";
const PERIODO = { desde: "2026-10-20", ate: "2026-10-23" };

const linha = (extra: Partial<LinhaDeRecebimento>): LinhaDeRecebimento => ({
  status: "received",
  receivedAt: null,
  scheduledFor: null,
  recipientCnpj: HSH,
  ...extra,
});

describe("resumoDeRecebimento", () => {
  it("conta as notas recebidas por dia de Brasília e zera os dias sem nota", () => {
    const linhas = [
      linha({ receivedAt: new Date("2026-10-21T13:00:00Z") }),
      linha({ receivedAt: new Date("2026-10-21T15:00:00Z"), recipientCnpj: MSH, status: "completed" }),
      linha({ receivedAt: new Date("2026-10-23T12:00:00Z"), status: "backlog" }),
    ];
    const resumo = resumoDeRecebimento(linhas, PERIODO);
    expect(resumo.recebidas.total).toBe(3);
    expect(resumo.recebidas.porDia).toEqual([
      { data: "2026-10-20", quantidade: 0 },
      { data: "2026-10-21", quantidade: 2 },
      { data: "2026-10-22", quantidade: 0 },
      { data: "2026-10-23", quantidade: 1 },
    ]);
    expect(resumo.recebidas.porMes).toEqual([{ mes: "2026-10", quantidade: 3 }]);
  });

  it("usa o dia de Brasília, não o UTC: 02:30 de 23/10 em UTC é 22/10 em São Paulo", () => {
    const resumo = resumoDeRecebimento([linha({ receivedAt: new Date("2026-10-23T02:30:00Z") })], PERIODO);
    expect(resumo.recebidas.porDia.find(item => item.data === "2026-10-22")?.quantidade).toBe(1);
    expect(resumo.recebidas.porDia.find(item => item.data === "2026-10-23")?.quantidade).toBe(0);
  });

  it("deixa de fora RVD, LLT, pendente e recusada", () => {
    const linhas = [
      linha({ receivedAt: new Date("2026-10-21T13:00:00Z"), recipientCnpj: RVD }),
      linha({ receivedAt: new Date("2026-10-21T13:00:00Z"), status: "rejected" }),
      linha({ scheduledFor: new Date("2026-10-21T13:00:00Z"), status: "pending" }),
    ];
    const resumo = resumoDeRecebimento(linhas, PERIODO);
    expect(resumo.recebidas.total).toBe(0);
    expect(resumo.agendadas.total).toBe(0);
  });

  it("conta as agendadas pela data de agendamento, incluindo as já recebidas", () => {
    const linhas = [
      linha({ status: "scheduled", scheduledFor: new Date("2026-10-22T12:00:00Z") }),
      linha({ status: "received", scheduledFor: new Date("2026-10-21T12:00:00Z"), receivedAt: new Date("2026-10-21T15:00:00Z") }),
      linha({ status: "scheduled", scheduledFor: new Date("2026-11-02T12:00:00Z") }),
    ];
    const resumo = resumoDeRecebimento(linhas, PERIODO);
    expect(resumo.agendadas.total).toBe(2);
    expect(resumo.recebidas.total).toBe(1);
  });

  it("agrupa por mês quando o período cruza a virada", () => {
    const resumo = resumoDeRecebimento(
      [linha({ receivedAt: new Date("2026-10-31T15:00:00Z") }), linha({ receivedAt: new Date("2026-11-01T15:00:00Z") })],
      { desde: "2026-10-30", ate: "2026-11-01" },
    );
    expect(resumo.recebidas.porMes).toEqual([
      { mes: "2026-10", quantidade: 1 },
      { mes: "2026-11", quantidade: 1 },
    ]);
  });
});

describe("diasDoPeriodo", () => {
  it("conta os dois extremos", () => {
    expect(diasDoPeriodo({ desde: "2026-10-20", ate: "2026-10-23" })).toBe(4);
    expect(diasDoPeriodo({ desde: "2026-10-23", ate: "2026-10-23" })).toBe(1);
  });
});

describe("GET /api/recebimento/resumo", () => {
  let servidor: ReturnType<typeof createServer>;
  let base = "";

  const chaveFalsa = "chave-de-teste";
  beforeAll(async () => {
    const app = express();
    registrarApiDeRecebimento(app, () => chaveFalsa);
    servidor = createServer(app);
    await new Promise<void>(resolve => servidor.listen(0, "127.0.0.1", () => resolve()));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    servidor.close();
  });

  it("fecha sem chave e com chave errada", async () => {
    const semChave = await fetch(`${base}/api/recebimento/resumo?desde=2026-10-20&ate=2026-10-23`);
    expect(semChave.status).toBe(401);
    const errada = await fetch(`${base}/api/recebimento/resumo?desde=2026-10-20&ate=2026-10-23`, { headers: { authorization: "Bearer outra" } });
    expect(errada.status).toBe(401);
  });

  it("registra cada chamada no log, sem nunca escrever a chave", async () => {
    const linhas: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      linhas.push(args.map(String).join(" "));
    };
    try {
      await fetch(`${base}/api/recebimento/resumo?desde=2026-10-20&ate=2026-10-23`, { headers: { authorization: "Bearer chave-errada-de-teste" } });
      await fetch(`${base}/api/recebimento/resumo?desde=2026-10-20&ate=2026-10-23`, { headers: { authorization: `Bearer ${chaveFalsa}` } });
    } finally {
      console.log = original;
    }
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    expect(linhas.every(linha => linha.startsWith("[API recebimento] "))).toBe(true);
    expect(linhas.join("\n")).toContain('"status":401');
    expect(linhas.join("\n")).not.toContain(chaveFalsa);
    expect(linhas.join("\n")).not.toContain("chave-errada-de-teste");
  });

  it("recusa datas mal formadas e períodos longos demais", async () => {
    const cabecalho = { authorization: `Bearer ${chaveFalsa}` };
    const ruim = await fetch(`${base}/api/recebimento/resumo?desde=20-10-2026&ate=2026-10-23`, { headers: cabecalho });
    expect(ruim.status).toBe(400);
    const longo = await fetch(`${base}/api/recebimento/resumo?desde=2025-01-01&ate=2026-10-23`, { headers: cabecalho });
    expect(longo.status).toBe(400);
  });

  it("fica desligada sem chave configurada", async () => {
    const app = express();
    registrarApiDeRecebimento(app, () => "");
    const desligado = createServer(app);
    await new Promise<void>(resolve => desligado.listen(0, "127.0.0.1", () => resolve()));
    const endereco = (desligado.address() as AddressInfo).port;
    const resposta = await fetch(`http://127.0.0.1:${endereco}/api/recebimento/resumo?desde=2026-10-20&ate=2026-10-23`, { headers: { authorization: "Bearer qualquer" } });
    expect(resposta.status).toBe(503);
    desligado.close();
  });
});
