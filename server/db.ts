import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { customAlphabet, nanoid } from "nanoid";
import {
  appointments,
  appointmentMessages,
  appointmentStatusHistory,
  appointmentInternalNotes,
  appointmentSuggestions,
  attendanceEvents,
  attendances,
  passwordResetTokens,
  type AppointmentSource,
  type AppointmentStatus,
  type AttendanceClassification,
  type AttendanceClassificationDetail,
  type AttendanceEventType,
  type AttendanceServiceType,
  type AttendanceStatus,
  type InsertUser,
  type SuggestionStatus,
  type UserAccessStatus,
  type UserRole,
  users,
  companies,
  purchaseOrderItems,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { normalizeCnpj } from "./fiscalFilters";
import { getUnscheduledReceiptRegisteredAt } from "./receiptTiming";
import { getReceiptTimestampForStatus } from "./receiptStatus";
import { getSaoPauloDayRange } from "../shared/dateFilters";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Falha ao iniciar a conexão:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("O identificador do usuário é obrigatório.");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const values: InsertUser = { ...user, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = {
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: values.lastSignedIn,
  };

  if (user.role !== undefined) updateSet.role = user.role;
  if (user.passwordHash !== undefined) updateSet.passwordHash = user.passwordHash;
  if (user.openId === ENV.ownerOpenId) updateSet.role = "admin";

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function getUserByCompanyCnpj(companyCnpj: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.companyCnpj, companyCnpj)).limit(1);
  return result[0];
}

export async function createLocalUser(input: {
  email: string;
  role: UserRole;
  passwordHash: string;
  name?: string;
  companyName?: string;
  companyCnpj?: string;
  accessStatus?: UserAccessStatus;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const values: InsertUser = {
    openId: `rvd-${nanoid(18)}`,
    email: input.email,
    name: input.name?.trim() || input.email.split("@")[0],
    companyName: input.companyName?.trim() || null,
    companyCnpj: input.companyCnpj || null,
    loginMethod: "rvd-password",
    passwordHash: input.passwordHash,
    role: input.role,
    accessStatus: input.accessStatus ?? "approved",
    lastSignedIn: new Date(),
  };
  const result = await db.insert(users).values(values);
  return (await getUserById(Number(result[0].insertId)))!;
}

export async function touchUserSignIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export type AppointmentFilters = {
  /** De onde a nota veio: portal, XML manual, acervo importado ou nota de serviço. */
  source?: AppointmentSource;
  /** Fila do que ainda vai acontecer: o mais próximo primeiro. */
  futuroPrimeiro?: boolean;
  /** Quantas linhas trazer. Sem isto a tela recebia a tabela inteira. */
  limit?: number;
  offset?: number;
  /** Owners whose appointments the caller may see; empty means no access. */
  supplierIds?: number[];
  supplierId?: number;
  status?: AppointmentStatus;
  date?: string;
  invoiceNumber?: string;
  supplierName?: string;
  recipientCnpj?: string;
  /** Uma escolha de grupo vira vários CNPJs; qualquer um deles serve. */
  recipientCnpjs?: string[];
  /** Parte do pedido de compra. */
  purchaseOrder?: string;
  /** Código SAP do material, procurado entre os itens da nota. */
  sapCode?: string;
  /** CNPJ de quem emitiu, com ou sem pontuação. */
  supplierCnpj?: string;
  /** Quantos itens a nota tem, comparados por este operador. */
  itemCountOperator?: ">=" | "<=" | "=";
  itemCount?: number;
  /** Intervalo de datas do agendamento, em dias de São Paulo. */
  dateStart?: string;
  dateEnd?: string;
  /** Só notas com pedido de urgência. */
  onlyUrgent?: boolean;
  /** Pré-nota: confirmada, pendente, ou tanto faz. */
  preNote?: "done" | "pending";
  /** Tira o backlog da lista: ele tem aba e fila próprias. */
  excludeBacklog?: boolean;
};

/**
 * As condições que os filtros da tela e do relatório têm em comum.
 *
 * Ficam aqui, e não repetidas nos dois lugares, porque a pergunta é a mesma:
 * "esta nota casa com o que a pessoa digitou?". Duas cópias divergiriam no dia
 * em que uma delas ganhasse um filtro novo.
 */
function condicoesDeBusca(filtros: AppointmentFilters) {
  const condicoes = [];
  if (filtros.purchaseOrder) condicoes.push(like(appointments.purchaseOrder, `%${filtros.purchaseOrder.trim()}%`));
  // O código SAP mora dentro dos itens, em JSON. JSON_SEARCH olha só o campo
  // sapCode de cada item: um LIKE no JSON inteiro casaria com preço e descrição.
  if (filtros.sapCode) {
    const procurado = `%${filtros.sapCode.replace(/\s/g, "")}%`;
    condicoes.push(sql`JSON_SEARCH(${appointments.invoiceItemsJson}, 'one', ${procurado}, NULL, '$[*].sapCode') IS NOT NULL`);
  }
  if (filtros.supplierCnpj) {
    const digitos = normalizeCnpj(filtros.supplierCnpj);
    if (digitos) condicoes.push(or(like(appointments.invoiceSupplierCnpj, `%${digitos}%`), like(users.companyCnpj, `%${digitos}%`)));
  }
  if (filtros.itemCount !== undefined && Number.isFinite(filtros.itemCount)) {
    const quantidade = Math.trunc(filtros.itemCount);
    const itens = sql`COALESCE(JSON_LENGTH(${appointments.invoiceItemsJson}), 0)`;
    condicoes.push(filtros.itemCountOperator === "<=" ? sql`${itens} <= ${quantidade}` : filtros.itemCountOperator === "=" ? sql`${itens} = ${quantidade}` : sql`${itens} >= ${quantidade}`);
  }
  // Pedido que começa com 4000 é urgência — a mesma regra que ordena a fila e
  // pinta o selo na linha.
  if (filtros.onlyUrgent) condicoes.push(sql`${appointments.purchaseOrder} REGEXP '(^|[^0-9])4000'`);
  if (filtros.preNote === "done") condicoes.push(isNotNull(appointments.preNoteConfirmedAt));
  if (filtros.preNote === "pending") condicoes.push(isNull(appointments.preNoteConfirmedAt));
  const inicio = getSaoPauloDayRange(filtros.dateStart ?? "");
  const fim = getSaoPauloDayRange(filtros.dateEnd ?? "");
  if (inicio) condicoes.push(gte(appointments.scheduledFor, inicio.start));
  if (fim) condicoes.push(lte(appointments.scheduledFor, fim.end));
  return condicoes;
}

/**
 * As condições de uma consulta à lista de notas.
 *
 * Devolve `null` quando o filtro de fornecedores está vazio: isso não é "sem
 * condição nenhuma", é "não vê nada". Quem chama precisa tratar os dois casos,
 * e é por isso que o vazio não vem como lista vazia.
 */
function condicoesDaLista(filters: AppointmentFilters) {
  const conditions = [];
  if (filters.supplierId) conditions.push(eq(appointments.supplierId, filters.supplierId));
  if (filters.supplierIds) {
    if (!filters.supplierIds.length) return null;
    conditions.push(inArray(appointments.supplierId, filters.supplierIds));
  }
  if (filters.status) conditions.push(eq(appointments.status, filters.status));
  // O backlog sai no banco, e não na tela: filtrar depois de paginar entregaria
  // páginas de tamanhos diferentes, com buracos onde estavam as notas tiradas.
  else if (filters.excludeBacklog) conditions.push(ne(appointments.status, "backlog"));
  if (filters.source) conditions.push(eq(appointments.source, filters.source));
  if (filters.invoiceNumber) conditions.push(like(appointments.invoiceNumber, `%${filters.invoiceNumber.trim()}%`));
  if (filters.supplierName) {
    const supplierName = `%${filters.supplierName.trim()}%`;
    conditions.push(or(like(users.name, supplierName), like(appointments.invoiceSupplierName, supplierName)));
  }
  const cnpjsDestinatario = filters.recipientCnpjs?.map(normalizeCnpj).filter(Boolean) ?? [];
  if (cnpjsDestinatario.length) conditions.push(or(...cnpjsDestinatario.map(cnpj => like(appointments.recipientCnpj, `%${cnpj}%`))));
  else if (filters.recipientCnpj) conditions.push(like(appointments.recipientCnpj, `%${normalizeCnpj(filters.recipientCnpj)}%`));
  if (filters.date) {
    const range = getSaoPauloDayRange(filters.date);
    if (range) conditions.push(gte(appointments.scheduledFor, range.start), lte(appointments.scheduledFor, range.end));
  }
  conditions.push(...condicoesDeBusca(filters));
  return conditions;
}

/**
 * Quantas notas o filtro alcança, contadas no banco.
 *
 * A tela pagina de 25 em 25 e precisa saber quantas páginas existem. Contar o
 * que voltou não serve: o que volta é uma página.
 */
export async function countAppointments(filters: AppointmentFilters = {}) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = condicoesDaLista(filters);
  if (!conditions) return 0;
  const consulta = db.select({ total: count() }).from(appointments).innerJoin(users, eq(appointments.supplierId, users.id));
  const linhas = await (conditions.length ? consulta.where(and(...conditions)) : consulta);
  return Number(linhas[0]?.total ?? 0);
}

