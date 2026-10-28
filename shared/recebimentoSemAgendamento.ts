import { formatSaoPauloDateKey } from "./dateFilters";
import { unidadePorCnpj } from "./recipients";

/**
 * Notas que entraram no recebimento sem agendamento prévio.
 *
 * "Sem agendamento" é a nota que a portaria registrou direto, a partir do XML,
 * porque não havia data marcada. Conta como recebida o que o relatório já conta
 * como recebido: Recebido, Concluído e Backlog.
 */
export const STATUS_RECEBIDOS_SEM_AGENDA = ["received", "completed", "backlog"] as const;

/** A linha do banco, como a consulta devolve. */
export type LinhaSemAgendamento = {
  id: number;
  invoiceNumber: string | null;
  fornecedor: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  status: string;
  receivedAt: Date | string | null;
  invoiceTotalCents: number | null;
  invoiceVolumeCount: number | null;
};

export type NotaSemAgendamento = {
  id: number;
  nota: string;
  fornecedor: string;
  /** A sigla da unidade (HSH, MSH, RVD, LLT), ou "Sem unidade" se o CNPJ não for conhecido. */
  unidade: string;
  pedido: string;
  status: string;
  recebidoEm: string;
  valorCentavos: number | null;
  volumes: number | null;
};

export type ResumoSemAgendamento = {
  total: number;
  porDia: { data: string; quantidade: number }[];
  porUnidade: { unidade: string; quantidade: number }[];
  porFornecedor: { fornecedor: string; quantidade: number }[];
};

const SEM_UNIDADE = "Sem unidade";

/** A linha como o relatório mostra, ou null se ela não é uma nota recebida sem agenda. */
export function notaSemAgendamento(linha: LinhaSemAgendamento): NotaSemAgendamento | null {
  if (!(STATUS_RECEBIDOS_SEM_AGENDA as readonly string[]).includes(linha.status)) return null;
  const recebido = linha.receivedAt ? new Date(linha.receivedAt) : null;
  if (!recebido || Number.isNaN(recebido.getTime())) return null;
  return {
    id: linha.id,
    nota: linha.invoiceNumber?.trim() || "—",
    fornecedor: linha.fornecedor?.trim() || "—",
    unidade: unidadePorCnpj(linha.recipientCnpj)?.sigla ?? SEM_UNIDADE,
    pedido: linha.purchaseOrder?.trim() || "—",
    status: linha.status,
    recebidoEm: recebido.toISOString(),
    valorCentavos: linha.invoiceTotalCents,
    volumes: linha.invoiceVolumeCount,
  };
}

/** Os totais para o dashboard: quantas no período, em que dia e em que unidade. */
export function resumoSemAgendamento(notas: NotaSemAgendamento[]): ResumoSemAgendamento {
  const porDia = new Map<string, number>();
  const porUnidade = new Map<string, number>();
  const porFornecedor = new Map<string, number>();
  for (const nota of notas) {
    const dia = formatSaoPauloDateKey(new Date(nota.recebidoEm));
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    porUnidade.set(nota.unidade, (porUnidade.get(nota.unidade) ?? 0) + 1);
    porFornecedor.set(nota.fornecedor, (porFornecedor.get(nota.fornecedor) ?? 0) + 1);
  }
  return {
    total: notas.length,
    porDia: Array.from(porDia, ([data, quantidade]) => ({ data, quantidade })).sort((a, b) => a.data.localeCompare(b.data)),
    porUnidade: Array.from(porUnidade, ([unidade, quantidade]) => ({ unidade, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    porFornecedor: Array.from(porFornecedor, ([fornecedor, quantidade]) => ({ fornecedor, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
  };
}
