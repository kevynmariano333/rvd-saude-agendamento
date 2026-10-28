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

/** Um fornecedor dentro de uma unidade, com a parte dele no total da unidade. */
export type FornecedorNaUnidade = { fornecedor: string; quantidade: number; percentual: number };

/** O ranking de uma unidade: quantas notas e quem as mandou, do maior para o menor. */
export type RankingDaUnidade = { unidade: string; total: number; fornecedores: FornecedorNaUnidade[] };

export type ResumoSemAgendamento = {
  total: number;
  porDia: { data: string; quantidade: number }[];
  /** Cada dia com a contagem por unidade, para o gráfico empilhado. */
  porDiaEUnidade: { data: string; total: number; unidades: Record<string, number> }[];
  porUnidade: { unidade: string; quantidade: number }[];
  porFornecedor: { fornecedor: string; quantidade: number }[];
  /** HSH e MSH primeiro, depois as outras unidades. Cada uma com o seu ranking. */
  ranking: RankingDaUnidade[];
};

/**
 * Os níveis do ranking de fornecedores, do pior para o melhor. Nota sem
 * agendamento é falha de quem entrega, então quem mais manda sem agendar cai
 * no Péssimo, e quem manda menos sobe até o Ótimo.
 */
export const NIVEIS_DO_FORNECEDOR = ["Péssimo", "Ruim", "Bom", "Ótimo"] as const;
export type NivelDoFornecedor = (typeof NIVEIS_DO_FORNECEDOR)[number];

/**
 * O nível de um fornecedor pela posição no ranking (0 é o que mais manda). Os
 * fornecedores são divididos em quatro faixas iguais, da primeira à última.
 */
export function nivelDoFornecedor(posicao: number, total: number): NivelDoFornecedor {
  if (total <= 0) return NIVEIS_DO_FORNECEDOR[0];
  return NIVEIS_DO_FORNECEDOR[Math.floor((posicao * NIVEIS_DO_FORNECEDOR.length) / total)];
}

const SEM_UNIDADE = "Sem unidade";
/** A ordem da organização: as duas unidades da Amil primeiro, o resto depois. */
const UNIDADES_PRINCIPAIS = ["HSH", "MSH"];

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

/** A ordem das unidades: HSH e MSH na frente, as outras depois, pelo volume. */
function ordenarUnidades(unidades: string[], total: Map<string, number>) {
  return [...unidades].sort((a, b) => {
    const pa = UNIDADES_PRINCIPAIS.indexOf(a);
    const pb = UNIDADES_PRINCIPAIS.indexOf(b);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? Infinity : pa) - (pb === -1 ? Infinity : pb);
    return (total.get(b) ?? 0) - (total.get(a) ?? 0);
  });
}

const umDecimal = (valor: number) => Math.round(valor * 10) / 10;

/** Os totais para o dashboard e para a planilha: quantas no período, em que dia, de que unidade e de quem. */
export function resumoSemAgendamento(notas: NotaSemAgendamento[]): ResumoSemAgendamento {
  const porDia = new Map<string, number>();
  const porDiaEUnidade = new Map<string, { total: number; unidades: Record<string, number> }>();
  const porUnidade = new Map<string, number>();
  const porFornecedor = new Map<string, number>();
  const porUnidadeEFornecedor = new Map<string, Map<string, number>>();
  for (const nota of notas) {
    const dia = formatSaoPauloDateKey(new Date(nota.recebidoEm));
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    const do_dia = porDiaEUnidade.get(dia) ?? { total: 0, unidades: {} };
    do_dia.total += 1;
    do_dia.unidades[nota.unidade] = (do_dia.unidades[nota.unidade] ?? 0) + 1;
    porDiaEUnidade.set(dia, do_dia);
    porUnidade.set(nota.unidade, (porUnidade.get(nota.unidade) ?? 0) + 1);
    porFornecedor.set(nota.fornecedor, (porFornecedor.get(nota.fornecedor) ?? 0) + 1);
    const deFornecedor = porUnidadeEFornecedor.get(nota.unidade) ?? new Map<string, number>();
    deFornecedor.set(nota.fornecedor, (deFornecedor.get(nota.fornecedor) ?? 0) + 1);
    porUnidadeEFornecedor.set(nota.unidade, deFornecedor);
  }

  const ranking: RankingDaUnidade[] = ordenarUnidades(Array.from(porUnidadeEFornecedor.keys()), porUnidade).map(unidade => {
    const fornecedores = porUnidadeEFornecedor.get(unidade) ?? new Map<string, number>();
    const total = porUnidade.get(unidade) ?? 0;
    return {
      unidade,
      total,
      fornecedores: Array.from(fornecedores, ([fornecedor, quantidade]) => ({ fornecedor, quantidade, percentual: umDecimal((quantidade / total) * 100) })).sort((a, b) => b.quantidade - a.quantidade),
    };
  });

  return {
    total: notas.length,
    porDia: Array.from(porDia, ([data, quantidade]) => ({ data, quantidade })).sort((a, b) => a.data.localeCompare(b.data)),
    porDiaEUnidade: Array.from(porDiaEUnidade, ([data, dia]) => ({ data, ...dia })).sort((a, b) => a.data.localeCompare(b.data)),
    porUnidade: ordenarUnidades(Array.from(porUnidade.keys()), porUnidade).map(unidade => ({ unidade, quantidade: porUnidade.get(unidade) ?? 0 })),
    porFornecedor: Array.from(porFornecedor, ([fornecedor, quantidade]) => ({ fornecedor, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    ranking,
  };
}