/**
 * A lista das notas, sem o que só o detalhamento usa.
 *
 * Os itens de cada nota (invoiceItemsJson) ficaram de fora: eram 39% do peso da
 * resposta, e nenhuma tela de lista mostra item nenhum. Quem abre uma nota
 * busca a nota inteira por id, uma de cada vez.
 */
export async function listAppointments(filters: AppointmentFilters = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = condicoesDaLista(filters);
  // Lista vazia de fornecedores é "não vê nada", não "vê tudo": sem esta saída,
  // o inArray sem valores cairia fora e exporia as notas de todo mundo.
  if (!conditions) return [];

  const query = db
    .select({
      id: appointments.id,
      supplierId: appointments.supplierId,
      supplierName: users.name,
      supplierEmail: users.email,
      // O CNPJ de quem enviou: o relatório promete busca por nome ou CNPJ do
      // fornecedor, e sem esta coluna a segunda metade da promessa era falsa.
      supplierCnpj: users.companyCnpj,
      serviceType: appointments.serviceType,
      scheduledFor: appointments.scheduledFor,
      notes: appointments.notes,
      source: appointments.source,
      preNoteConfirmedAt: appointments.preNoteConfirmedAt,
      preNoteConfirmedBy: appointments.preNoteConfirmedBy,
      xmlUrl: appointments.xmlUrl,
      xmlFileName: appointments.xmlFileName,
      invoiceNumber: appointments.invoiceNumber,
      invoiceAccessKey: appointments.invoiceAccessKey,
      purchaseOrder: appointments.purchaseOrder,
      invoiceSupplierName: appointments.invoiceSupplierName,
      invoiceSupplierCnpj: appointments.invoiceSupplierCnpj,
      recipientCnpj: appointments.recipientCnpj,
      invoiceIssuedAt: appointments.invoiceIssuedAt,
      invoiceTotalCents: appointments.invoiceTotalCents,
      invoiceVolumeCount: appointments.invoiceVolumeCount,
      receivedAt: appointments.receivedAt,
      miroNumber: appointments.miroNumber,
      quotationNumber: appointments.quotationNumber,
      memorizedOrder: appointments.memorizedOrder,
      hisEntryDocument: appointments.hisEntryDocument,
      hisExitDocument: appointments.hisExitDocument,
      backlogReasonCode: appointments.backlogReasonCode,
      backlogReason: appointments.backlogReason,
      treatedAt: appointments.treatedAt,
      rejectionReason: appointments.rejectionReason,
      status: appointments.status,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(users, eq(appointments.supplierId, users.id));

  const filtered = conditions.length ? query.where(and(...conditions)) : query;
  // Urgente primeiro dentro do mesmo dia: pedido que começa com 4000 é urgência,
  // e quem está montando o dia precisa vê-la antes do resto daquele dia.
  const urgentePrimeiro = sql`CASE WHEN ${appointments.purchaseOrder} REGEXP '(^|[^0-9])4000' THEN 0 ELSE 1 END`;
  // O que ainda vai acontecer é lido do mais próximo para o mais distante — é a
  // fila do dia. O que já aconteceu é lido do mais recente para trás, que é
  // como se procura no histórico.
  const ordenada = filters.futuroPrimeiro
    ? filtered.orderBy(sql`DATE(${appointments.scheduledFor}) ASC`, urgentePrimeiro, asc(appointments.scheduledFor))
    : filtered.orderBy(sql`DATE(${appointments.scheduledFor}) DESC`, urgentePrimeiro, desc(appointments.scheduledFor));
  return filters.limit ? ordenada.limit(filters.limit).offset(filters.offset ?? 0) : ordenada;
}

/**
 * Quantas notas existem em cada situação, contadas no banco.
 *
 * A tela do operador contava no navegador, e para isso baixava a tabela inteira
 * só para saber que existem 3.738 concluídas. Um GROUP BY responde o mesmo em
 * alguns bytes.
 */
/**
 * Quantas notas existem em cada situação, contadas no banco.
 *
 * Lê os mesmos filtros da lista — menos o status, que é justamente o que se
 * agrupa. Sem isso, a bolinha da aba respondia "quantas existem no total"
 * enquanto a tabela logo abaixo mostrava "quantas casam com o filtro": dois
 * números na mesma tela, medindo coisas diferentes, sem nada dizendo isso.
 */
export async function countAppointmentsByStatus(filters: AppointmentFilters = {}) {
  const db = await getDb();
  if (!db) return {} as Record<string, number>;
  // O status sai do filtro (é o que agrupa) e o backlog volta para a contagem:
  // ele tem aba própria, e ela também mostra o seu número.
  const conditions = condicoesDaLista({ ...filters, status: undefined, excludeBacklog: false });
  if (!conditions) return {} as Record<string, number>;
  const consulta = db.select({ status: appointments.status, total: count() }).from(appointments).innerJoin(users, eq(appointments.supplierId, users.id));
  const linhas = await (conditions.length ? consulta.where(and(...conditions)) : consulta).groupBy(appointments.status);
  const porStatus: Record<string, number> = {};
  for (const linha of linhas) porStatus[linha.status] = Number(linha.total);

  // Nota agendada cuja hora já passou e que ninguém recebeu: é o caminhão que
  // não chegou. A tela pisca a aba quando este número não é zero.
  const atraso = [...conditions, eq(appointments.status, "scheduled"), lt(appointments.scheduledFor, new Date())];
  const atrasadas = await db.select({ total: count() }).from(appointments).innerJoin(users, eq(appointments.supplierId, users.id)).where(and(...atraso));
  porStatus.atrasadas = Number(atrasadas[0]?.total ?? 0);
  return porStatus;
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return result[0];
}

export async function deleteAppointmentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(appointments).where(eq(appointments.id, id));
}

export async function listAppointmentHistory(appointmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: appointmentStatusHistory.id,
      previousStatus: appointmentStatusHistory.previousStatus,
      nextStatus: appointmentStatusHistory.nextStatus,
      createdAt: appointmentStatusHistory.createdAt,
      handledBy: appointmentStatusHistory.handledBy,
      handlerName: users.name,
      handlerEmail: users.email,
      eventNote: appointmentStatusHistory.eventNote,
      previousScheduledFor: appointmentStatusHistory.previousScheduledFor,
      nextScheduledFor: appointmentStatusHistory.nextScheduledFor,
    })
    .from(appointmentStatusHistory)
    .leftJoin(users, eq(appointmentStatusHistory.handledBy, users.id))
    .where(eq(appointmentStatusHistory.appointmentId, appointmentId))
    .orderBy(appointmentStatusHistory.createdAt, appointmentStatusHistory.id);
}

export async function listAppointmentMessages(appointmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: appointmentMessages.id, appointmentId: appointmentMessages.appointmentId, senderId: appointmentMessages.senderId, senderName: users.name, senderRole: users.role, body: appointmentMessages.body, createdAt: appointmentMessages.createdAt })
    .from(appointmentMessages)
    .innerJoin(users, eq(appointmentMessages.senderId, users.id))
    .where(eq(appointmentMessages.appointmentId, appointmentId))
    .orderBy(appointmentMessages.createdAt, appointmentMessages.id);
}

