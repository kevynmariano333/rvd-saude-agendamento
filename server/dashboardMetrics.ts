import { ranquearFornecedores, recortarRanking } from "../shared/qualificacaoDoFornecedor";
import type { AppointmentStatus } from "../drizzle/schema";
import { UNIDADES, unidadePorCnpj } from "../shared/recipients";

export type DashboardAppointment = {
  status: AppointmentStatus;
  scheduledFor: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
  supplierName: string | null;
  invoiceSupplierName: string | null;
  invoiceTotalCents: number | null;
  /** Para qual unidade a carga foi — é por ele que a barra se divide. */
  recipientCnpj: string | null;
  /** Quantos volumes a nota trouxe. Nem toda nota informa. */
  invoiceVolumeCount: number | null;
  /** O CNPJ de quem emitiu — é por ele que o fornecedor é identificado. */
  invoiceSupplierCnpj: string | null;
  /** O horário agendado nunca foi combinado com ninguém. */
  semAgendamento?: boolean | null;
  /** A categoria da recusa, quando houve. */
  rejectionReasonCode?: string | null;
  /** Quando a nota mudou de estado pela última vez — é quando a recusa aconteceu. */
  updatedAt?: Date | null;
  /** As datas confirmadas que passaram sem a carga chegar, vindas do histórico. */
  datasFuradas?: Date[] | null;
};

/**
 * A sigla da unidade que recebeu, ou "Outros".
 *
 * Nota do acervo antigo pode ter vindo sem destinatário reconhecido, e ela não
 * pode sumir da contagem: some do gráfico e o total do dia deixa de bater com o
 * número de notas recebidas, que é o pior jeito de um painel mentir.
 */
const OUTROS = "Outros";

export function siglaDaUnidade(recipientCnpj: string | null): string {
  return unidadePorCnpj(recipientCnpj)?.sigla ?? OUTROS;
}

/** As colunas da barra empilhada, na ordem fixa em que a operação as lê. */
export const SIGLAS_DAS_UNIDADES = [...UNIDADES.map(unidade => unidade.sigla), OUTROS];

type BarraDoGrafico = { label: string; total: number; volumes: number } & Record<string, number | string>;

function barraVazia(label: string): BarraDoGrafico {
  const barra = { label, total: 0, volumes: 0 } as BarraDoGrafico;
  for (const sigla of SIGLAS_DAS_UNIDADES) barra[sigla] = 0;
  return barra;
}

export type DashboardPeriod = {
  month: number;
  year: number;
  /** Um dia do mês, quando o painel olha para uma data só. */
  day?: number | null;
  now?: Date;
};

/** Os rótulos do gráfico por mês, curtos porque são doze numa linha só. */
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function isWithinPeriod(date: Date | null, start: Date, end: Date) {
  return Boolean(date && date >= start && date < end);
}

/**
 * De quem é a entrega.
 *
 * Do emitente da nota, e não da conta que lançou o agendamento. Eram tratados
 * como a mesma coisa, e por isso o operador do sistema aparecia em primeiro
 * lugar no ranking de fornecedores: as notas que ele lança à mão carregam o
 * usuário dele como "fornecedor". O nome do emitente vem do XML; o da conta só
 * serve quando não há emitente — nota de serviço, por exemplo.
 */
function supplierLabel(item: DashboardAppointment) {
  return item.invoiceSupplierName?.trim() || item.supplierName?.trim() || "Fornecedor não informado";
}

