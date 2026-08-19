import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appointmentStatuses, type AppointmentStatus } from "../drizzle/schema";
import {
  type AppointmentFilters,
  createAppointment,
  createAppointmentSuggestion,
  createManualXmlAppointment,
  createUnscheduledReceipt,
  confirmAppointmentPreNote,
  createAppointmentMessage,
  createLocalUser,
  deleteAppointmentById,
  acceptAppointmentSuggestion,
  getAppointmentById,
  getSuggestionById,
  getUserByCompanyCnpj,
  getUserByEmail,
  listAppointmentHistory,
  listAppointmentMessages,
  listAppointments,
  listAppointmentsBetween,
  listAppointmentSuggestions,
  listUnreadAppointmentMessages,
  listSupplierActiveAppointments,
  markAppointmentMessagesRead,
  rescueAppointment,
  scheduleAppointment,
  touchUserSignIn,
  updateAppointmentStatus,
} from "./db";
import { canApplySuggestion, canRequestAppointment, canRescueAppointment, canScheduleAppointment, canTransitionAppointment, isOperator } from "./permissions";
import { clearRvdSession, createRvdSession } from "./session";
import { systemRouter } from "./_core/systemRouter";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { MAX_XML_BYTES, parseInvoiceXml } from "./xmlInvoice";
import { ENV } from "./_core/env";
import { createAppointmentValidationToken, readAppointmentValidationToken } from "./appointmentValidation";
import { buildDashboardMetrics } from "./dashboardMetrics";

const localProfileSchema = z.enum(["operator", "supplier"]);
const statusSchema = z.enum(appointmentStatuses);
const demoLogin = "admin";
const demoPassword = "admin";

function demoAccountFor(profile: z.infer<typeof localProfileSchema>) {
  return profile === "supplier"
    ? { email: "teste.fornecedor@rvdsaude.local", name: "Fornecedor de Teste RVD Saúde", companyName: "Fornecedor de Teste RVD Saúde", companyCnpj: "00000000000000" }
    : { email: "teste.operador@rvdsaude.local", name: "Operador de Teste RVD Saúde" };
}