export async function createAppointmentMessage(input: { appointmentId: number; senderId: number; body: string; senderIsOperator: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const now = new Date();
  const result = await db.insert(appointmentMessages).values({ appointmentId: input.appointmentId, senderId: input.senderId, body: input.body, operatorReadAt: input.senderIsOperator ? now : null, supplierReadAt: input.senderIsOperator ? null : now });
  return Number(result[0].insertId);
}

export async function markAppointmentMessagesRead(input: { appointmentId: number; userId: number; isOperator: boolean }) {
  const db = await getDb();
  if (!db) return;
  const unreadColumn = input.isOperator ? appointmentMessages.operatorReadAt : appointmentMessages.supplierReadAt;
  await db.update(appointmentMessages).set(input.isOperator ? { operatorReadAt: new Date() } : { supplierReadAt: new Date() }).where(and(eq(appointmentMessages.appointmentId, input.appointmentId), ne(appointmentMessages.senderId, input.userId), isNull(unreadColumn)));
}

export async function listUnreadAppointmentMessages(input: { userId: number; isOperator: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const unreadColumn = input.isOperator ? appointmentMessages.operatorReadAt : appointmentMessages.supplierReadAt;
  const scope = input.isOperator ? [] : [eq(appointments.supplierId, input.userId)];
  return db
    .select({ id: appointmentMessages.id, appointmentId: appointmentMessages.appointmentId, invoiceNumber: appointments.invoiceNumber, serviceType: appointments.serviceType, senderName: users.name, body: appointmentMessages.body, createdAt: appointmentMessages.createdAt })
    .from(appointmentMessages)
    .innerJoin(appointments, eq(appointmentMessages.appointmentId, appointments.id))
    .innerJoin(users, eq(appointmentMessages.senderId, users.id))
    .where(and(ne(appointmentMessages.senderId, input.userId), isNull(unreadColumn), ...scope))
    .orderBy(desc(appointmentMessages.createdAt))
    .limit(8);
}

/**
 * As notas de um período, para o calendário.
 *
 * Traz a nota inteira menos os itens: quem abre um dia no calendário quer
 * abrir a nota ali mesmo, e voltar ao banco por cada uma seria uma consulta
 * por clique. Os itens continuam de fora, que é o único campo pesado.
 */
export async function listAppointmentsBetween(start: Date, end: Date, status?: AppointmentStatus[]) {
  const db = await getDb();
  if (!db) return [];
  if (status && !status.length) return [];
  return db
    .select({
      id: appointments.id,
      supplierId: appointments.supplierId,
      supplierName: users.name,
      supplierEmail: users.email,
      supplierCnpj: users.companyCnpj,
      serviceType: appointments.serviceType,
      scheduledFor: appointments.scheduledFor,
      notes: appointments.notes,
      source: appointments.source,
      preNoteConfirmedAt: appointments.preNoteConfirmedAt,
      preNoteConfirmedBy: appointments.preNoteConfirmedBy,
      xmlUrl: appointments.xmlUrl,
      xmlFileName: appointments.xmlFileName,
      invoiceNumber: appointments.invoiceNumber,
      invoiceAccessKey: appointments.invoiceAccessKey,
      purchaseOrder: appointments.purchaseOrder,
      invoiceSupplierName: appointments.invoiceSupplierName,
      invoiceSupplierCnpj: appointments.invoiceSupplierCnpj,
      recipientCnpj: appointments.recipientCnpj,
      invoiceIssuedAt: appointments.invoiceIssuedAt,
      invoiceTotalCents: appointments.invoiceTotalCents,
      invoiceVolumeCount: appointments.invoiceVolumeCount,
      receivedAt: appointments.receivedAt,
      miroNumber: appointments.miroNumber,
      quotationNumber: appointments.quotationNumber,
      memorizedOrder: appointments.memorizedOrder,
      hisEntryDocument: appointments.hisEntryDocument,
      hisExitDocument: appointments.hisExitDocument,
      backlogReasonCode: appointments.backlogReasonCode,
      backlogReason: appointments.backlogReason,
      treatedAt: appointments.treatedAt,
      rejectionReason: appointments.rejectionReason,
      status: appointments.status,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(users, eq(appointments.supplierId, users.id))
    .where(and(gte(appointments.scheduledFor, start), lte(appointments.scheduledFor, end), ...(status ? [inArray(appointments.status, status)] : [])))
    .orderBy(appointments.scheduledFor);
}

export async function createAppointmentSuggestion(input: {
  appointmentId: number;
  supplierId: number;
  suggestedFor: Date;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.insert(appointmentSuggestions).values({ ...input, notes: input.notes || null, status: "pending" });
  return getSuggestionById(Number(result[0].insertId));
}

export async function getSuggestionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appointmentSuggestions).where(eq(appointmentSuggestions.id, id)).limit(1);
  return result[0];
}

export async function listAppointmentSuggestions(filters: { appointmentId?: number; supplierId?: number; supplierIds?: number[]; status?: SuggestionStatus } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.appointmentId) conditions.push(eq(appointmentSuggestions.appointmentId, filters.appointmentId));
  if (filters.supplierId) conditions.push(eq(appointmentSuggestions.supplierId, filters.supplierId));
  // Same rule as the appointment list: an empty scope means nothing, not everything.
  if (filters.supplierIds) {
    if (!filters.supplierIds.length) return [];
    conditions.push(inArray(appointmentSuggestions.supplierId, filters.supplierIds));
  }
  if (filters.status) conditions.push(eq(appointmentSuggestions.status, filters.status));
  const query = db
    .select({
      id: appointmentSuggestions.id,
      appointmentId: appointmentSuggestions.appointmentId,
      suggestedFor: appointmentSuggestions.suggestedFor,
      notes: appointmentSuggestions.notes,
      status: appointmentSuggestions.status,
      createdAt: appointmentSuggestions.createdAt,
      supplierName: users.name,
      supplierEmail: users.email,
      // `supplierId` guarda quem escreveu a sugestão, e agora nem sempre é um
      // fornecedor: o planejador também propõe datas. O perfil vai junto para
      // que a tela do Operador diga de quem veio o pedido.
      createdByRole: users.role,
      serviceType: appointments.serviceType,
      appointmentStatus: appointments.status,
    })
    .from(appointmentSuggestions)
    .innerJoin(appointments, eq(appointmentSuggestions.appointmentId, appointments.id))
    .innerJoin(users, eq(appointmentSuggestions.supplierId, users.id));
  const filtered = conditions.length ? query.where(and(...conditions)) : query;
  return filtered.orderBy(desc(appointmentSuggestions.createdAt));
}

export async function acceptAppointmentSuggestion(input: { suggestionId: number; appointmentStatus: AppointmentStatus; handledBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const suggestion = await getSuggestionById(input.suggestionId);
  if (!suggestion) return undefined;
  await db.transaction(async tx => {
    await tx.update(appointmentSuggestions).set({ status: "accepted", handledBy: input.handledBy, respondedAt: new Date() }).where(eq(appointmentSuggestions.id, input.suggestionId));
    await tx.update(appointments).set({ scheduledFor: suggestion.suggestedFor, status: "scheduled", handledBy: input.handledBy, updatedAt: new Date() }).where(eq(appointments.id, suggestion.appointmentId));
    await tx.insert(appointmentStatusHistory).values({ appointmentId: suggestion.appointmentId, previousStatus: input.appointmentStatus, nextStatus: "scheduled", handledBy: input.handledBy });
  });
  return getAppointmentById(suggestion.appointmentId);
}

export async function createAppointment(input: {
  supplierId: number;
  serviceType: string;
  scheduledFor: Date;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.transaction(async tx => {
    const inserted = await tx.insert(appointments).values({
      ...input,
      notes: input.notes || null,
      status: "pending",
    });
    const appointmentId = Number(inserted[0].insertId);
    await tx.insert(appointmentStatusHistory).values({
      appointmentId,
      previousStatus: null,
      nextStatus: "pending",
      handledBy: null,
    });
    return appointmentId;
  });
  return getAppointmentById(result);
}

export async function createManualXmlAppointment(input: {
  supplierId: number;
  xmlStorageKey: string;
  xmlUrl: string;
  xmlFileName: string;
  invoiceNumber: string | null;
  invoiceAccessKey: string | null;
  purchaseOrder: string | null;
  invoiceSupplierName: string | null;
  invoiceSupplierCnpj: string | null;
  recipientCnpj: string | null;
  invoiceIssuedAt: Date | null;
  serviceDescription: string | null;
  invoiceTotalCents: number | null;
  invoiceItemsJson: string | null;
  invoiceVolumeCount: number | null;
  suggestedFor?: Date;
  suggestionNotes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const result = await db.transaction(async tx => {
    const serviceType = input.serviceDescription || (input.invoiceNumber ? `Nota fiscal ${input.invoiceNumber}` : "Nota fiscal XML");
    const inserted = await tx.insert(appointments).values({
      supplierId: input.supplierId,
      serviceType: serviceType.slice(0, 80),
      scheduledFor: input.invoiceIssuedAt ?? new Date(),
      notes: "Agendamento manual gerado exclusivamente pelo XML da nota fiscal.",
      source: "manual_xml",
      xmlStorageKey: input.xmlStorageKey,
      xmlUrl: input.xmlUrl,
      xmlFileName: input.xmlFileName,
      invoiceNumber: input.invoiceNumber,
      invoiceAccessKey: input.invoiceAccessKey,
      purchaseOrder: input.purchaseOrder,
      invoiceSupplierName: input.invoiceSupplierName,
      invoiceSupplierCnpj: input.invoiceSupplierCnpj,
      recipientCnpj: input.recipientCnpj,
      invoiceIssuedAt: input.invoiceIssuedAt,
      invoiceTotalCents: input.invoiceTotalCents,
      invoiceItemsJson: input.invoiceItemsJson,
      invoiceVolumeCount: input.invoiceVolumeCount,
      status: "pending",
    });
    const appointmentId = Number(inserted[0].insertId);
    await tx.insert(appointmentStatusHistory).values({
      appointmentId,
      previousStatus: null,
      nextStatus: "pending",
      handledBy: null,
    });
    if (input.suggestedFor) {
      await tx.insert(appointmentSuggestions).values({
        appointmentId,
        supplierId: input.supplierId,
        suggestedFor: input.suggestedFor,
        notes: input.suggestionNotes?.trim() || null,
        status: "pending",
      });
    }
    return appointmentId;
  });
  return getAppointmentById(result);
}

export async function updateAppointmentStatus(input: {
  appointmentId: number;
  previousStatus: AppointmentStatus;
  status: Exclude<AppointmentStatus, "pending">;
  handledBy: number;
  rejectionReason?: string;
  eventNote?: string;
  /** Lançamento no SAP, informado ao concluir. */
  miroNumber?: string;
  /** Categoria do motivo, quando a nota vai para o backlog. */
  backlogReasonCode?: string;
  /** Descrição do que houve. Sem o rótulo do motivo: ele já vem no código. */
  backlogReason?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const receivedAt = getReceiptTimestampForStatus(input.status);
  await db.transaction(async tx => {
    await tx
      .update(appointments)
      .set({
        status: input.status,
        handledBy: input.handledBy,
        updatedAt: new Date(),
        ...(receivedAt ? { receivedAt } : {}),
        ...(input.status === "rejected" ? { rejectionReason: input.rejectionReason?.trim() || "Motivo não informado" } : {}),
        ...(input.miroNumber ? { miroNumber: input.miroNumber } : {}),
        // O motivo acompanha a nota até a tratativa; um backlog novo apaga o
        // motivo do backlog anterior, que já não descreve esta ida.
        ...(input.status === "backlog"
          ? { backlogReasonCode: input.backlogReasonCode ?? null, backlogReason: input.backlogReason?.slice(0, 500) ?? null }
          : {}),
      })
      .where(eq(appointments.id, input.appointmentId));
    await tx.insert(appointmentStatusHistory).values({
      appointmentId: input.appointmentId,
      previousStatus: input.previousStatus,
      nextStatus: input.status,
      handledBy: input.handledBy,
      eventNote: input.eventNote ?? null,
    });
  });
  return getAppointmentById(input.appointmentId);
}

/**
 * Devolve uma nota concluída ao começo da fila.
 *
 * É correção de erro humano: alguém concluiu a nota errada, ou lançou um MIRO
 * que não era dela. Voltar para "pendente" desfaz tudo o que a conclusão
 * afirmou — o recebimento, o MIRO e a pré-nota —, porque deixar qualquer um
 * deles seria a nota dizer que foi lançada no SAP enquanto espera agendamento.
 * O que ela tinha fica escrito no histórico, que é o que sobra para auditar.
 */
export async function reabrirComoPendente(input: {
  appointmentId: number;
  previousStatus: AppointmentStatus;
  handledBy: number;
  eventNote: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.transaction(async tx => {
    await tx
      .update(appointments)
      .set({
        status: "pending",
        receivedAt: null,
        miroNumber: null,
        preNoteConfirmedAt: null,
        preNoteConfirmedBy: null,
        handledBy: input.handledBy,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, input.appointmentId));
    await tx.insert(appointmentStatusHistory).values({
      appointmentId: input.appointmentId,
      previousStatus: input.previousStatus,
      nextStatus: "pending",
      handledBy: input.handledBy,
      eventNote: input.eventNote,
    });
  });
  return getAppointmentById(input.appointmentId);
}

export async function returnAppointmentForRescheduling(input: {
  appointmentId: number;
  previousStatus: "received" | "completed";
  previousScheduledFor: Date;
  handledBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.transaction(async tx => {
    await tx
      .update(appointments)
      .set({
        status: "scheduled",
        receivedAt: null,
        preNoteConfirmedAt: null,
        preNoteConfirmedBy: null,
        handledBy: input.handledBy,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, input.appointmentId));
    await tx.insert(appointmentStatusHistory).values({
      appointmentId: input.appointmentId,
      previousStatus: input.previousStatus,
      nextStatus: "scheduled",
      handledBy: input.handledBy,
      eventNote: "Status corrigido pelo administrador. Nota retornada para novo agendamento.",
      previousScheduledFor: input.previousScheduledFor,
      nextScheduledFor: input.previousScheduledFor,
    });
  });
  return getAppointmentById(input.appointmentId);
}

export async function confirmAppointmentPreNote(input: { appointmentId: number; status: AppointmentStatus; operatorId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.transaction(async tx => {
    await tx.update(appointments).set({ preNoteConfirmedAt: new Date(), preNoteConfirmedBy: input.operatorId, updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));
    await tx.insert(appointmentStatusHistory).values({ appointmentId: input.appointmentId, previousStatus: input.status, nextStatus: input.status, handledBy: input.operatorId, eventNote: "Pré-nota confirmada pelo operador." });
  });
  return getAppointmentById(input.appointmentId);
}

export async function scheduleAppointment(input: { appointmentId: number; previousStatus: AppointmentStatus; previousScheduledFor: Date; scheduledFor: Date; handledBy: number; rescheduled: boolean; acceptedSuggestionId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.transaction(async tx => {
    await tx.update(appointments).set({ status: "scheduled", scheduledFor: input.scheduledFor, handledBy: input.handledBy, updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));
    if (input.acceptedSuggestionId) {
      await tx.update(appointmentSuggestions).set({ status: "accepted", handledBy: input.handledBy, respondedAt: new Date() }).where(eq(appointmentSuggestions.id, input.acceptedSuggestionId));
    }
    await tx.insert(appointmentStatusHistory).values({ appointmentId: input.appointmentId, previousStatus: input.previousStatus, nextStatus: "scheduled", handledBy: input.handledBy, eventNote: input.rescheduled ? "Agendamento reagendado pelo operador." : "Agendamento confirmado pelo operador.", previousScheduledFor: input.previousScheduledFor, nextScheduledFor: input.scheduledFor });
  });
  return getAppointmentById(input.appointmentId);
}

export async function rescueAppointment(input: { appointmentId: number; handledBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.transaction(async tx => {
    await tx.update(appointments).set({ status: "pending", rejectionReason: null, handledBy: input.handledBy, updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));
    await tx.insert(appointmentStatusHistory).values({ appointmentId: input.appointmentId, previousStatus: "rejected", nextStatus: "pending", handledBy: input.handledBy, eventNote: "Item resgatado para novo tratamento." });
  });
  return getAppointmentById(input.appointmentId);
}

export async function listSupplierActiveAppointments(supplierId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: appointments.id, serviceType: appointments.serviceType, scheduledFor: appointments.scheduledFor, status: appointments.status }).from(appointments).where(and(eq(appointments.supplierId, supplierId), or(eq(appointments.status, "scheduled"), eq(appointments.status, "received")))).orderBy(appointments.scheduledFor);
}

export async function createUnscheduledReceipt(input: {
  operatorId: number;
  xmlStorageKey: string;
  xmlUrl: string;
  xmlFileName: string;
  invoiceNumber: string | null;
  invoiceAccessKey: string | null;
  purchaseOrder: string | null;
  invoiceSupplierName: string | null;
  invoiceSupplierCnpj: string | null;
  recipientCnpj: string | null;
  invoiceIssuedAt: Date | null;
  serviceDescription: string | null;
  invoiceTotalCents: number | null;
  invoiceItemsJson: string | null;
  invoiceVolumeCount: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const registeredAt = getUnscheduledReceiptRegisteredAt();
  const result = await db.transaction(async tx => {
    const serviceType = input.serviceDescription || (input.invoiceNumber ? `Recebimento NF ${input.invoiceNumber}` : "Recebimento avulso");
    const inserted = await tx.insert(appointments).values({
      supplierId: input.operatorId,
      serviceType: serviceType.slice(0, 80),
      scheduledFor: registeredAt,
      receivedAt: registeredAt,
      notes: "Recebimento registrado sem agendamento prévio, a partir do XML da nota fiscal.",
      source: "manual_xml",
      xmlStorageKey: input.xmlStorageKey,
      xmlUrl: input.xmlUrl,
      xmlFileName: input.xmlFileName,
      invoiceNumber: input.invoiceNumber,
      invoiceAccessKey: input.invoiceAccessKey,
      purchaseOrder: input.purchaseOrder,
      invoiceSupplierName: input.invoiceSupplierName,
      invoiceSupplierCnpj: input.invoiceSupplierCnpj,
      recipientCnpj: input.recipientCnpj,
      invoiceIssuedAt: input.invoiceIssuedAt,
      invoiceTotalCents: input.invoiceTotalCents,
      invoiceItemsJson: input.invoiceItemsJson,
      invoiceVolumeCount: input.invoiceVolumeCount,
      status: "received",
      handledBy: input.operatorId,
    });
    const appointmentId = Number(inserted[0].insertId);
    await tx.insert(appointmentStatusHistory).values({ appointmentId, previousStatus: null, nextStatus: "received", handledBy: input.operatorId, eventNote: "Recebimento registrado sem agendamento prévio." });
    return appointmentId;
  });
  return getAppointmentById(result);
}

export async function createPasswordResetToken(input: {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) return;
  // Any earlier link for this user stops working the moment a new one is asked
  // for, so a forwarded or intercepted older e-mail is worthless.
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, input.userId));
  await db.insert(passwordResetTokens).values({
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
  });
}

export async function getPasswordResetToken(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0];
}

export async function consumePasswordResetToken(input: {
  tokenId: number;
  userId: number;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async tx => {
    await tx
      .update(users)
      .set({ passwordHash: input.passwordHash })
      .where(eq(users.id, input.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, input.tokenId));
  });
}

export async function updateUserPassword(input: { userId: number; passwordHash: string }) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ passwordHash: input.passwordHash })
    .where(eq(users.id, input.userId));
}

export async function listApprovedCompanyUserIds(companyKey: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.companyCnpj, companyKey),
        eq(users.role, "supplier"),
        eq(users.accessStatus, "approved")
      )
    );
  return rows.map(row => row.id);
}

export async function listPendingAccessRequests() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      companyName: users.companyName,
      companyCnpj: users.companyCnpj,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.accessStatus, "pending"))
    .orderBy(desc(users.createdAt));
}

