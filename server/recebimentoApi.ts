import type { Express, Request, Response } from "express";
import { and, gte, inArray, lte, or } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { formatSaoPauloDateKey } from "../shared/dateFilters";
import { unidadePorCnpj } from "../shared/recipients";
import { getDb } from "./db";
import { chaveConfere } from "./leituraDoBi";

/**
 * Contagem de recebimento da Amil (HSH e MSH) para sistemas externos.
 *
 * Responde quantas notas foram recebidas por dia e por mês, e quantas foram
 * agendadas, no período pedido. Não devolve nota, fornecedor nem valor: só
 * números. A chave é outra (RECEBIMENTO_API_TOKEN), separada da do robô do BI,
 * para poder ser trocada ou revogada sem mexer no outro.
 *
 * "Recebida" é a nota que o relatório já conta como recebida (Recebido,
 * Concluído e Backlog), pelo dia do recebimento em horário de Brasília.
 * "Agendada" é a nota com data de agendamento no período e que ainda tem
 * agendamento (Agendado ou já recebida); pendente e recusada ficam de fora.
 */

const STATUS_RECEBIDA = ["received", "completed", "backlog"] as const;
const STATUS_AGENDADA = ["scheduled", "received", "completed", "backlog"] as const;
const SIGLAS_DA_AMIL = ["HSH", "MSH"] as const;
const MAX_LINHAS = 50_000;
const MAX_DIAS = 366;
const DIA_EM_MS = 24 * 60 * 60 * 1000;

export type LinhaDeRecebimento = {
  status: string;
  receivedAt: Date | string | null;
  scheduledFor: Date | string | null;
  recipientCnpj: string | null;
};

export type Periodo = { desde: string; ate: string };

const comoData = (v: Date | string | null) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ehDaAmil = (cnpj: string | null) => {
  const sigla = unidadePorCnpj(cnpj)?.sigla;
  return SIGLAS_DA_AMIL.some(item => item === sigla);
};

/** Quantos dias de calendário tem o período, contando os dois extremos. */
export function diasDoPeriodo({ desde, ate }: Periodo): number {
  const inicio = Date.UTC(...dividirData(desde));
  const fim = Date.UTC(...dividirData(ate));
  return Math.round((fim - inicio) / DIA_EM_MS) + 1;
}

function dividirData(chave: string): [number, number, number] {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return [ano, mes - 1, dia];
}

/** Os dias do período, um a um, para o gráfico não pular os dias sem nota. */
function listarDias({ desde, ate }: Periodo): string[] {
  const dias: string[] = [];
  const inicio = Date.UTC(...dividirData(desde));
  for (let i = 0; i < diasDoPeriodo({ desde, ate }); i++) {
    dias.push(new Date(inicio + i * DIA_EM_MS).toISOString().slice(0, 10));
  }
  return dias;
}

/** Conta as notas da Amil no período. Função pura: o banco entra só como lista. */
export function resumoDeRecebimento(linhas: LinhaDeRecebimento[], periodo: Periodo) {
  const inicio = new Date(`${periodo.desde}T00:00:00-03:00`).getTime();
  const fim = new Date(`${periodo.ate}T23:59:59.999-03:00`).getTime();
  const dentro = (data: Date | null) => !!data && data.getTime() >= inicio && data.getTime() <= fim;

  const porDia = new Map<string, number>();
  let agendadas = 0;
  for (const linha of linhas) {
    if (!ehDaAmil(linha.recipientCnpj)) continue;

    const recebido = comoData(linha.receivedAt);
    if (dentro(recebido) && (STATUS_RECEBIDA as readonly string[]).includes(linha.status)) {
      const dia = formatSaoPauloDateKey(recebido!);
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }

    const agendado = comoData(linha.scheduledFor);
    if (dentro(agendado) && (STATUS_AGENDADA as readonly string[]).includes(linha.status)) agendadas++;
  }

  const diaADia = listarDias(periodo).map(data => ({ data, quantidade: porDia.get(data) ?? 0 }));
  const porMesMapa = new Map<string, number>();
  for (const { data, quantidade } of diaADia) {
    const mes = data.slice(0, 7);
    porMesMapa.set(mes, (porMesMapa.get(mes) ?? 0) + quantidade);
  }
  const recebidas = diaADia.reduce((soma, item) => soma + item.quantidade, 0);

  return {
    recebidas: {
      total: recebidas,
      porDia: diaADia,
      porMes: Array.from(porMesMapa, ([mes, quantidade]) => ({ mes, quantidade })),
    },
    agendadas: { total: agendadas },
  };
}

export function registrarApiDeRecebimento(app: Express, chave: () => string = () => (process.env.RECEBIMENTO_API_TOKEN ?? "").trim()) {
  app.get("/api/recebimento/resumo", async (req: Request, res: Response) => {
    const esperada = chave();
    if (!esperada) {
      res.status(503).json({ error: "A API de recebimento está desligada: falta RECEBIMENTO_API_TOKEN no ambiente." });
      return;
    }
    if (!chaveConfere(req.get("authorization"), esperada)) {
      res.status(401).json({ error: "Chave inválida." });
      return;
    }
    const desde = String(req.query.desde ?? "");
    const ate = String(req.query.ate ?? "");
    const formato = /^\d{4}-\d{2}-\d{2}$/;
    if (!formato.test(desde) || !formato.test(ate)) {
      res.status(400).json({ error: "Informe desde=AAAA-MM-DD e ate=AAAA-MM-DD." });
      return;
    }
    const periodo = { desde, ate };
    const dias = diasDoPeriodo(periodo);
    if (dias < 1 || dias > MAX_DIAS) {
      res.status(400).json({ error: `O período precisa ter de 1 a ${MAX_DIAS} dias, com ate depois de desde.` });
      return;
    }
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Banco de dados indisponível." });
      return;
    }

    const inicio = new Date(`${desde}T00:00:00-03:00`);
    const fim = new Date(`${ate}T23:59:59.999-03:00`);
    const colunas = {
      status: appointments.status,
      receivedAt: appointments.receivedAt,
      scheduledFor: appointments.scheduledFor,
      recipientCnpj: appointments.recipientCnpj,
    };
    const linhas = await db
      .select(colunas)
      .from(appointments)
      .where(
        and(
          inArray(appointments.status, [...STATUS_AGENDADA]),
          or(
            and(gte(appointments.receivedAt, inicio), lte(appointments.receivedAt, fim)),
            and(gte(appointments.scheduledFor, inicio), lte(appointments.scheduledFor, fim)),
          ),
        ),
      )
      .limit(MAX_LINHAS);

    res.json({
      periodo,
      unidades: [...SIGLAS_DA_AMIL],
      ...resumoDeRecebimento(linhas, periodo),
      geradoEm: new Date().toISOString(),
      cortado: linhas.length >= MAX_LINHAS,
    });
  });
}