function hashPassword(password: string, salt = nanoid(16)) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function publicUser(user: { id: number; name: string | null; email: string | null; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function assertOperator(role: "admin" | "operator" | "supplier") {
  if (!isOperator(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao perfil de operador." });
}

function assertAdmin(role: "admin" | "operator" | "supplier") {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "A exclusão de notas é restrita ao Administrador." });
}

async function getAccessibleAppointment(user: { id: number; role: "admin" | "operator" | "supplier" }, appointmentId: number) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
  if (!isOperator(user.role) && appointment.supplierId !== user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode acessar as mensagens deste agendamento." });
  }
  return appointment;
}

function decodeXmlBase64(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo do XML é inválido." });
  }
  const content = Buffer.from(normalized, "base64");
  if (!content.length || content.length > MAX_XML_BYTES) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O XML deve ter até 2 MB." });
  }
  return content;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().min(1, "Informe seu e-mail ou o login de teste."),
          password: z.string().min(1, "Informe a senha."),
          profile: localProfileSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const requestedLogin = input.email.trim().toLowerCase();
        const isDemoLogin = requestedLogin === demoLogin;
        if (!isDemoLogin && !z.string().email().safeParse(requestedLogin).success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um e-mail válido ou use o login de teste admin." });
        }
        const demoAccount = demoAccountFor(input.profile);
        const email = isDemoLogin ? demoAccount.email : requestedLogin;
        const existing = await getUserByEmail(email);
        let user;

        if (existing) {
          const profileAllowed = existing.role === input.profile || (existing.role === "admin" && input.profile === "operator");
          if (!profileAllowed || !existing.passwordHash || !passwordMatches(input.password, existing.passwordHash)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail, senha ou perfil não conferem." });
          }
          await touchUserSignIn(existing.id);
          user = existing;
        } else if (isDemoLogin && input.password === demoPassword) {
          user = await createLocalUser({ ...demoAccount, role: input.profile === "operator" ? "admin" : "supplier", passwordHash: hashPassword(demoPassword) });
        } else if (isDemoLogin) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Login, senha ou perfil não conferem." });
        } else {
          throw new TRPCError({ code: "NOT_FOUND", message: input.profile === "supplier" ? "Fornecedor não encontrado. Faça seu cadastro antes de entrar." : "Acesso de operador não encontrado." });
        }

        await createRvdSession(ctx.res, user);
        return publicUser(user);
      }),
    registerSupplier: publicProcedure
      .input(z.object({ companyName: z.string().trim().min(2, "Informe a razão social.").max(255), companyCnpj: z.string().min(14, "Informe o CNPJ.").max(20), email: z.string().email("Informe um e-mail válido."), password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres.") }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        const companyCnpj = input.companyCnpj.replace(/\D/g, "");
        if (companyCnpj.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CNPJ válido com 14 dígitos." });
        const existing = await getUserByEmail(email);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta. Entre pelo formulário de acesso." });
        if (await getUserByCompanyCnpj(companyCnpj)) throw new TRPCError({ code: "CONFLICT", message: "Este CNPJ já possui uma conta de fornecedor." });
        const user = await createLocalUser({ email, name: input.companyName.trim(), companyName: input.companyName.trim(), companyCnpj, role: "supplier", passwordHash: hashPassword(input.password) });
        await createRvdSession(ctx.res, user);
        return publicUser(user);
      }),
    register: publicProcedure
      .input(z.object({ profile: localProfileSchema, name: z.string().trim().min(2, "Informe o nome.").max(255), companyCnpj: z.string().max(20).optional(), email: z.string().email("Informe um e-mail válido."), password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres.") }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        if (await getUserByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta. Entre pelo formulário de acesso." });
        const isSupplier = input.profile === "supplier";
        const companyCnpj = isSupplier ? input.companyCnpj?.replace(/\D/g, "") : undefined;
        if (isSupplier && companyCnpj?.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CNPJ válido com 14 dígitos." });
        if (companyCnpj && await getUserByCompanyCnpj(companyCnpj)) throw new TRPCError({ code: "CONFLICT", message: "Este CNPJ já possui uma conta de fornecedor." });
        const user = await createLocalUser({ email, name: input.name.trim(), companyName: isSupplier ? input.name.trim() : undefined, companyCnpj, role: input.profile, passwordHash: hashPassword(input.password) });
        await createRvdSession(ctx.res, user);
        return publicUser(user);
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearRvdSession(ctx.res);
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  appointments: router({
    publicConfirmation: publicProcedure
      .input(z.object({ token: z.string().min(1).max(1000) }))
      .query(async ({ input }) => {
        const validation = readAppointmentValidationToken(input.token, ENV.cookieSecret);
        if (!validation) return { valid: false as const };
        const appointment = await getAppointmentById(validation.appointmentId);
        const scheduledFor = appointment?.scheduledFor;
        if (!appointment || appointment.status !== "scheduled" || !scheduledFor || scheduledFor.getTime() !== validation.scheduledForTimestamp) return { valid: false as const };
        return { valid: true as const, invoiceNumber: appointment.invoiceNumber, scheduledFor };
      }),
    list: protectedProcedure
      .input(z.object({ date: z.string().optional(), status: statusSchema.optional(), invoiceNumber: z.string().max(100).optional(), supplierName: z.string().max(255).optional(), recipientCnpj: z.string().max(20).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const filters: AppointmentFilters = { date: input?.date, status: input?.status as AppointmentStatus | undefined, invoiceNumber: input?.invoiceNumber, supplierName: input?.supplierName, recipientCnpj: input?.recipientCnpj };
        if (!isOperator(ctx.user.role)) filters.supplierId = ctx.user.id;
        return listAppointments(filters);
      }),
    history: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!isOperator(ctx.user.role) && appointment.supplierId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar o histórico deste agendamento." });
        }
        return listAppointmentHistory(input.appointmentId);
      }),
    receiptCertificate: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        if (ctx.user.role === "supplier" && appointment.supplierId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode emitir este comprovante." });
        }
        if (appointment.status !== "scheduled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O PDF de entrega fica disponível somente para notas Agendadas." });
        }
        const history = await listAppointmentHistory(appointment.id);
        const scheduleEvent = [...history].reverse().find(event => event.nextStatus === "scheduled");
        return {
          appointment,
          confirmedByName: scheduleEvent?.handlerName || "Operador RVD Saúde",
          confirmedByLogin: scheduleEvent?.handlerEmail || "Login não informado",
          confirmedAt: scheduleEvent?.createdAt || appointment.updatedAt,
          scheduledFor: appointment.scheduledFor,
          validationToken: createAppointmentValidationToken({ appointmentId: appointment.id, scheduledForTimestamp: appointment.scheduledFor.getTime() }, ENV.cookieSecret),
        };
      }),
    delete: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        await deleteAppointmentById(appointment.id);
        return { success: true } as const;
      }),
    create: protectedProcedure
      .input(
        z.object({
          serviceType: z.string().min(2).max(80),
          scheduledFor: z.string().datetime(),
          notes: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canRequestAppointment(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente fornecedores podem solicitar agendamentos." });
        }
        const date = new Date(input.scheduledFor);
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma data e horário futuros." });
        }
        return createAppointment({ ...input, scheduledFor: date, supplierId: ctx.user.id });
      }),
    createManualXml: protectedProcedure
      .input(z.object({ fileName: z.string().min(5).max(255), xmlBase64: z.string().min(4).max(2_800_000), suggestedFor: z.string().datetime().optional(), suggestionNotes: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canRequestAppointment(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente fornecedores podem criar agendamentos manuais." });
        }
        if (!input.fileName.toLowerCase().endsWith(".xml")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas o arquivo XML da nota fiscal." });
        }
        const suggestedFor = input.suggestedFor ? new Date(input.suggestedFor) : undefined;
        if (suggestedFor && (Number.isNaN(suggestedFor.getTime()) || suggestedFor.getTime() <= Date.now())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A sugestão de data e horário precisa ser futura." });
        }
        const content = decodeXmlBase64(input.xmlBase64);
        let invoice;
        try {
          invoice = parseInvoiceXml(content);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível ler o XML." });
        }
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`agendamentos-xml/${ctx.user.id}/${safeName}`, content, "application/xml");
        return createManualXmlAppointment({
          supplierId: ctx.user.id,
          xmlStorageKey: stored.key,
          xmlUrl: stored.url,
          xmlFileName: safeName,
          invoiceNumber: invoice.invoiceNumber,
          invoiceAccessKey: invoice.accessKey,
          purchaseOrder: invoice.purchaseOrder,
          invoiceSupplierName: invoice.supplierName,
          recipientCnpj: invoice.recipientCnpj,
          invoiceIssuedAt: invoice.issuedAt,
          serviceDescription: invoice.serviceDescription,
          suggestedFor,
          suggestionNotes: input.suggestionNotes,
        });
      }),
    registerUnscheduledReceipt: protectedProcedure
      .input(z.object({ fileName: z.string().min(5).max(255), xmlBase64: z.string().min(4).max(2_800_000) }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        if (!input.fileName.toLowerCase().endsWith(".xml")) throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas o arquivo XML da nota fiscal." });
        const content = decodeXmlBase64(input.xmlBase64);
        let invoice;
        try { invoice = parseInvoiceXml(content); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível ler o XML." }); }
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`recebimentos-avulsos/${ctx.user.id}/${safeName}`, content, "application/xml");
        return createUnscheduledReceipt({ operatorId: ctx.user.id, xmlStorageKey: stored.key, xmlUrl: stored.url, xmlFileName: safeName, invoiceNumber: invoice.invoiceNumber, invoiceAccessKey: invoice.accessKey, purchaseOrder: invoice.purchaseOrder, invoiceSupplierName: invoice.supplierName, recipientCnpj: invoice.recipientCnpj, invoiceIssuedAt: invoice.issuedAt, serviceDescription: invoice.serviceDescription });
      }),
    updateStatus: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(["scheduled", "received", "completed", "backlog", "rejected"]), rejectionReason: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canTransitionAppointment(appointment.status, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Essa alteração de status não é permitida." });
        }
        return updateAppointmentStatus({ ...input, previousStatus: appointment.status, handledBy: ctx.user.id, eventNote: input.status === "received" ? "Recebimento confirmado pelo operador." : input.status === "completed" ? "Recebimento concluído pelo operador." : undefined });
      }),
    confirmPreNote: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.preNoteConfirmedAt) return appointment;
        return confirmAppointmentPreNote({ appointmentId: appointment.id, status: appointment.status, operatorId: ctx.user.id });
      }),
    activeForSupplier: protectedProcedure
      .input(z.object({ supplierId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => { assertOperator(ctx.user.role); return listSupplierActiveAppointments(input.supplierId); }),
    schedule: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), scheduledFor: z.string().datetime(), acceptedSuggestionId: z.number().int().positive().optional() }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canScheduleAppointment(appointment.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este item não pode ser agendado." });
        const scheduledFor = new Date(input.scheduledFor);
        if (Number.isNaN(scheduledFor.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Data e horário inválidos." });
        if (input.acceptedSuggestionId) {
          const suggestion = await getSuggestionById(input.acceptedSuggestionId);
          if (!suggestion || suggestion.appointmentId !== appointment.id || suggestion.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "A sugestão selecionada não está disponível." });
        }
        return scheduleAppointment({ appointmentId: appointment.id, previousStatus: appointment.status, previousScheduledFor: appointment.scheduledFor, scheduledFor, handledBy: ctx.user.id, rescheduled: appointment.status === "scheduled", acceptedSuggestionId: input.acceptedSuggestionId });
      }),
    rescue: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canRescueAppointment(appointment.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas itens rejeitados podem ser resgatados." });
        return rescueAppointment({ appointmentId: appointment.id, handledBy: ctx.user.id });
      }),
  }),
  suggestions: router({
    list: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive().optional(), status: z.enum(["pending", "accepted", "declined"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (input?.appointmentId && !isOperator(ctx.user.role)) {
          const appointment = await getAppointmentById(input.appointmentId);
          if (!appointment || appointment.supplierId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar sugestões deste agendamento." });
        }
        return listAppointmentSuggestions({ appointmentId: input?.appointmentId, status: input?.status, supplierId: isOperator(ctx.user.role) ? undefined : ctx.user.id });
      }),
    create: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), suggestedFor: z.string().datetime(), notes: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canRequestAppointment(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Somente fornecedores podem enviar sugestões." });
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment || appointment.supplierId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode sugerir horário para este agendamento." });
        if (!canApplySuggestion(appointment.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este agendamento não aceita novas sugestões." });
        const suggestedFor = new Date(input.suggestedFor);
        if (Number.isNaN(suggestedFor.getTime()) || suggestedFor.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Sugira uma data e horário futuros." });
        return createAppointmentSuggestion({ ...input, supplierId: ctx.user.id, suggestedFor });
      }),
    accept: protectedProcedure
      .input(z.object({ suggestionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const suggestions = await listAppointmentSuggestions({ status: "pending" });
        const suggestion = suggestions.find(item => item.id === input.suggestionId);
        if (!suggestion) throw new TRPCError({ code: "NOT_FOUND", message: "Sugestão pendente não encontrada." });
        if (!canApplySuggestion(suggestion.appointmentStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "O agendamento não pode receber esta sugestão." });
        return acceptAppointmentSuggestion({ suggestionId: input.suggestionId, appointmentStatus: suggestion.appointmentStatus, handledBy: ctx.user.id });
      }),
  }),
  messages: router({
    list: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await getAccessibleAppointment(ctx.user, input.appointmentId);
        await markAppointmentMessagesRead({ appointmentId: input.appointmentId, userId: ctx.user.id, isOperator: isOperator(ctx.user.role) });
        return listAppointmentMessages(input.appointmentId);
      }),
    send: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), body: z.string().trim().min(1, "Digite uma mensagem.").max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await getAccessibleAppointment(ctx.user, input.appointmentId);
        const id = await createAppointmentMessage({ appointmentId: input.appointmentId, senderId: ctx.user.id, body: input.body.trim(), senderIsOperator: isOperator(ctx.user.role) });
        return { id };
      }),
    notifications: protectedProcedure.query(({ ctx }) => listUnreadAppointmentMessages({ userId: ctx.user.id, isOperator: isOperator(ctx.user.role) })),
  }),
  calendar: router({
    list: protectedProcedure
      .input(z.object({ start: z.string().datetime(), end: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const start = new Date(input.start);
        const end = new Date(input.end);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new TRPCError({ code: "BAD_REQUEST", message: "Período inválido." });
        return listAppointmentsBetween(start, end);
      }),
  }),
  analytics: router({
    dashboard: protectedProcedure.input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2100) })).query(async ({ ctx, input }) => {
      assertOperator(ctx.user.role);
      const items = (await listAppointments()).filter(item => item.status !== "backlog");
      return buildDashboardMetrics(items, input);
    }),
  }),
});

export type AppRouter = typeof appRouter;
