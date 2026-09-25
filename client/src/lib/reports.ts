import { type PortalStatus, statusCopy } from "./portal";
import { apenasDigitos, formatarCnpj, unidadePorCnpj } from "@shared/recipients";
import { rotuloDoMotivo } from "@shared/backlogReasons";
import { notaEhUrgente } from "@shared/purchaseOrders";

export type ReportAppointment = {
  id: number;
  createdAt?: Date | string | null;
  /** Quando o status mudou pela última vez. */
  updatedAt?: Date | string | null;
  /** Quantos itens a nota tem. Vem contado do banco. */
  totalDeLinhas?: number | null;
  invoiceNumber: string | null;
  supplierName: string | null;
  invoiceSupplierName: string | null;
  /** CNPJ do emitente, lido do XML da nota. */
  invoiceSupplierCnpj: string | null;
  /** CNPJ cadastrado no login que enviou. Serve de reserva. */
  supplierCnpj: string | null;
  recipientCnpj: string | null;
  rejectionReason?: string | null;
  purchaseOrder: string | null;
  miroNumber: string | null;
  invoiceVolumeCount: number | null;
  invoiceTotalCents: number | null;
  serviceType: string;
  status: PortalStatus;
  scheduledFor: Date | string;
  receivedAt: Date | string | null;
};

export type ReportFilters = {
  scheduledStart?: string;
  scheduledEnd?: string;
  receivedStart?: string;
  receivedEnd?: string;
  status?: PortalStatus | "all";
  supplier?: string;
  recipientCnpj?: string;
};

/**
 * As colunas do consolidado, na ordem em que a operação as conhece.
 *
 * São as mesmas do relatório que o sistema anterior exportava: quem confere
 * hoje tem planilha antiga aberta ao lado, e mudar a ordem ou o nome de uma
 * coluna obriga a pessoa a reaprender um documento que ela já lê de cor. O que
 * é só nosso — MIRO, volumes, valores — mora no detalhado.
 */
export type ConsolidatedReportRow = {
  "Data de Criação": string;
  "Último Status": string;
  "Data do Último Status": string;
  "Data de Agendamento": string;
  "Número da Nota": string;
  "Número do Pedido": string;
  "CNPJ Fornecedor": string;
  "Nome Fornecedor": string;
  "Total de Linhas": string;
  "CNPJ Destino": string;
  "Descrição Destino": string;
};

/** O detalhado acrescenta o que não cabe numa visão de conferência rápida. */
export type DetailedReportRow = ConsolidatedReportRow & {
  "Número MIRO": string;
  Volumes: string;
  "Valor total": string;
  "Data de Recebimento": string;
  "Item recebido": string;
  "Motivo da recusa": string;
};

function isWithinDateRange(value: Date | string | null, start?: string, end?: string) {
  if (!start && !end) return true;
  if (!value) return false;
  const date = new Date(value);
  if (start && date < new Date(`${start}T00:00:00`)) return false;
  if (end && date > new Date(`${end}T23:59:59.999`)) return false;
  return true;
}

