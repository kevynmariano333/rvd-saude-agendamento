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

export const userRoles = ["admin", "operator", "supplier", "portaria", "operacao"] as const;
export const appointmentStatuses = ["pending", "scheduled", "received", "completed", "backlog", "rejected"] as const;
export const appointmentSources = ["portal", "manual_xml"] as const;
export const suggestionStatuses = ["pending", "accepted", "declined"] as const;
// A supplier login is approved on sight when it is the first for its CNPJ, and
// held for an operator's decision when it joins a company that already exists.
export const userAccessStatuses = ["approved", "pending", "rejected"] as const;

// Portaria (gate) module. A truck arriving at the unit opens an attendance:
// the gate registers it and decides the entry, the yard operation carries it
// through to conclusion. Every step is appended to attendanceEvents so the
// protocol can be audited later.
export const attendanceServiceTypes = ["coleta", "recebimento"] as const;
export const attendanceClassifications = ["amil", "llt", "rvd"] as const;
export const attendanceClassificationDetails = [
  "maternidade",
  "hospital",
  "sedex",
  "mercado_livre",
  "nao_aplicavel",
] as const;
export const attendanceStatuses = [
  "aguardando",
  "aprovado",
  "recusado",
  "em_atendimento",
  "liberado",
  "concluido",
] as const;
export const attendanceEventTypes = [
  "chegada_registrada",
  "entrada_aprovada",
  "entrada_recusada",
  "atendimento_iniciado",
  "liberacao_registrada",
  "atendimento_concluido",
] as const;

export type UserRole = (typeof userRoles)[number];
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export type AppointmentSource = (typeof appointmentSources)[number];
export type SuggestionStatus = (typeof suggestionStatuses)[number];
export type UserAccessStatus = (typeof userAccessStatuses)[number];
export type AttendanceServiceType = (typeof attendanceServiceTypes)[number];
export type AttendanceClassification = (typeof attendanceClassifications)[number];
export type AttendanceClassificationDetail = (typeof attendanceClassificationDetails)[number];
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type AttendanceEventType = (typeof attendanceEventTypes)[number];

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
    accessStatus: mysqlEnum("accessStatus", userAccessStatuses).default("approved").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [uniqueIndex("users_email_unique").on(table.email), index("users_company_cnpj_idx").on(table.companyCnpj)]
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
    invoiceVolumeCount: int("invoiceVolumeCount"),
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

export const attendances = mysqlTable(
  "attendances",
  {
    id: int("id").autoincrement().primaryKey(),
    protocol: varchar("protocol", { length: 32 }).notNull().unique(),
    driverName: varchar("driverName", { length: 160 }).notNull(),
    licensePlate: varchar("licensePlate", { length: 12 }).notNull(),
    carrier: varchar("carrier", { length: 160 }).notNull(),
    serviceType: mysqlEnum("serviceType", attendanceServiceTypes).notNull(),
    classification: mysqlEnum("classification", attendanceClassifications).notNull(),
    classificationDetail: mysqlEnum("classificationDetail", attendanceClassificationDetails)
      .default("nao_aplicavel")
      .notNull(),
    status: mysqlEnum("status", attendanceStatuses).default("aguardando").notNull(),
    arrivalAt: timestamp("arrivalAt").defaultNow().notNull(),
    decisionAt: datetime("decisionAt", { mode: "date" }),
    releasedAt: datetime("releasedAt", { mode: "date" }),
    concludedAt: datetime("concludedAt", { mode: "date" }),
    refusalReason: text("refusalReason"),
    notes: text("notes"),
    createdById: int("createdById")
      .notNull()
      .references(() => users.id),
    decisionById: int("decisionById").references(() => users.id, { onDelete: "set null" }),
    operatedById: int("operatedById").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("attendances_status_idx").on(table.status),
    index("attendances_service_type_idx").on(table.serviceType),
    index("attendances_arrival_at_idx").on(table.arrivalAt),
  ]
);

export const attendanceEvents = mysqlTable(
  "attendanceEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    attendanceId: int("attendanceId")
      .notNull()
      .references(() => attendances.id, { onDelete: "cascade" }),
    eventType: mysqlEnum("eventType", attendanceEventTypes).notNull(),
    description: text("description"),
    performedById: int("performedById")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("attendance_events_attendance_idx").on(table.attendanceId, table.createdAt)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;
export type AppointmentStatusHistory = typeof appointmentStatusHistory.$inferSelect;
export type AppointmentSuggestion = typeof appointmentSuggestions.$inferSelect;
export type AppointmentMessage = typeof appointmentMessages.$inferSelect;
export type Attendance = typeof attendances.$inferSelect;
export type InsertAttendance = typeof attendances.$inferInsert;
export type AttendanceEvent = typeof attendanceEvents.$inferSelect;
export type InsertAttendanceEvent = typeof attendanceEvents.$inferInsert;
