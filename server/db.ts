import { and, desc, eq, gte, inArray, isNull, like, lte, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { customAlphabet, nanoid } from "nanoid";
import {
  appointments,
  appointmentMessages,
  appointmentStatusHistory,
  appointmentSuggestions,
  attendanceEvents,
  attendances,
  passwordResetTokens,
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
  /** Owners whose appointments the caller may see; empty means no access. */
  supplierIds?: number[];
  supplierId?: number;
  status?: AppointmentStatus;
  date?: string;
  invoiceNumber?: string;
  supplierName?: string;
  recipientCnpj?: string;
};

export async function listAppointments(filters: AppointmentFilters = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.supplierId) conditions.push(eq(appointments.supplierId, filters.supplierId));
  // An empty list is "sees nothing", not "sees everything": inArray with no
  // values would drop the condition and expose every supplier's records.
  if (filters.supplierIds) {
    if (!filters.supplierIds.length) return [];
    conditions.push(inArray(appointments.supplierId, filters.supplierIds));
  }
  if (filters.status) conditions.push(eq(appointments.status, filters.status));
  if (filters.invoiceNumber) conditions.push(like(appointments.invoiceNumber, `%${filters.invoiceNumber.trim()}%`));
  if (filters.supplierName) {
    const supplierName = `%${filters.supplierName.trim()}%`;
    conditions.push(or(like(users.name, supplierName), like(appointments.invoiceSupplierName, supplierName)));
  }
  if (filters.recipientCnpj) conditions.push(like(appointments.recipientCnpj, `%${normalizeCnpj(filters.recipientCnpj)}%`));
  if (filters.date) {
    const range = getSaoPauloDayRange(filters.date);
    if (range) conditions.push(gte(appointments.scheduledFor, range.start), lte(appointments.scheduledFor, range.end));
  }

  const query = db
    .select({
      id: appointments.id,
      supplierId: appointments.supplierId,
      supplierName: users.name,
      supplierEmail: users.email,
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
      recipientCnpj: appointments.recipientCnpj,
      invoiceIssuedAt: appointments.invoiceIssuedAt,
      invoiceTotalCents: appointments.invoiceTotalCents,
      invoiceItemsJson: appointments.invoiceItemsJson,
      invoiceVolumeCount: appointments.invoiceVolumeCount,
      receivedAt: appointments.receivedAt,
      miroNumber: appointments.miroNumber,
      rejectionReason: appointments.rejectionReason,
      status: appointments.status,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(users, eq(appointments.supplierId, users.id));

  const filtered = conditions.length ? query.where(and(...conditions)) : query;
  return filtered.orderBy(desc(appointments.scheduledFor));
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

export async function listAppointmentsBetween(start: Date, end: Date) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: appointments.id,
      supplierId: appointments.supplierId,
      supplierName: users.name,
      supplierEmail: users.email,
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
      recipientCnpj: appointments.recipientCnpj,
      invoiceIssuedAt: appointments.invoiceIssuedAt,
      rejectionReason: appointments.rejectionReason,
      status: appointments.status,
      createdAt: appointments.createdAt,
    })
    .from(appointments)
    .innerJoin(users, eq(appointments.supplierId, users.id))
    .where(and(gte(appointments.scheduledFor, start), lte(appointments.scheduledFor, end)))
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
