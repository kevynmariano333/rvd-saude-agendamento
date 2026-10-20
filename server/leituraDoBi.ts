import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, gte, inArray, isNotNull } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { unidadePorCnpj } from "../shared/recipients";
import { getDb } from "./db";

/**
 * A leitura que o robô do BI Operacional faz das notas recebidas.
 *
 * O BI calcula o Recebimento D+1 cruzando cada nota daqui com a conclusão da
 * entrada no SIAL. Antes isso vinha de uma planilha montada à mão; agora o
 * robô pergunta direto, de hora em hora.
 *
 * Só leitura, e só o que a conta precisa: número da nota, status, quando ela
 * foi marcada como Recebida, a data do último status, a data de agendamento e
 * a unidade (HSH ou MSH). O D+1 conta a partir do Recebido — não do
 * Concluído, que vem depois e afrouxaria o prazo. Nada de
 * fornecedor, valor, item ou anexo. Só entram as notas que o relatório já
 * conta como recebidas — Recebido, Concluído e Backlog — e das duas unidades
 * da Amil.
 *
 * A porta é uma chave fixa (BI_LEITURA_TOKEN), mandada no cabeçalho
 * Authorization. Sem a variável no ambiente a rota fica fechada para todo
 * mundo: o padrão é não expor nada.
 */

export const STATUS_DO_BI = ["received", "completed", "backlog"] as const;
const MAX_NOTAS = 20_000;

export type NotaParaOBi = {
  nota: string;
  status: (typeof STATUS_DO_BI)[number];
  /** Quando a nota foi marcada como Recebida: é daqui que o D+1 conta. */
  recebidoEm: string | null;
  /** A "Data do Último Status" do relatório: quando a nota mudou pela última vez. */
  ultimoStatusEm: string;
  agendadoPara: string | null;
  unidade: "HSH" | "MSH";
};

type Linha = {
  invoiceNumber: string | null;
  status: string;
  updatedAt: Date | string | null;
  scheduledFor: Date | string | null;
  receivedAt: Date | string | null;
  recipientCnpj: string | null;
};

const comoData = (v: Date | string | null) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A linha do banco como o BI precisa, ou null quando ela não entra na conta. */
export function notaParaOBi(linha: Linha): NotaParaOBi | null {
  const nota = (linha.invoiceNumber ?? "").trim();
  if (!nota) return null;
  if (!(STATUS_DO_BI as readonly string[]).includes(linha.status)) return null;
  const sigla = unidadePorCnpj(linha.recipientCnpj)?.sigla;
  if (sigla !== "HSH" && sigla !== "MSH") return null;
  const ultimo = comoData(linha.updatedAt);
  if (!ultimo) return null;
  const agendado = comoData(linha.scheduledFor);
  const recebido = comoData(linha.receivedAt);
  return {
    nota,
    status: linha.status as NotaParaOBi["status"],
    recebidoEm: recebido ? recebido.toISOString() : null,
    ultimoStatusEm: ultimo.toISOString(),
    agendadoPara: agendado ? agendado.toISOString() : null,
    unidade: sigla,
  };
}

/** Compara a chave sem vazar, pelo tempo de resposta, quantos caracteres bateram. */
export function chaveConfere(recebida: string | undefined, esperada: string): boolean {
  if (!esperada) return false;
  const bruta = (recebida ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bruta) return false;
  const a = createHash("sha256").update(bruta).digest();
  const b = createHash("sha256").update(esperada).digest();
  return timingSafeEqual(a, b);
}

export function registrarLeituraDoBi(app: Express, chave: () => string = () => (process.env.BI_LEITURA_TOKEN ?? "").trim()) {
  app.get("/api/bi/notas-recebimento", async (req: Request, res: Response) => {
    const esperada = chave();
    if (!esperada) {
      res.status(503).json({ error: "A leitura do BI está desligada: falta BI_LEITURA_TOKEN no ambiente." });
      return;
    }
    if (!chaveConfere(req.get("authorization"), esperada)) {
      res.status(401).json({ error: "Chave inválida." });
      return;
    }
    const desde = String(req.query.desde ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      res.status(400).json({ error: "Informe desde=AAAA-MM-DD." });
      return;
    }
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Banco de dados indisponível." });
      return;
    }
    // Entra a nota recebida, mudada ou agendada desde a data pedida: o D+1 conta
    // do Recebido, e o gráfico de NFs recebidas, do agendamento.
    const inicio = new Date(`${desde}T00:00:00-03:00`);
    const colunas = {
      invoiceNumber: appointments.invoiceNumber,
      status: appointments.status,
      updatedAt: appointments.updatedAt,
      scheduledFor: appointments.scheduledFor,
      receivedAt: appointments.receivedAt,
      recipientCnpj: appointments.recipientCnpj,
    };
    const filtro = and(inArray(appointments.status, [...STATUS_DO_BI]), isNotNull(appointments.invoiceNumber));
    const [porRecebido, porStatus, porAgenda] = await Promise.all([
      db.select(colunas).from(appointments).where(and(filtro, gte(appointments.receivedAt, inicio))).limit(MAX_NOTAS),
      db.select(colunas).from(appointments).where(and(filtro, gte(appointments.updatedAt, inicio))).limit(MAX_NOTAS),
      db.select(colunas).from(appointments).where(and(filtro, gte(appointments.scheduledFor, inicio))).limit(MAX_NOTAS),
    ]);
    const vistas = new Set<string>();
    const notas: NotaParaOBi[] = [];
    for (const linha of [...porRecebido, ...porStatus, ...porAgenda]) {
      const n = notaParaOBi(linha);
      if (!n) continue;
      const chaveDaNota = `${n.unidade}|${n.nota}`;
      if (vistas.has(chaveDaNota)) continue;
      vistas.add(chaveDaNota);
      notas.push(n);
    }
    res.json({ notas, geradoEm: new Date().toISOString(), cortado: [porRecebido, porStatus, porAgenda].some((l) => l.length >= MAX_NOTAS) });
  });
}