export async function setUserAccessStatus(input: { userId: number; accessStatus: UserAccessStatus }) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ accessStatus: input.accessStatus })
    .where(eq(users.id, input.userId));
}

/* ------------------------------------------------------------------ *
 * Portaria: chegada de caminhões, decisão de entrada e fluxo de pátio *
 * ------------------------------------------------------------------ */

type AttendanceFilters = {
  status?: AttendanceStatus;
  statuses?: AttendanceStatus[];
  serviceType?: AttendanceServiceType;
};

export async function listAttendances(filters: AttendanceFilters = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    filters.status ? eq(attendances.status, filters.status) : undefined,
    filters.statuses?.length ? inArray(attendances.status, filters.statuses) : undefined,
    filters.serviceType ? eq(attendances.serviceType, filters.serviceType) : undefined,
  ].filter(Boolean);

  return db
    .select()
    .from(attendances)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(attendances.arrivalAt));
}

/**
 * Tudo que chegou ao portão em um dia, do que ainda espera ao que já saiu.
 * É o registro que a Portaria e a operação de agendamentos consultam depois —
 * a fila de trabalho esvazia, este histórico não.
 *
 * O dia é o de São Paulo, não o do relógio do servidor: hospedado em UTC, o
 * "hoje" viraria às 21h no Brasil e o turno da noite desapareceria do registro
 * bem quando o porteiro ainda está trabalhando.
 */
