import { and, desc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  appointments,
  appointmentStatusHistory,
  type AppointmentStatus,
  type InsertUser,
  type UserRole,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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

export async function createLocalUser(input: {
  email: string;
  role: Exclude<UserRole, "admin">;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const values: InsertUser = {
    openId: `rvd-${nanoid(18)}`,
    email: input.email,
    name: input.email.split("@")[0],
    loginMethod: "rvd-password",
    passwordHash: input.passwordHash,
    role: input.role,
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
  supplierId?: number;
  status?: AppointmentStatus;
  date?: string;
};

export async function listAppointments(filters: AppointmentFilters = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.supplierId) conditions.push(eq(appointments.supplierId, filters.supplierId));
  if (filters.status) conditions.push(eq(appointments.status, filters.status));
  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00`);
    const end = new Date(`${filters.date}T23:59:59.999`);
    conditions.push(gte(appointments.scheduledFor, start), lte(appointments.scheduledFor, end));
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
      status: appointments.status,
      createdAt: appointments.createdAt,
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
    })
    .from(appointmentStatusHistory)
    .leftJoin(users, eq(appointmentStatusHistory.handledBy, users.id))
    .where(eq(appointmentStatusHistory.appointmentId, appointmentId))
    .orderBy(appointmentStatusHistory.createdAt, appointmentStatusHistory.id);
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

export async function updateAppointmentStatus(input: {
  appointmentId: number;
  previousStatus: AppointmentStatus;
  status: Exclude<AppointmentStatus, "pending">;
  handledBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.transaction(async tx => {
    await tx
      .update(appointments)
      .set({ status: input.status, handledBy: input.handledBy, updatedAt: new Date() })
      .where(eq(appointments.id, input.appointmentId));
    await tx.insert(appointmentStatusHistory).values({
      appointmentId: input.appointmentId,
      previousStatus: input.previousStatus,
      nextStatus: input.status,
      handledBy: input.handledBy,
    });
  });
  return getAppointmentById(input.appointmentId);
}