export function buildDashboardMetrics(items: DashboardAppointment[], period: DashboardPeriod) {
  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  // Um dia que não existe no mês escolhido — 31 em setembro, 30 em fevereiro —
  // não pode virar um período vazio: aí o painel mostra o mês inteiro.
  const day = period.day && period.day >= 1 && period.day <= daysInMonth ? period.day : null;
  const start = day ? new Date(period.year, period.month - 1, day) : new Date(period.year, period.month - 1, 1);
  const end = day ? new Date(period.year, period.month - 1, day + 1) : new Date(period.year, period.month, 1);
  const now = period.now ?? new Date();
  const dailyReceived: (BarraDoGrafico & { day: number })[] = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    ...barraVazia(`${String(index + 1).padStart(2, "0")}/${String(period.month).padStart(2, "0")}`),
  }));
  const monthlyReceived: (BarraDoGrafico & { month: number })[] = MONTH_LABELS.map((label, index) => ({
    month: index + 1,
    ...barraVazia(label),
  }));
  const receivedBySupplier = new Map<string, number>();
  const pending = items.filter(item => item.status === "pending");
  const scheduled = items.filter(item => item.status === "scheduled" && isWithinPeriod(item.scheduledFor, start, end));
  const scheduledCount = scheduled.length;
  const received = items.filter(item => isWithinPeriod(item.receivedAt, start, end));

  const monthStart = new Date(period.year, period.month - 1, 1);
  const monthEnd = new Date(period.year, period.month, 1);
  const yearStart = new Date(period.year, 0, 1);
  const yearEnd = new Date(period.year + 1, 0, 1);
  items.forEach(item => {
    const receivedAt = item.receivedAt;
    if (!receivedAt) return;
    const sigla = siglaDaUnidade(item.recipientCnpj);
    const volumes = item.invoiceVolumeCount ?? 0;
    if (isWithinPeriod(receivedAt, monthStart, monthEnd)) {
      const barra = dailyReceived[receivedAt.getDate() - 1]!;
      barra.total += 1;
      barra.volumes += volumes;
      barra[sigla] = (barra[sigla] as number) + 1;
    }
    // A leitura por mês é do ano inteiro: é ela que mostra o ano tomando forma.
    if (isWithinPeriod(receivedAt, yearStart, yearEnd)) {
      const barra = monthlyReceived[receivedAt.getMonth()]!;
      barra.total += 1;
      barra.volumes += volumes;
      barra[sigla] = (barra[sigla] as number) + 1;
    }
  });

  received.forEach(item => {
    const supplier = supplierLabel(item);
    receivedBySupplier.set(supplier, (receivedBySupplier.get(supplier) ?? 0) + 1);
  });

  const waitMinutes = pending.reduce((total, item) => total + Math.max(0, Math.floor((now.getTime() - item.createdAt.getTime()) / 60_000)), 0);
  const averageWaitMinutes = pending.length ? Math.round(waitMinutes / pending.length) : 0;

  return {
    period: { month: period.month, year: period.year, day },
    pendingCount: pending.length,
    scheduledCount,
    receivedCount: received.length,
    pendingTotalCents: pending.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    scheduledTotalCents: scheduled.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    receivedTotalCents: received.reduce((sum, item) => sum + (item.invoiceTotalCents ?? 0), 0),
    // Volumes e a divisão por unidade no período escolhido: é o que o gráfico
    // mostra dia a dia, somado, para quem quer o número e não a forma.
    receivedVolumes: received.reduce((sum, item) => sum + (item.invoiceVolumeCount ?? 0), 0),
    receivedPorUnidade: SIGLAS_DAS_UNIDADES.map(sigla => ({
      sigla,
      notas: received.filter(item => siglaDaUnidade(item.recipientCnpj) === sigla).length,
      volumes: received
        .filter(item => siglaDaUnidade(item.recipientCnpj) === sigla)
        .reduce((sum, item) => sum + (item.invoiceVolumeCount ?? 0), 0),
    })),
    dailyReceived,
    monthlyReceived,
    // A qualificação olha o período inteiro escolhido, e não só o que foi
    // recebido: a entrega recusada nunca é recebida, e é justamente ela que
    // precisa pesar na nota do fornecedor.
    //
    // A ausência também entra por conta própria. A nota remarcada volta para
    // "agendada" e perde o desfecho, então o fornecedor que não apareceu
    // nenhuma vez sumia do card inteiro — onze notas, onze faltas, e uma lista
    // onde ele não existia. A falta é do dia que ficou vazio, e é no mês desse
    // dia que ela aparece.
    qualificacao: recortarRanking(
      ranquearFornecedores(
      items
        .map(item => ({ item, furadas: (item.datasFuradas ?? []).filter(dia => isWithinPeriod(dia, start, end)).length }))
        .filter(
          ({ item, furadas }) =>
            furadas > 0 || isWithinPeriod(item.receivedAt, start, end) || (item.status === "rejected" && isWithinPeriod(item.updatedAt ?? null, start, end)),
        )
        .map(({ item, furadas }) => ({
          cnpj: item.invoiceSupplierCnpj,
          nome: item.invoiceSupplierName,
          status: item.status,
          scheduledFor: item.scheduledFor,
          receivedAt: item.receivedAt,
          semAgendamento: item.semAgendamento,
          rejectionReasonCode: item.rejectionReasonCode,
          datasFuradas: furadas,
        })),
      ),
    ),
    topSuppliers: Array.from(receivedBySupplier, ([name, notesReceived]) => ({ name, notesReceived }))
      .sort((a, b) => b.notesReceived - a.notesReceived || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 5),
    averageWaitMinutes,
    pendingBasis: pending.length,
  };
}