export async function listAttendancesByDay(dateKey: string) {
  const db = await getDb();
  if (!db) return [];
  const range = getSaoPauloDayRange(dateKey);
  if (!range) return [];

  return db
    .select()
    .from(attendances)
    .where(and(gte(attendances.arrivalAt, range.start), lte(attendances.arrivalAt, range.end)))
    .orderBy(desc(attendances.arrivalAt));
}

export async function getAttendanceById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(attendances).where(eq(attendances.id, id)).limit(1);
  return result[0] ?? null;
}

export async function listAttendanceEvents(attendanceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: attendanceEvents.id,
      eventType: attendanceEvents.eventType,
      description: attendanceEvents.description,
      createdAt: attendanceEvents.createdAt,
      performedByName: users.name,
      performedByRole: users.role,
    })
    .from(attendanceEvents)
    .leftJoin(users, eq(users.id, attendanceEvents.performedById))
    .where(eq(attendanceEvents.attendanceId, attendanceId))
    .orderBy(desc(attendanceEvents.createdAt));
}

/**
 * A protocol has to be readable over the radio and unique across gates, so it
 * pairs the arrival date with a short random tail rather than the row id, which
 * only exists after the insert.
 */
const PROTOCOL_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I e O

function createAttendanceProtocol() {
  const now = new Date();
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(part => String(part).padStart(2, "0"))
    .join("")
    .slice(2);
  // O sufixo sorteia direto do alfabeto: passar nanoid por toUpperCase
  // juntaria "a" e "A" no mesmo símbolo e jogaria fora metade da entropia.
  const suffix = customAlphabet(PROTOCOL_ALPHABET, 8)();
  return `PRT-${day}-${suffix}`;
}

async function recordAttendanceEvent(input: {
  attendanceId: number;
  eventType: AttendanceEventType;
  description?: string;
  performedById: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(attendanceEvents).values(input);
}

export async function createAttendance(input: {
  driverName: string;
  driverDocument?: string;
  invoiceNumbers?: string[];
  licensePlate: string;
  supplierName?: string | null;
  serviceType: AttendanceServiceType;
  classification: AttendanceClassification;
  classificationDetail: AttendanceClassificationDetail;
  notes?: string;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const { invoiceNumbers, ...columns } = input;
  const [result] = await db.insert(attendances).values({
    ...columns,
    licensePlate: input.licensePlate.toUpperCase().replace(/\s/g, ""),
    driverDocument: input.driverDocument?.trim() || null,
    notes: input.notes?.trim() || null,
    invoiceNumbersJson: invoiceNumbers?.length ? JSON.stringify(invoiceNumbers) : null,
    protocol: createAttendanceProtocol(),
  });
  const attendanceId = Number((result as { insertId?: number }).insertId);
  if (!attendanceId) throw new Error("Não foi possível registrar a chegada.");

  const invoiceSummary = invoiceNumbers?.length ? ` Nota(s): ${invoiceNumbers.join(", ")}.` : "";
  await recordAttendanceEvent({
    attendanceId,
    eventType: "chegada_registrada",
    description: `Chegada registrada na Portaria e enviada para a Operação decidir o ${input.serviceType}.${invoiceSummary}`,
    performedById: input.createdById,
  });
  return getAttendanceById(attendanceId);
}

export async function decideAttendanceEntry(input: {
  attendanceId: number;
  decision: "aprovar" | "recusar";
  refusalReason?: string;
  decisionById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const approved = input.decision === "aprovar";

  await db
    .update(attendances)
    .set({
      status: approved ? "aprovado" : "recusado",
      decisionAt: new Date(),
      decisionById: input.decisionById,
      refusalReason: approved ? null : input.refusalReason?.trim() ?? null,
    })
    .where(eq(attendances.id, input.attendanceId));

  await recordAttendanceEvent({
    attendanceId: input.attendanceId,
    eventType: approved ? "entrada_aprovada" : "entrada_recusada",
    description: approved
      ? "Recebimento aceito pela Operação."
      : `Recebimento recusado pela Operação. Motivo: ${input.refusalReason?.trim()}`,
    performedById: input.decisionById,
  });
  return getAttendanceById(input.attendanceId);
}

export async function executeAttendanceAction(input: {
  attendanceId: number;
  action: "iniciar" | "liberar" | "concluir";
  operatedById: number;
  /** Doca de destino, informada pela Portaria ao abrir a entrada. Opcional. */
  dockNumber?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const now = new Date();
  const steps = {
    iniciar: {
      status: "em_atendimento" as const,
      eventType: "atendimento_iniciado" as const,
      // A doca vai na descrição do evento porque é assim que o histórico
      // responde depois para onde aquele caminhão foi mandado.
      description: input.dockNumber
        ? `Entrada liberada pela Portaria para a doca ${input.dockNumber}.`
        : "Entrada liberada pela Portaria, sem doca definida.",
      patch: input.dockNumber ? { enteredAt: now, dockNumber: input.dockNumber } : { enteredAt: now },
    },
    liberar: {
      status: "liberado" as const,
      eventType: "liberacao_registrada" as const,
      description: "Liberação registrada pela Operação.",
      patch: { releasedAt: now },
    },
    concluir: {
      status: "concluido" as const,
      eventType: "atendimento_concluido" as const,
      description: "Atendimento concluído pela Operação.",
      patch: { concludedAt: now },
    },
  };
  const step = steps[input.action];

  await db
    .update(attendances)
    .set({ status: step.status, operatedById: input.operatedById, ...step.patch })
    .where(eq(attendances.id, input.attendanceId));
  await recordAttendanceEvent({
    attendanceId: input.attendanceId,
    eventType: step.eventType,
    description: step.description,
    performedById: input.operatedById,
  });
  return getAttendanceById(input.attendanceId);
}

/** Contas internas cujo perfil de pátio o administrador pode reatribuir. */
export async function listStaffUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      accessStatus: users.accessStatus,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .where(ne(users.role, "supplier"))
    .orderBy(desc(users.lastSignedIn));
}

/**
 * As contas de fornecedor, que são a outra metade de quem entra no portal.
 *
 * Ficam separadas da equipe interna porque o que se faz com elas é outro: um
 * fornecedor não muda de perfil — ele é fornecedor —, o que se decide é se
 * entra ou não, e por qual CNPJ ele enxerga as notas.
 */
/**
 * A razão social de um CNPJ que o portal já conhece.
 *
 * Duas fontes, nesta ordem: uma conta de fornecedor já cadastrada com esse CNPJ
 * e, se não houver, o nome que veio nas notas dele — o acervo tem 132
 * fornecedores que nunca criaram login, e são justamente os que vão se
 * cadastrar. Só o nome sai daqui: é dado público da Receita, e nada além disso
 * ajudaria quem estivesse pescando.
 */
export async function razaoSocialConhecida(cnpj: string): Promise<string | null> {
  const db = await getDb();
  const digitos = normalizeCnpj(cnpj);
  if (!db || digitos.length !== 14) return null;

  const daConta = await db
    .select({ nome: users.companyName })
    .from(users)
    .where(and(eq(users.companyCnpj, digitos), isNotNull(users.companyName)))
    .limit(1);
  if (daConta[0]?.nome) return daConta[0].nome;

  const daNota = await db
    .select({ nome: appointments.invoiceSupplierName })
    .from(appointments)
    .where(and(eq(appointments.invoiceSupplierCnpj, digitos), isNotNull(appointments.invoiceSupplierName)))
    .orderBy(desc(appointments.createdAt))
    .limit(1);
  return daNota[0]?.nome ?? null;
}

export async function listSupplierAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      companyName: users.companyName,
      companyCnpj: users.companyCnpj,
      companyId: users.companyId,
      accessStatus: users.accessStatus,
      lastSignedIn: users.lastSignedIn,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, "supplier"))
    .orderBy(desc(users.lastSignedIn));
}

