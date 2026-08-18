import {
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const userRoles = ["admin", "operator", "supplier"] as const;
export const appointmentStatuses = ["pending", "approved", "rejected", "completed"] as const;

export type UserRole = (typeof userRoles)[number];
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    role: mysqlEnum("role", userRoles).default("supplier").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [uniqueIndex("users_email_unique").on(table.email)]
);

export const appointments = mysqlTable(
  "appointments",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplierId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceType: varchar("serviceType", { length: 80 }).notNull(),
    scheduledFor: datetime("scheduledFor", { mode: "date" }).notNull(),
    notes: text("notes"),
    status: mysqlEnum("status", appointmentStatuses).default("pending").notNull(),
    handledBy: int("handledBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("appointments_supplier_status_idx").on(table.supplierId, table.status),
    index("appointments_schedule_idx").on(table.scheduledFor),
  ]
);

export const appointmentStatusHistory = mysqlTable(
  "appointmentStatusHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    appointmentId: int("appointmentId")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    previousStatus: mysqlEnum("previousStatus", appointmentStatuses),
    nextStatus: mysqlEnum("nextStatus", appointmentStatuses).notNull(),
    handledBy: int("handledBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("appointment_status_history_idx").on(table.appointmentId, table.createdAt)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;
export type AppointmentStatusHistory = typeof appointmentStatusHistory.$inferSelect;