export function formatReportDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function formatReportMoney(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/**
 * O CNPJ do remetente.
 *
 * Vale o que está no XML, que é quem emitiu a nota. O CNPJ do login entra só
 * como reserva: ele identifica quem acessa o portal, que pode ser uma
 * transportadora enviando por outra empresa — ou uma conta de teste com CNPJ
 * zerado, que foi como isso apareceu no relatório.
 */
export function cnpjDoRemetente(item: { invoiceSupplierCnpj: string | null; supplierCnpj: string | null }): string | null {
  const daNota = apenasDigitos(item.invoiceSupplierCnpj);
  if (daNota.length >= 11 && !/^0+$/.test(daNota)) return daNota;
  const doLogin = apenasDigitos(item.supplierCnpj);
  if (doLogin.length >= 11 && !/^0+$/.test(doLogin)) return doLogin;
  return null;
}

/** A unidade que recebeu, pelo nome que a operação usa. */
export function unitLabel(recipientCnpj: string | null) {
  const unidade = unidadePorCnpj(recipientCnpj);
  if (unidade) return `${unidade.sigla} — ${unidade.nome}`;
  return apenasDigitos(recipientCnpj) ? formatarCnpj(recipientCnpj) : "—";
}

/** "HSH - HOSPITAL", como a planilha de origem escreve. */
function descricaoDestino(recipientCnpj: string | null) {
  const unidade = unidadePorCnpj(recipientCnpj);
  if (unidade) return `${unidade.sigla} - ${unidade.curto}`;
  return apenasDigitos(recipientCnpj) ? "Destino não cadastrado" : "—";
}

function baseRow(item: ReportAppointment): ConsolidatedReportRow {
  return {
    "Data de Criação": formatReportDate(item.createdAt ?? null),
    "Último Status": statusCopy[item.status],
    "Data do Último Status": formatReportDate(item.updatedAt ?? null),
    "Data de Agendamento": formatReportDate(item.scheduledFor),
    "Número da Nota": item.invoiceNumber || "—",
    "Número do Pedido": item.purchaseOrder || "—",
    "CNPJ Fornecedor": cnpjDoRemetente(item) ? formatarCnpj(cnpjDoRemetente(item)) : "—",
    "Nome Fornecedor": item.invoiceSupplierName || item.supplierName || "—",
    "Total de Linhas": item.totalDeLinhas === null || item.totalDeLinhas === undefined ? "—" : String(item.totalDeLinhas),
    "CNPJ Destino": apenasDigitos(item.recipientCnpj) ? formatarCnpj(item.recipientCnpj) : "—",
    "Descrição Destino": descricaoDestino(item.recipientCnpj),
  };
}

export function toConsolidatedReportRows(appointments: ReportAppointment[]): ConsolidatedReportRow[] {
  return appointments.map(baseRow);
}

export function toDetailedReportRows(appointments: ReportAppointment[]): DetailedReportRow[] {
  return appointments.map(item => ({
    ...baseRow(item),
    // O MIRO é a chave para cruzar com o SAP; sem ele a conferência volta a ser
    // nota por nota, na mão.
    "Número MIRO": item.miroNumber || "—",
    Volumes: item.invoiceVolumeCount === null ? "—" : String(item.invoiceVolumeCount),
    "Valor total": formatReportMoney(item.invoiceTotalCents),
    "Data de Recebimento": formatReportDate(item.receivedAt),
    // Uma nota recusada não está "aguardando recebimento": ela não vem mais. A
    // coluna diz o que aconteceu com ela, com o motivo quando existe.
    "Item recebido": item.status === "received" || item.status === "completed"
      ? item.serviceType
      : item.status === "rejected"
        ? `Recusada${item.rejectionReason ? `: ${item.rejectionReason}` : ""}`
        : item.status === "backlog"
          ? "Em backlog"
          : "Aguardando recebimento",
    "Motivo da recusa": item.rejectionReason || "—",
  }));
}

/**
 * Os nomes das colunas de cada visão, tirados das próprias linhas.
 *
 * A tela e o Excel liam listas de colunas diferentes, e foi assim que o número
 * MIRO passou a sair na exportação sem nunca aparecer na tela. Derivando as duas
 * da mesma função, elas não têm como divergir de novo.
 */
export function reportColumns(view: "consolidated" | "detailed"): string[] {
  const modelo: ReportAppointment = {
    id: 0, invoiceNumber: null, supplierName: null, invoiceSupplierName: null, supplierCnpj: null,
    invoiceSupplierCnpj: null, recipientCnpj: null, purchaseOrder: null, miroNumber: null, invoiceVolumeCount: null,
    invoiceTotalCents: null, serviceType: "", status: "pending", scheduledFor: new Date(0), receivedAt: null,
    createdAt: null, updatedAt: null, totalDeLinhas: null,
  };
  const linha = view === "detailed" ? toDetailedReportRows([modelo])[0] : toConsolidatedReportRows([modelo])[0];
  return Object.keys(linha);
}

export type BacklogReportAppointment = {
  id: number;
  createdAt: Date | string;
  enteredBacklogAt: Date | string | null;
  leftBacklogAt: Date | string | null;
  status: PortalStatus;
  invoiceNumber: string | null;
  invoiceSupplierName: string | null;
  supplierName: string | null;
  /** Já vem do XML da nota; o do login fica em loginCnpj. */
  supplierCnpj: string | null;
  loginCnpj: string | null;
  miroNumber: string | null;
  backlogReasonCode: string | null;
  backlogReason: string | null;
  comments: { authorName: string | null; body: string; createdAt: Date | string }[];
};

export type BacklogReportRow = {
  "Data de Criação": string;
  "Entrou em Backlog": string;
  "Saiu do Backlog": string;
  "Status Atual": string;
  "Número da Nota": string;
  "CNPJ Fornecedor": string;
  "Nome Fornecedor": string;
  "Cód. SAP": string;
  Motivo: string;
  Comentários: string;
};

/**
 * Filtra o relatório de backlog.
 *
 * O período vale sobre a entrada no backlog, e não sobre o agendamento: quem
 * abre este relatório quer saber o que travou no mês, não o que foi entregue.
 */
export function filterBacklogReport(linhas: BacklogReportAppointment[], filters: ReportFilters) {
  const busca = filters.supplier?.trim().toLocaleLowerCase() ?? "";
  const buscaDigitos = apenasDigitos(busca);
  return linhas.filter(item => {
    if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
    if (!isWithinDateRange(item.enteredBacklogAt, filters.scheduledStart, filters.scheduledEnd)) return false;
    if (busca) {
      const nome = `${item.invoiceSupplierName || ""} ${item.supplierName || ""}`.toLocaleLowerCase();
      const porCnpj = buscaDigitos.length > 0 && (cnpjDoRemetenteDoBacklog(item) ?? "").includes(buscaDigitos);
      if (!nome.includes(busca) && !porCnpj) return false;
    }
    return true;
  });
}

function cnpjDoRemetenteDoBacklog(item: BacklogReportAppointment): string | null {
  return cnpjDoRemetente({ invoiceSupplierCnpj: item.supplierCnpj, supplierCnpj: item.loginCnpj });
}

/**
 * Tira o rótulo do começo da descrição.
 *
 * Por um tempo a descrição foi gravada já prefixada com o rótulo do motivo, e
 * essas notas continuam no banco. Sem isto, o relatório repete: "Erro fiscal —
 * Erro fiscal: erro".
 */
function descricaoSemRotulo(rotulo: string, descricao: string | null): string {
  if (!descricao) return "";
  const prefixo = `${rotulo}: `;
  return descricao.startsWith(prefixo) ? descricao.slice(prefixo.length) : descricao;
}

export function toBacklogReportRows(linhas: BacklogReportAppointment[]): BacklogReportRow[] {
  return linhas.map(item => {
    const rotulo = rotuloDoMotivo(item.backlogReasonCode);
    return ({
    "Data de Criação": formatReportDate(item.createdAt),
    "Entrou em Backlog": formatReportDate(item.enteredBacklogAt),
    // Sem saída registrada, a nota ainda está lá — dizer "—" esconderia isso.
    "Saiu do Backlog": item.leftBacklogAt ? formatReportDate(item.leftBacklogAt) : "Em aberto",
    "Status Atual": statusCopy[item.status],
    "Número da Nota": item.invoiceNumber || "—",
    "CNPJ Fornecedor": cnpjDoRemetenteDoBacklog(item) ? formatarCnpj(cnpjDoRemetenteDoBacklog(item)) : "—",
    "Nome Fornecedor": item.invoiceSupplierName || item.supplierName || "—",
    "Cód. SAP": item.miroNumber || "—",
    Motivo: [rotulo, descricaoSemRotulo(rotulo, item.backlogReason)].filter(Boolean).join(" — "),
    // Os comentários vão numa célula só, cada um com quem escreveu e quando,
    // separados por " | " para a planilha não quebrar a linha.
    Comentários: item.comments.map(nota => `[${formatReportDate(nota.createdAt)}] ${nota.authorName || "Colaborador"}: ${nota.body.replace(/\s+/g, " ").trim()}`).join(" | "),
  });
  });
}

export const COLUNAS_DO_BACKLOG = Object.keys(
  toBacklogReportRows([{
    id: 0, createdAt: new Date(0), enteredBacklogAt: null, leftBacklogAt: null, status: "backlog",
    invoiceNumber: null, invoiceSupplierName: null, supplierName: null, supplierCnpj: null, loginCnpj: null,
    miroNumber: null, backlogReasonCode: null, backlogReason: null, comments: [],
  }])[0],
);

/** Uma nota da fila do backlog, como a tela de tratativa a recebe. */
export type BacklogQueueAppointment = {
  invoiceNumber: string | null;
  purchaseOrder: string | null;
  invoiceSupplierName: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  invoiceSupplierCnpj: string | null;
  supplierCnpj: string | null;
  recipientCnpj: string | null;
  invoiceVolumeCount: number | null;
  backlogReasonCode: string | null;
  backlogReason: string | null;
  scheduledFor: Date | string;
  urgenteMarcadoEm?: Date | string | null;
};

/** A fila que está na tela, linha por linha. */
export type BacklogQueueRow = {
  "Número da Nota": string;
  "Número do Pedido": string;
  "CNPJ Fornecedor": string;
  "Nome Fornecedor": string;
  "E-mail Fornecedor": string;
  Destinatário: string;
  Motivo: string;
  Volumes: string;
  "Data de Agendamento": string;
  Urgente: string;
};

/**
 * A fila aberta do backlog, para a planilha.
 *
 * Não é o mesmo que o relatório de backlog: aquele conta a história — entrada,
 * saída, comentários — de tudo que já passou por lá. Este é a fila de agora,
 * a que está na tela de tratativa, com o que o planejamento precisa para
 * trabalhar fora do portal: quem mandou, para qual unidade, por que travou.
 */
export function toBacklogQueueRows(notas: BacklogQueueAppointment[]): BacklogQueueRow[] {
  return notas.map(item => {
    const rotulo = rotuloDoMotivo(item.backlogReasonCode);
    const cnpj = cnpjDoRemetente(item);
    return {
      "Número da Nota": item.invoiceNumber || "—",
      "Número do Pedido": item.purchaseOrder || "—",
      "CNPJ Fornecedor": cnpj ? formatarCnpj(cnpj) : "—",
      "Nome Fornecedor": item.invoiceSupplierName || item.supplierName || "—",
      "E-mail Fornecedor": item.supplierEmail || "—",
      Destinatário: unitLabel(item.recipientCnpj),
      Motivo: [rotulo, descricaoSemRotulo(rotulo, item.backlogReason)].filter(Boolean).join(" — "),
      Volumes: item.invoiceVolumeCount === null ? "—" : String(item.invoiceVolumeCount),
      "Data de Agendamento": formatReportDate(item.scheduledFor),
      // A urgência vem do pedido (faixa 4000) ou de quem marcou na mão; as duas
      // chegam aqui já resolvidas pela tela, então basta dizer sim ou não.
      Urgente: item.urgenteMarcadoEm || notaEhUrgente(item.purchaseOrder) ? "Sim" : "Não",
    };
  });
}

export const COLUNAS_DA_FILA_DO_BACKLOG = Object.keys(
  toBacklogQueueRows([{
    invoiceNumber: null, purchaseOrder: null, invoiceSupplierName: null, supplierName: null, supplierEmail: null,
    invoiceSupplierCnpj: null, supplierCnpj: null, recipientCnpj: null, invoiceVolumeCount: null,
    backlogReasonCode: null, backlogReason: null, scheduledFor: new Date(0), urgenteMarcadoEm: null,
  }])[0],
);