export async function setUserRole(input: { userId: number; role: UserRole }) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
}

/**
 * Quantos administradores ainda conseguem entrar. É o número que impede o
 * sistema de ficar sem dono: bloquear ou rebaixar o último administrador
 * fecharia a porta por fora, e a única volta seria mexer direto no banco.
 */
export async function countActiveAdmins(exceptUserId?: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.accessStatus, "approved")));
  return rows.filter(row => row.id !== exceptUserId).length;
}

export async function updateUserName(input: { userId: number; name: string }) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ name: input.name }).where(eq(users.id, input.userId));
}

/**
 * Remove um protocolo do portão. Os eventos do histórico saem junto, por
 * cascade — o registro não sobrevive ao atendimento que o originou.
 */
export async function deleteAttendanceById(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(attendances).where(eq(attendances.id, id));
}

/**
 * O histórico do portão por período. As bordas são as do dia de São Paulo, e
 * não as do relógio do servidor: um caminhão que chegou às 22h pertence ao dia
 * em que o porteiro o registrou.
 */
export async function listAttendancesInRange(fromDateKey: string, toDateKey: string) {
  const db = await getDb();
  if (!db) return [];
  const from = getSaoPauloDayRange(fromDateKey);
  const to = getSaoPauloDayRange(toDateKey);
  // Uma data inválida não pode virar um período aberto que devolve o banco
  // inteiro: sem as duas bordas, não há consulta.
  if (!from || !to) return [];
  return db
    .select()
    .from(attendances)
    .where(and(gte(attendances.arrivalAt, from.start), lte(attendances.arrivalAt, to.end)))
    .orderBy(desc(attendances.arrivalAt));
}

/**
 * Fecha um backlog com a tratativa feita no SAP e no HIS.
 *
 * A nota sai para "concluída" pelo mesmo caminho de sempre — com registro no
 * histórico —, e o que foi feito fica gravado na própria nota. Sem isso, o
 * backlog sumia da tela sem deixar rastro de como foi resolvido.
 */
