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
export const appointmentStatuses = ["pending", "scheduled", "received", "completed", "backlog", "rejected"] as const;
export const appointmentSources = ["portal", "manual_xml"] as const;
export const suggestionStatuses = ["pending", "accepted", "declined"] as const;

export type UserRole = (typeof userRoles)[number];
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export type AppointmentSource = (typeof appointmentSources)[number];
export type SuggestionStatus = (typeof suggestionStatuses)[number];

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    companyName: varchar("companyName", { length: 255 }),
    companyCnpj: varchar("companyCnpj", { length: 20 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    role: mysqlEnum("role", userRoles).default("supplier").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [uniqueIndex("users_email_unique").on(table.email), uniqueIndex("users_company_cnpj_unique").on(table.companyCnpj)]
);

export const passwordResetTokens = mysqlTable(
  "passwordResetTokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
    expiresAt: datetime("expiresAt", { mode: "date" }).notNull(),
    usedAt: datetime("usedAt", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("password_reset_tokens_user_idx").on(table.userId), index("password_reset_tokens_expiry_idx").on(table.expiresAt)]
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
    rejectionReason: text("rejectionReason"),
    source: mysqlEnum("source", appointmentSources).default("portal").notNull(),
    preNoteConfirmedAt: datetime("preNoteConfirmedAt", { mode: "date" }),
    preNoteConfirmedBy: int("preNoteConfirmedBy").references(() => users.id, { onDelete: "set null" }),
    xmlStorageKey: varchar("xmlStorageKey", { length: 512 }),
    xmlUrl: varchar("xmlUrl", { length: 1024 }),
    xmlFileName: varchar("xmlFileName", { length: 255 }),
    invoiceNumber: varchar("invoiceNumber", { length: 100 }),
    invoiceAccessKey: varchar("invoiceAccessKey", { length: 80 }),
    purchaseOrder: varchar("purchaseOrder", { length: 100 }),
    invoiceSupplierName: varchar("invoiceSupplierName", { length: 255 }),
    recipientCnpj: varchar("recipientCnpj", { length: 20 }),
    invoiceIssuedAt: datetime("invoiceIssuedAt", { mode: "date" }),
    invoiceTotalCents: int("invoiceTotalCents"),
    invoiceItemsJson: text("invoiceItemsJson"),
    receivedAt: datetime("receivedAt", { mode: "date" }),
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
    eventNote: text("eventNote"),
    previousScheduledFor: datetime("previousScheduledFor", { mode: "date" }),
    nextScheduledFor: datetime("nextScheduledFor", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("appointment_status_history_idx").on(table.appointmentId, table.createdAt)]
);

export const appointmentSuggestions = mysqlTable(
  "appointmentSuggestions",
  {
    id: int("id").autoincrement().primaryKey(),
    appointmentId: int("appointmentId")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    supplierId: int("supplierId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    suggestedFor: datetime("suggestedFor", { mode: "date" }).notNull(),
    notes: text("notes"),
    status: mysqlEnum("status", suggestionStatuses).default("pending").notNull(),
    handledBy: int("handledBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    respondedAt: timestamp("respondedAt"),
  },
  table => [
    index("appointment_suggestions_appointment_idx").on(table.appointmentId, table.status),
    index("appointment_suggestions_supplier_idx").on(table.supplierId, table.createdAt),
  ]
);

export const appointmentMessages = mysqlTable(
  "appointmentMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    appointmentId: int("appointmentId")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    senderId: int("senderId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    operatorReadAt: datetime("operatorReadAt", { mode: "date" }),
    supplierReadAt: datetime("supplierReadAt", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("appointment_messages_appointment_idx").on(table.appointmentId, table.createdAt)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;
export type AppointmentStatusHistory = typeof appointmentStatusHistory.$inferSelect;
export type AppointmentSuggestion = typeof appointmentSuggestions.$inferSelect;
export type AppointmentMessage = typeof appointmentMessages.$inferSelect;