export async function treatBacklogAppointment(input: {
  appointmentId: number;
  previousStatus: AppointmentStatus;
  handledBy: number;
  eventNote: string;
  miroNumber: string;
  quotationNumber: string | null;
  memorizedOrder: string | null;
  hisEntryDocument: string | null;
  hisExitDocument: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const agora = new Date();
  await db.transaction(async tx => {
    await tx
      .update(appointments)
      .set({
        status: "completed",
        miroNumber: input.miroNumber,
        quotationNumber: input.quotationNumber,
        memorizedOrder: input.memorizedOrder,
        hisEntryDocument: input.hisEntryDocument,
        hisExitDocument: input.hisExitDocument,
        treatedAt: agora,
        treatedById: input.handledBy,
        handledBy: input.handledBy,
        updatedAt: agora,
      })
      .where(eq(appointments.id, input.appointmentId));
    await tx.insert(appointmentStatusHistory).values({
      appointmentId: input.appointmentId,
      previousStatus: input.previousStatus,
      nextStatus: "completed",
      handledBy: input.handledBy,
      eventNote: input.eventNote,
    });
  });
  return getAppointmentById(input.appointmentId);
}

export async function listAppointmentInternalNotes(appointmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: appointmentInternalNotes.id,
      body: appointmentInternalNotes.body,
      createdAt: appointmentInternalNotes.createdAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(appointmentInternalNotes)
    .leftJoin(users, eq(appointmentInternalNotes.authorId, users.id))
    .where(eq(appointmentInternalNotes.appointmentId, appointmentId))
    .orderBy(appointmentInternalNotes.createdAt);
}

export async function createAppointmentInternalNote(input: { appointmentId: number; authorId: number; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const result = await db.insert(appointmentInternalNotes).values(input);
  return Number(result[0].insertId);
}

/**
 * Uma linha por nota que já passou pelo backlog.
 *
 * As datas de entrada e de saída não existem em coluna nenhuma: são deduzidas
 * do histórico de status, que é onde toda mudança fica registrada. Quando uma
 * nota entra em backlog mais de uma vez, vale a última passagem — é a que
 * responde "e essa nota, como está?".
 */
export async function listBacklogReportRows() {
  const db = await getDb();
  if (!db) return [];

  const eventos = await db
    .select({
      appointmentId: appointmentStatusHistory.appointmentId,
      previousStatus: appointmentStatusHistory.previousStatus,
      nextStatus: appointmentStatusHistory.nextStatus,
      createdAt: appointmentStatusHistory.createdAt,
    })
    .from(appointmentStatusHistory)
    .where(or(eq(appointmentStatusHistory.nextStatus, "backlog"), eq(appointmentStatusHistory.previousStatus, "backlog")))
    .orderBy(appointmentStatusHistory.createdAt);

  const ids = Array.from(new Set(eventos.map(evento => evento.appointmentId)));
  if (!ids.length) return [];

  const [notas, observacoes] = await Promise.all([
    db
      .select({
        id: appointments.id,
        createdAt: appointments.createdAt,
        status: appointments.status,
        invoiceNumber: appointments.invoiceNumber,
        invoiceSupplierName: appointments.invoiceSupplierName,
        // O remetente da nota vem antes do CNPJ do login, que pode ser de quem
        // só opera o portal — ou o zerado das contas de teste.
        invoiceSupplierCnpj: appointments.invoiceSupplierCnpj,
        supplierName: users.name,
        supplierCnpj: appointments.invoiceSupplierCnpj,
        loginCnpj: users.companyCnpj,
        miroNumber: appointments.miroNumber,
        backlogReasonCode: appointments.backlogReasonCode,
        backlogReason: appointments.backlogReason,
      })
      .from(appointments)
      .innerJoin(users, eq(appointments.supplierId, users.id))
      .where(inArray(appointments.id, ids)),
    db
      .select({
        appointmentId: appointmentInternalNotes.appointmentId,
        body: appointmentInternalNotes.body,
        createdAt: appointmentInternalNotes.createdAt,
        authorName: users.name,
      })
      .from(appointmentInternalNotes)
      .leftJoin(users, eq(appointmentInternalNotes.authorId, users.id))
      .where(inArray(appointmentInternalNotes.appointmentId, ids))
      .orderBy(appointmentInternalNotes.createdAt),
  ]);

  return notas.map(nota => {
    const doNota = eventos.filter(evento => evento.appointmentId === nota.id);
    const entradas = doNota.filter(evento => evento.nextStatus === "backlog");
    const ultimaEntrada = entradas.length ? entradas[entradas.length - 1] : null;
    // A saída é a primeira mudança que tira a nota do backlog depois da última
    // entrada. Sem isso, uma nota que foi e voltou mostraria a saída antiga.
    const saida = ultimaEntrada
      ? doNota.find(evento => evento.previousStatus === "backlog" && evento.createdAt >= ultimaEntrada.createdAt) ?? null
      : null;
    return {
      ...nota,
      enteredBacklogAt: ultimaEntrada?.createdAt ?? null,
      leftBacklogAt: saida?.createdAt ?? null,
      comments: observacoes
        .filter(observacao => observacao.appointmentId === nota.id)
        .map(observacao => ({ authorName: observacao.authorName, body: observacao.body, createdAt: observacao.createdAt })),
    };
  });
}

/**
 * Quantas notas existem, por situação.
 *
 * Serve à conferência do administrador: depois de um deploy ou de uma
 * importação, é o número que diz se o que entrou está mesmo lá.
 */
export async function contarAgendamentos() {
  const db = await getDb();
  if (!db) return null;
  const linhas = await db.select({ status: appointments.status, total: count() }).from(appointments).groupBy(appointments.status);
  const porStatus: Record<string, number> = {};
  let total = 0;
  for (const linha of linhas) {
    porStatus[linha.status] = Number(linha.total);
    total += Number(linha.total);
  }
  return { total, porStatus };
}

/**
 * As notas do relatório: só as colunas que ele mostra, já filtradas no banco.
 *
 * A tela baixava a tabela inteira e filtrava no navegador. Com o acervo dentro
 * do sistema isso virou treze megabytes por abertura. Aqui o banco filtra e
 * devolve quinze campos curtos; o total diz quantas ficaram fora do teto.
 */
export async function listReportRows(filtros: {
  scheduledStart?: string;
  scheduledEnd?: string;
  receivedStart?: string;
  receivedEnd?: string;
  status?: AppointmentStatus;
  supplier?: string;
  recipientCnpj?: string;
  /** Uma escolha de grupo vira vários CNPJs; qualquer um deles serve. */
  recipientCnpjs?: string[];
  limite: number;
}) {
  const db = await getDb();
  if (!db) return { linhas: [], total: 0 };

  const condicoes = [];
  if (filtros.status) condicoes.push(eq(appointments.status, filtros.status));
  const inicioAgenda = getSaoPauloDayRange(filtros.scheduledStart ?? "");
  const fimAgenda = getSaoPauloDayRange(filtros.scheduledEnd ?? "");
  if (inicioAgenda) condicoes.push(gte(appointments.scheduledFor, inicioAgenda.start));
  if (fimAgenda) condicoes.push(lte(appointments.scheduledFor, fimAgenda.end));
  const inicioRecebimento = getSaoPauloDayRange(filtros.receivedStart ?? "");
  const fimRecebimento = getSaoPauloDayRange(filtros.receivedEnd ?? "");
  if (inicioRecebimento) condicoes.push(gte(appointments.receivedAt, inicioRecebimento.start));
  if (fimRecebimento) condicoes.push(lte(appointments.receivedAt, fimRecebimento.end));
  const cnpjsDoFiltro = filtros.recipientCnpjs?.map(normalizeCnpj).filter(Boolean) ?? [];
  if (cnpjsDoFiltro.length) condicoes.push(or(...cnpjsDoFiltro.map(cnpj => like(appointments.recipientCnpj, `%${cnpj}%`))));
  else if (filtros.recipientCnpj) condicoes.push(like(appointments.recipientCnpj, `%${normalizeCnpj(filtros.recipientCnpj)}%`));
  if (filtros.supplier) {
    // O campo promete "nome ou CNPJ": o texto vai contra os dois nomes, e os
    // dígitos contra os dois CNPJs.
    const texto = `%${filtros.supplier.trim()}%`;
    const digitos = normalizeCnpj(filtros.supplier);
    const alternativas = [like(users.name, texto), like(appointments.invoiceSupplierName, texto)];
    if (digitos) alternativas.push(like(appointments.invoiceSupplierCnpj, `%${digitos}%`), like(users.companyCnpj, `%${digitos}%`));
    condicoes.push(or(...alternativas));
  }

  const onde = condicoes.length ? and(...condicoes) : undefined;
  const colunas = {
    id: appointments.id,
    createdAt: appointments.createdAt,
    // Quando o status mudou pela última vez — a coluna "Data do Último Status".
    updatedAt: appointments.updatedAt,
    // Quantas linhas a nota tem. Contado no banco: trazer o JSON dos itens só
    // para medir o tamanho dele custaria 39% do peso da resposta.
    totalDeLinhas: sql<number>`COALESCE(JSON_LENGTH(${appointments.invoiceItemsJson}), 0)`,
    invoiceNumber: appointments.invoiceNumber,
    supplierName: users.name,
    invoiceSupplierName: appointments.invoiceSupplierName,
    invoiceSupplierCnpj: appointments.invoiceSupplierCnpj,
    supplierCnpj: users.companyCnpj,
    recipientCnpj: appointments.recipientCnpj,
    purchaseOrder: appointments.purchaseOrder,
    miroNumber: appointments.miroNumber,
    invoiceVolumeCount: appointments.invoiceVolumeCount,
    invoiceTotalCents: appointments.invoiceTotalCents,
    serviceType: appointments.serviceType,
    status: appointments.status,
    scheduledFor: appointments.scheduledFor,
    receivedAt: appointments.receivedAt,
    // A nota recusada aparece no relatório como qualquer outra; sem o motivo,
    // a linha diria "recusada" e não diria por quê.
    rejectionReason: appointments.rejectionReason,
  };

  const base = db.select(colunas).from(appointments).innerJoin(users, eq(appointments.supplierId, users.id));
  const contagem = db.select({ total: count() }).from(appointments).innerJoin(users, eq(appointments.supplierId, users.id));
  const [linhas, totais] = await Promise.all([
    (onde ? base.where(onde) : base).orderBy(desc(appointments.scheduledFor)).limit(filtros.limite),
    onde ? contagem.where(onde) : contagem,
  ]);
  return { linhas, total: Number(totais[0]?.total ?? 0) };
}

/**
 * A nota de serviço: entra sem XML, registrada pela operação.
 *
 * Serviço não emite nota com XML de produto — vem um PDF, às vezes nem isso —,
 * e mesmo assim precisa de agendamento, de pedido de compra e de recebimento
 * como qualquer outra. Fica na mesma tabela das demais, com a origem marcada,
 * para aparecer na mesma agenda e no mesmo relatório.
 */
export async function createServiceNoteAppointment(input: {
  supplierId: number;
  invoiceNumber: string;
  recipientCnpj: string;
  scheduledFor: Date;
  purchaseOrder: string;
  documentStorageKey: string | null;
  documentUrl: string | null;
  documentFileName: string | null;
  createdById: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const fornecedor = await getUserById(input.supplierId);
  if (!fornecedor) throw new Error("Fornecedor não encontrado.");

  const resultado = await db.transaction(async tx => {
    const inserido = await tx.insert(appointments).values({
      supplierId: input.supplierId,
      serviceType: `Nota de serviço ${input.invoiceNumber}`.slice(0, 80),
      scheduledFor: input.scheduledFor,
      notes: "Nota de serviço registrada pela operação, sem XML.",
      source: "servico",
      invoiceNumber: input.invoiceNumber,
      purchaseOrder: input.purchaseOrder,
      invoiceSupplierName: fornecedor.companyName ?? fornecedor.name,
      // O CNPJ vem do cadastro do fornecedor: é o que a tela promete ao dizer
      // "o CNPJ é puxado do cadastro".
      invoiceSupplierCnpj: fornecedor.companyCnpj,
      recipientCnpj: input.recipientCnpj,
      xmlStorageKey: input.documentStorageKey,
      xmlUrl: input.documentUrl,
      xmlFileName: input.documentFileName,
      status: "scheduled",
      handledBy: input.createdById,
    });
    const appointmentId = Number(inserido[0].insertId);
    await tx.insert(appointmentStatusHistory).values([
      { appointmentId, previousStatus: null, nextStatus: "pending", handledBy: input.createdById, eventNote: "Nota de serviço registrada pela operação." },
      { appointmentId, previousStatus: "pending", nextStatus: "scheduled", handledBy: input.createdById, eventNote: "Data combinada no registro da nota de serviço.", nextScheduledFor: input.scheduledFor },
    ]);
    return appointmentId;
  });
  return getAppointmentById(resultado);
}

/**
 * Fornecedores aprovados, para a operação escolher ao registrar uma nota.
 *
 * Só o que a escolha precisa: quem é e qual o CNPJ. Uma nota de serviço é
 * pendurada numa empresa que já existe no portal, e não num nome digitado à
 * mão — do contrário a mesma empresa apareceria com três grafias no relatório.
 */
export async function listSupplierOptions() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id, name: users.name, companyName: users.companyName, companyCnpj: users.companyCnpj })
    .from(users)
    .where(and(eq(users.role, "supplier"), eq(users.accessStatus, "approved")))
    .orderBy(users.companyName);
}

// ---------------------------------------------------------------------------
// Empresas: o guarda-chuva sobre os CNPJs de um mesmo fornecedor
// ---------------------------------------------------------------------------

/**
 * Um CNPJ que aparece no portal, com quem o usa e quanto ele movimenta.
 *
 * A lista é montada a partir das contas de fornecedor, e não das notas: é a
 * conta que se agrupa numa empresa. O total de notas vem junto porque é por ele
 * que se reconhece o CNPJ que importa no meio de uma lista longa.
 */
export async function listarCnpjsDeFornecedores() {
  const db = await getDb();
  if (!db) return [];
  const linhas = await db
    .select({
      companyCnpj: users.companyCnpj,
      companyName: sql<string | null>`MIN(${users.companyName})`,
      empresaId: sql<number | null>`MIN(${users.companyId})`,
      contas: count(users.id),
    })
    .from(users)
    .where(and(eq(users.role, "supplier"), isNotNull(users.companyCnpj), ne(users.companyCnpj, "")))
    .groupBy(users.companyCnpj)
    .orderBy(asc(sql`MIN(${users.companyName})`));

  // As notas são contadas por CNPJ do emitente, que é o que a operação enxerga
  // na tabela — e não pelo dono do login, que pode ser uma transportadora.
  const notas = await db
    .select({ cnpj: appointments.invoiceSupplierCnpj, total: count() })
    .from(appointments)
    .where(isNotNull(appointments.invoiceSupplierCnpj))
    .groupBy(appointments.invoiceSupplierCnpj);
  const porCnpj = new Map(notas.map(linha => [normalizeCnpj(linha.cnpj ?? ""), Number(linha.total)]));

  return linhas.map(linha => ({
    cnpj: linha.companyCnpj ?? "",
    nome: linha.companyName,
    empresaId: linha.empresaId,
    contas: Number(linha.contas),
    notas: porCnpj.get(normalizeCnpj(linha.companyCnpj ?? "")) ?? 0,
  }));
}

export async function listarEmpresas() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: companies.id, nome: companies.name, criadaEm: companies.createdAt }).from(companies).orderBy(asc(companies.name));
}

export async function criarEmpresa(nome: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const inserido = await db.insert(companies).values({ name: nome });
  return { id: Number(inserido[0].insertId), nome };
}

/** Membros de uma empresa: todas as contas de fornecedor ligadas a ela. */
export async function listarMembrosDaEmpresa(empresaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id, nome: users.name, email: users.email, cnpj: users.companyCnpj, razaoSocial: users.companyName, acesso: users.accessStatus })
    .from(users)
    .where(eq(users.companyId, empresaId))
    .orderBy(asc(users.name));
}

/**
 * Liga (ou desliga) um CNPJ inteiro a uma empresa.
 *
 * O agrupamento é por CNPJ, e não por conta: quem cadastra uma conta nova com um
 * CNPJ já agrupado entra na empresa junto, sem ninguém precisar lembrar de
 * arrastá-la para lá depois.
 */
export async function agruparCnpj(cnpj: string, empresaId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const digitos = normalizeCnpj(cnpj);
  if (!digitos) throw new Error("Informe um CNPJ válido.");
  await db.update(users).set({ companyId: empresaId, updatedAt: new Date() }).where(and(eq(users.role, "supplier"), eq(users.companyCnpj, digitos)));
}

/** As contas aprovadas de uma empresa — o alcance de quem pertence a ela. */
export async function listarIdsDaEmpresa(empresaId: number) {
  const db = await getDb();
  if (!db) return [];
  const linhas = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.companyId, empresaId), eq(users.role, "supplier"), eq(users.accessStatus, "approved")));
  return linhas.map(linha => linha.id);
}

// ---------------------------------------------------------------------------
// Pedidos de compra, lidos do relatório do SAP
// ---------------------------------------------------------------------------

export type ItemDePedidoGravavel = {
  purchaseOrder: string;
  item: string;
  sapCode: string | null;
  description: string | null;
  recipientCnpj: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  orderedQuantity: string | null;
  pendingQuantity: string | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  documentDate: Date | null;
};

/**
 * Grava a foto do relatório sem perder o que saiu dele.
 *
 * O arquivo lista os pedidos em aberto: um item entregue por completo deixa de
 * aparecer. Apagar a linha junto levaria o código SAP embora, e quem precisa
 * dele é justamente a nota atrasada, que chega depois. Por isso o que sumiu é
 * marcado com a data em que sumiu — sai da conferência de saldo, fica no
 * cadastro.
 */
export async function gravarPedidosDoSap(itens: ItemDePedidoGravavel[], opcoes: { lote?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  // Sem os milissegundos de propósito: a coluna é TIMESTAMP, que guarda só o
  // segundo. Com a hora "quebrada", a própria linha recém-gravada ficava mais
  // antiga que este instante e era marcada como ausente no mesmo comando.
  const agora = new Date(Math.floor(Date.now() / 1000) * 1000);
  const lote = opcoes.lote ?? 500;
  let gravados = 0;

  for (let inicio = 0; inicio < itens.length; inicio += lote) {
    const parte = itens.slice(inicio, inicio + lote);
    if (!parte.length) continue;
    await db
      .insert(purchaseOrderItems)
      .values(parte.map(item => ({ ...item, updatedAt: agora, missingSince: null })))
      .onDuplicateKeyUpdate({
        set: {
          sapCode: sql`VALUES(${purchaseOrderItems.sapCode})`,
          description: sql`VALUES(${purchaseOrderItems.description})`,
          recipientCnpj: sql`VALUES(${purchaseOrderItems.recipientCnpj})`,
          supplierCode: sql`VALUES(${purchaseOrderItems.supplierCode})`,
          supplierName: sql`VALUES(${purchaseOrderItems.supplierName})`,
          orderedQuantity: sql`VALUES(${purchaseOrderItems.orderedQuantity})`,
          pendingQuantity: sql`VALUES(${purchaseOrderItems.pendingQuantity})`,
          unitPriceCents: sql`VALUES(${purchaseOrderItems.unitPriceCents})`,
          totalCents: sql`VALUES(${purchaseOrderItems.totalCents})`,
          documentDate: sql`VALUES(${purchaseOrderItems.documentDate})`,
          updatedAt: agora,
          // Voltou a aparecer: deixa de estar ausente.
          missingSince: null,
        },
      });
    gravados += parte.length;
  }

  // O que não veio neste arquivo saiu do relatório de pendências. A data só é
  // marcada na primeira vez: ela responde "sumiu quando?", não "continua
  // sumido desde ontem".
  const ausentes = await db
    .update(purchaseOrderItems)
    .set({ missingSince: agora })
    .where(and(lt(purchaseOrderItems.updatedAt, agora), isNull(purchaseOrderItems.missingSince)));

  return { gravados, marcadosComoAusentes: Number(ausentes[0]?.affectedRows ?? 0) };
}

/** Os itens que um pedido esperava — a conferência da nota é contra isto. */
export async function itensDoPedido(pedidos: string[]) {
  const db = await getDb();
  if (!db || !pedidos.length) return [];
  return db
    .select()
    .from(purchaseOrderItems)
    .where(inArray(purchaseOrderItems.purchaseOrder, pedidos))
    // O item é texto no SAP ("10", "100"), e em ordem de texto o 100 vem antes
    // do 20. Ordenado como número, a lista sai na sequência do pedido.
    .orderBy(asc(purchaseOrderItems.purchaseOrder), sql`CAST(${purchaseOrderItems.item} AS UNSIGNED)`);
}

/** Quantos itens de pedido existem e quando o relatório foi lido pela última vez. */
export async function situacaoDosPedidos() {
  const db = await getDb();
  if (!db) return { itens: 0, pedidos: 0, emAberto: 0, atualizadoEm: null as Date | null };
  const linhas = await db
    .select({
      itens: count(),
      pedidos: sql<number>`COUNT(DISTINCT ${purchaseOrderItems.purchaseOrder})`,
      emAberto: sql<number>`SUM(CASE WHEN ${purchaseOrderItems.missingSince} IS NULL THEN 1 ELSE 0 END)`,
      atualizadoEm: sql<Date | null>`MAX(${purchaseOrderItems.updatedAt})`,
    })
    .from(purchaseOrderItems);
  const linha = linhas[0];
  return {
    itens: Number(linha?.itens ?? 0),
    pedidos: Number(linha?.pedidos ?? 0),
    emAberto: Number(linha?.emAberto ?? 0),
    atualizadoEm: linha?.atualizadoEm ? new Date(linha.atualizadoEm) : null,
  };
}
