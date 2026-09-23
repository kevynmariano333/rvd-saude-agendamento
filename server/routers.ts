import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointmentStatuses,
  attendanceClassificationDetails,
  attendanceClassifications,
  attendanceServiceTypes,
  attendanceStatuses,
  type AppointmentStatus,
  type UserRole,
} from "../drizzle/schema";
import {
  type AppointmentFilters,
  createAppointment,
  createAppointmentInternalNote,
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
  listAppointmentInternalNotes,
  listAppointmentSuggestions,
  listBacklogReportRows,
  listUnreadAppointmentMessages,
  listSupplierActiveAppointments,
  markAppointmentMessagesRead,
  returnAppointmentForRescheduling,
  rescueAppointment,
  scheduleAppointment,
  touchUserSignIn,
  treatBacklogAppointment,
  updateAppointmentStatus,
  consumePasswordResetToken,
  updateUserName,
  updateUserPassword,
  listApprovedCompanyUserIds,
  listPendingAccessRequests,
  setUserAccessStatus,
  createPasswordResetToken,
  getPasswordResetToken,
  getUserById,
  createAttendance,
  decideAttendanceEntry,
  executeAttendanceAction,
  getAttendanceById,
  listAttendanceEvents,
  listAttendances,
  countActiveAdmins,
  deleteAttendanceById,
  listAttendancesByDay,
  listAttendancesInRange,
  listStaffUsers,
  setUserRole,
} from "./db";
import { supplierNameRule } from "../shared/attendanceFields";
import { canApplySuggestion, canMoveAppointmentStatus, canRequestAppointment, canRescueAppointment, canScheduleAppointment, canSuggestSchedule, canTransitionAppointment, canTreatBacklog, isOperator, isSchedulingDesk } from "./permissions";
import { validarTratativa, resumoDaTratativa } from "../shared/tratativa";
import { ehMotivoConhecido, rotuloDoMotivo } from "../shared/backlogReasons";
import { clearRvdSession, createRvdSession } from "./session";
import { systemRouter } from "./_core/systemRouter";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { MAX_XML_BYTES, parseInvoiceXml } from "./xmlInvoice";
import { ENV } from "./_core/env";
import { createAppointmentValidationToken, readAppointmentValidationToken } from "./appointmentValidation";
import { buildResetUrl, createResetToken, hashResetToken, isResetTokenUsable, resetEmailContent, resetTokenExpiry } from "./passwordReset";
import { isMailerConfigured, sendMail } from "./_core/mailer";
import { buildScopeIds, companyKey, isWithinScope } from "./supplierScope";
import { contarAgendamentos } from "./db";
import { gerarBackup } from "./backup";
import { decodificarCsv, importarAcervo } from "./agilizaImport";
import { situacaoDasMigracoes } from "./_core/migrations";

/** Uma importação de acervo por vez em todo o servidor. Ver a rota abaixo. */
let importacaoEmCurso = false;
import { normalizePurchaseOrder } from "./purchaseOrder";
import { MIRO_DIGITS, normalizeMiroNumber } from "../shared/miro";
import { buildDashboardMetrics } from "./dashboardMetrics";
import { formatSaoPauloDateKey } from "../shared/dateFilters";
import { buildAttendanceMetrics } from "./attendanceMetrics";
import {
  attendanceActionOwner,
  canManageOperation,
  canManagePortaria,
  canPerformAttendanceAction,
  canViewAttendances,
  canViewGateHistory,
  isValidClassificationDetail,
  validateEntryDecision,
  validateOperationalTransition,
} from "./attendanceRules";

const localProfileSchema = z.enum(["operator", "supplier", "portaria", "operacao"]);
const statusSchema = z.enum(appointmentStatuses);
const demoLogin = "admin";
const demoPassword = "admin";

function demoAccountFor(profile: z.infer<typeof localProfileSchema>) {
  if (profile === "supplier") return { email: "teste.fornecedor@rvdsaude.local", name: "Fornecedor de Teste RVD Saúde", companyName: "Fornecedor de Teste RVD Saúde", companyCnpj: "00000000000000" };
  if (profile === "portaria") return { email: "teste.portaria@rvdsaude.local", name: "Portaria de Teste RVD Saúde" };
  if (profile === "operacao") return { email: "teste.operacao@rvdsaude.local", name: "Operação de Teste RVD Saúde" };
  return { email: "teste.operador@rvdsaude.local", name: "Operador de Teste RVD Saúde" };
}

/** O administrador responde por toda a operação interna, então entra por
 * qualquer perfil interno; o de fornecedor continua fora do seu alcance. */
function demoRoleFor(profile: z.infer<typeof localProfileSchema>): UserRole {
  return profile === "operator" ? "admin" : profile;
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

function assertOperator(role: UserRole) {
  if (!isOperator(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao perfil de operador." });
}

function assertSchedulingDesk(role: UserRole) {
  if (!isSchedulingDesk(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a quem cuida da agenda." });
}

function assertAdmin(role: UserRole) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Ação restrita ao Administrador." });
}

function assertPortaria(role: UserRole) {
  if (!canManagePortaria(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o perfil de Portaria pode executar esta ação." });
}

function assertOperacao(role: UserRole) {
  if (!canManageOperation(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o perfil de Operação pode executar esta ação." });
}

/**
 * O RG do motorista é dado pessoal. Ele fica registrado — é o documento
 * conferido no portão —, mas sai do que o portal devolve para quem não é
 * administrador. Apagar só na tela não restringe nada: quem abre o inspetor do
 * navegador lê o JSON igual.
 */
function hideDriverDocument<T extends { driverDocument: string | null }>(role: UserRole, rows: T[]) {
  return role === "admin" ? rows : rows.map(row => ({ ...row, driverDocument: null }));
}

function assertAttendanceViewer(role: UserRole) {
  if (!canViewAttendances(role)) throw new TRPCError({ code: "FORBIDDEN", message: "O pátio é restrito às equipes internas." });
}

/**
 * Recusa a mudança que deixaria o sistema sem nenhum administrador ativo. Sem
 * essa checagem, um clique bloqueia o último dono e a única forma de voltar é
 * abrir o banco na mão.
 */
async function assertAnotherAdminRemains(userId: number, removesAdmin: boolean) {
  if (!removesAdmin) return;
  const target = await getUserById(userId);
  if (target?.role !== "admin" || target.accessStatus !== "approved") return;
  if ((await countActiveAdmins(userId)) === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Este é o último administrador ativo. Promova outra conta a Administrador antes de bloquear esta.",
    });
  }
}

async function getExistingAttendance(attendanceId: number) {
  const attendance = await getAttendanceById(attendanceId);
  if (!attendance) throw new TRPCError({ code: "NOT_FOUND", message: "Atendimento não localizado." });
  return attendance;
}

type ScopedUser = { id: number; role: UserRole; companyCnpj?: string | null };

/**
 * The supplier logins whose appointments this caller may read. Logins sharing a
 * CNPJ see the company's records; only approved ones count, so a login waiting
 * on the operator neither sees the company nor is seen by it.
 */
async function supplierScopeIds(user: ScopedUser): Promise<number[]> {
  const key = companyKey(user.companyCnpj);
  if (!key) return [user.id];
  return buildScopeIds(user.id, await listApprovedCompanyUserIds(key));
}

async function getAccessibleAppointment(user: ScopedUser, appointmentId: number) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
  if (!isSchedulingDesk(user.role) && !isWithinScope(await supplierScopeIds(user), appointment.supplierId)) {
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
          // Operação e Planejamento não têm porta própria na tela de entrada:
          // são perfis que o administrador atribui depois do cadastro, e a
          // conta continua entrando pela porta por onde se cadastrou, a do
          // Operador. Sem esta linha, promover alguém a Planejador o trancava
          // para fora do sistema.
          const entraPelaPortaDoOperador = existing.role === "operacao" || existing.role === "planejador";
          const profileAllowed =
            existing.role === input.profile ||
            (existing.role === "admin" && input.profile !== "supplier") ||
            (entraPelaPortaDoOperador && input.profile === "operator");
          if (!profileAllowed || !existing.passwordHash || !passwordMatches(input.password, existing.passwordHash)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail, senha ou perfil não conferem." });
          }
          // Checked only after the password, so the status of an account is not
          // revealed to someone who does not already hold its credentials.
          if (existing.accessStatus === "pending") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Seu cadastro ainda está em análise. Você poderá entrar assim que for aprovado." });
          }
          if (existing.accessStatus === "rejected") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Seu cadastro não foi aprovado. Fale com o administrador do sistema." });
          }
          await touchUserSignIn(existing.id);
          user = existing;
        } else if (isDemoLogin && input.password === demoPassword) {
          user = await createLocalUser({ ...demoAccount, role: demoRoleFor(input.profile), passwordHash: hashPassword(demoPassword) });
        } else if (isDemoLogin) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Login, senha ou perfil não conferem." });
        } else {
          throw new TRPCError({ code: "NOT_FOUND", message: input.profile === "supplier" ? "Fornecedor não encontrado. Faça seu cadastro antes de entrar." : "Acesso interno não encontrado." });
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

        // The first login for a CNPJ opens the company and is trusted. Any later
        // one joins a company whose records already exist, so it waits for the
        // operator — a CNPJ is public, and self-service would hand the company's
        // history to anyone who types it.
        const companyExists = Boolean(await getUserByCompanyCnpj(companyCnpj));
        const accessStatus = companyExists ? "pending" : "approved";
        const user = await createLocalUser({ email, name: input.companyName.trim(), companyName: input.companyName.trim(), companyCnpj, role: "supplier", passwordHash: hashPassword(input.password), accessStatus });
        if (accessStatus === "pending") return { pending: true } as const;

        await createRvdSession(ctx.res, user);
        return { pending: false, ...publicUser(user) } as const;
      }),
    register: publicProcedure
      .input(z.object({ profile: localProfileSchema, name: z.string().trim().min(2, "Informe o nome.").max(255), companyCnpj: z.string().max(20).optional(), email: z.string().email("Informe um e-mail válido."), password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres.") }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        if (await getUserByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta. Entre pelo formulário de acesso." });
        const isSupplier = input.profile === "supplier";
        const companyCnpj = isSupplier ? input.companyCnpj?.replace(/\D/g, "") : undefined;
        if (isSupplier && companyCnpj?.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CNPJ válido com 14 dígitos." });
        await createLocalUser({ email, name: input.name.trim(), companyName: isSupplier ? input.name.trim() : undefined, companyCnpj, role: input.profile, passwordHash: hashPassword(input.password), accessStatus: "pending" });
        return { pending: true } as const;
      }),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().trim().email("Informe um e-mail válido.") }))
      .mutation(async ({ input }) => {
        const email = input.email.trim().toLowerCase();
        const user = await getUserByEmail(email);

        // Always answer the same way. Telling the caller whether the address is
        // registered would turn this endpoint into a way to enumerate accounts.
        if (user?.id && user.email) {
          const { token, tokenHash } = createResetToken();
          await createPasswordResetToken({ userId: user.id, tokenHash, expiresAt: resetTokenExpiry() });

          const baseUrl = ENV.appUrl;
          if (!baseUrl) {
            console.error("[PasswordReset] APP_URL não configurada — não foi possível montar o link.");
          } else if (!isMailerConfigured()) {
            console.error("[PasswordReset] RESEND_API_KEY ou MAIL_FROM ausentes — e-mail não enviado.");
          } else {
            const content = resetEmailContent(buildResetUrl(baseUrl, token));
            try {
              await sendMail({ to: user.email, ...content });
            } catch (error) {
              // A delivery failure must not change the response either.
              console.error("[PasswordReset] Falha ao enviar o e-mail:", error);
            }
          }
        }

        if (!user) {
          // Logged, never returned: the caller still gets the same answer, but a
          // silent no-op is indistinguishable from a delivery failure otherwise.
          console.warn(`[PasswordReset] Nenhuma conta encontrada para o e-mail informado.`);
        }

        return { sent: true } as const;
      }),
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string().min(1, "Link inválido.").max(500),
          password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres."),
        })
      )
      .mutation(async ({ input }) => {
        const stored = await getPasswordResetToken(hashResetToken(input.token));
        if (!isResetTokenUsable(stored)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este link expirou ou já foi utilizado. Peça um novo e-mail de redefinição.",
          });
        }

        await consumePasswordResetToken({
          tokenId: stored!.id,
          userId: stored!.userId,
          passwordHash: hashPassword(input.password),
        });

        // No session is created here: the new password has to be typed on the
        // login screen, so possession of the link alone never grants access.
        return { success: true } as const;
      }),
    // O nome é o que aparece no topo da tela e assina cada evento do histórico,
    // então quem usa a conta precisa poder corrigi-lo sem depender do admin.
    updateName: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2, "Informe o nome.").max(255) }))
      .mutation(async ({ ctx, input }) => {
        await updateUserName({ userId: ctx.user.id, name: input.name });
        return { name: input.name } as const;
      }),

    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1, "Informe a senha atual."),
          newPassword: z.string().min(6, "A nova senha deve conter pelo menos 6 caracteres."),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Re-check the current password even though the session is already
        // authenticated: an unattended open session should not be enough to
        // take the account over.
        if (!ctx.user.passwordHash || !passwordMatches(input.currentPassword, ctx.user.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "A senha atual não confere." });
        }
        if (input.currentPassword === input.newPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A nova senha deve ser diferente da atual." });
        }

        await updateUserPassword({ userId: ctx.user.id, passwordHash: hashPassword(input.newPassword) });
        return { success: true } as const;
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
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").optional(), status: statusSchema.optional(), invoiceNumber: z.string().max(100).optional(), supplierName: z.string().max(255).optional(), recipientCnpj: z.string().max(20).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const filters: AppointmentFilters = { date: input?.date, status: input?.status as AppointmentStatus | undefined, invoiceNumber: input?.invoiceNumber, supplierName: input?.supplierName, recipientCnpj: input?.recipientCnpj };
        if (!isSchedulingDesk(ctx.user.role)) filters.supplierIds = await supplierScopeIds(ctx.user);
        return listAppointments(filters);
      }),
    history: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar o histórico deste agendamento." });
        }
        return listAppointmentHistory(input.appointmentId);
      }),
    receiptCertificate: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        // O comprovante entrega os dados fiscais da nota e um token de validação
        // assinado. Escrito como "quem não é fornecedor pode", o teste liberava
        // qualquer perfil interno novo — Portaria e Operação não participam
        // deste fluxo. A regra é a mesma do histórico: a operação de
        // agendamentos, ou o próprio fornecedor da nota.
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
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
    returnForRescheduling: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertAdmin(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
        if (appointment.status !== "received" && appointment.status !== "completed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Somente notas Recebidas ou Concluídas podem retornar para agendamento." });
        }
        return returnAppointmentForRescheduling({
          appointmentId: appointment.id,
          previousStatus: appointment.status,
          previousScheduledFor: appointment.scheduledFor,
          handledBy: ctx.user.id,
        });
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
      .input(z.object({ fileName: z.string().min(5).max(255), xmlBase64: z.string().min(4).max(2_800_000), purchaseOrder: z.string().min(1).max(200), suggestedFor: z.string().datetime().optional(), suggestionNotes: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canRequestAppointment(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente fornecedores podem criar agendamentos manuais." });
        }
        if (!input.fileName.toLowerCase().endsWith(".xml")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas o arquivo XML da nota fiscal." });
        }
        const purchaseOrder = normalizePurchaseOrder(input.purchaseOrder);
        if (!purchaseOrder) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o número do pedido de compra da nota." });
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
          // O que o fornecedor informou vale mais do que a tag xPed: o XML só a
          // traz às vezes, e é este número que o Operador usa para achar a
          // compra. O do XML continua sendo lido para os recebimentos avulsos,
          // onde não há fornecedor na tela para digitar.
          purchaseOrder,
          invoiceSupplierName: invoice.supplierName,
          invoiceSupplierCnpj: invoice.supplierCnpj,
          recipientCnpj: invoice.recipientCnpj,
          invoiceIssuedAt: invoice.issuedAt,
          serviceDescription: invoice.serviceDescription,
          invoiceTotalCents: invoice.totalCents,
          invoiceItemsJson: JSON.stringify(invoice.items),
          invoiceVolumeCount: invoice.volumeCount,
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
        return createUnscheduledReceipt({ operatorId: ctx.user.id, xmlStorageKey: stored.key, xmlUrl: stored.url, xmlFileName: safeName, invoiceNumber: invoice.invoiceNumber, invoiceAccessKey: invoice.accessKey, purchaseOrder: invoice.purchaseOrder, invoiceSupplierName: invoice.supplierName, invoiceSupplierCnpj: invoice.supplierCnpj, recipientCnpj: invoice.recipientCnpj, invoiceIssuedAt: invoice.issuedAt, serviceDescription: invoice.serviceDescription, invoiceTotalCents: invoice.totalCents, invoiceItemsJson: JSON.stringify(invoice.items), invoiceVolumeCount: invoice.volumeCount });
      }),
    updateStatus: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(["scheduled", "received", "completed", "backlog", "rejected"]), rejectionReason: z.string().max(1000).optional(), miroNumber: z.string().max(40).optional(), note: z.string().max(1000).optional(), backlogReasonCode: z.string().max(60).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canMoveAppointmentStatus(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a quem cuida da agenda." });
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canTransitionAppointment(appointment.status, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Essa alteração de status não é permitida." });
        }
        // Concluir é o passo que fecha a nota contra o SAP, e o MIRO é o que
        // liga um ao outro. Cobrado aqui porque depois ninguém volta para
        // preencher: a nota sai da tela e o número se perde.
        let miroNumber: string | undefined;
        if (input.status === "completed") {
          const numero = normalizeMiroNumber(input.miroNumber);
          if (!numero) throw new TRPCError({ code: "BAD_REQUEST", message: `Informe o número MIRO com exatamente ${MIRO_DIGITS} dígitos.` });
          miroNumber = numero;
        }
        const observacao = input.note?.trim();
        // O backlog exige a categoria e a descrição. A categoria dá o número do
        // fim do mês; a descrição é o que quem vai tratar precisa ler. Uma nota
        // que volta sem dizer por quê só transfere o problema de mesa.
        let backlogReasonCode: string | undefined;
        if (input.status === "backlog") {
          if (!ehMotivoConhecido(input.backlogReasonCode)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o motivo do backlog." });
          }
          if (!observacao) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Descreva o que houve para mandar a nota ao backlog." });
          }
          backlogReasonCode = input.backlogReasonCode;
        }
        const notaDoEvento = input.status === "backlog"
          ? `${rotuloDoMotivo(backlogReasonCode)}: ${observacao}`
          : observacao || (input.status === "received" ? "Recebimento confirmado pelo operador." : input.status === "completed" ? `Recebimento concluído. MIRO ${miroNumber}.` : undefined);
        return updateAppointmentStatus({ ...input, miroNumber, backlogReasonCode, backlogReason: observacao, previousStatus: appointment.status, handledBy: ctx.user.id, eventNote: notaDoEvento });
      }),
    confirmPreNote: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.preNoteConfirmedAt) return appointment;
        return confirmAppointmentPreNote({ appointmentId: appointment.id, status: appointment.status, operatorId: ctx.user.id });
      }),
    activeForSupplier: protectedProcedure
      .input(z.object({ supplierId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => { assertSchedulingDesk(ctx.user.role); return listSupplierActiveAppointments(input.supplierId); }),
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
    tratarBacklog: protectedProcedure
      .input(z.object({
        appointmentId: z.number().int().positive(),
        miroNumber: z.string().max(40),
        quotationNumber: z.string().max(120).optional(),
        memorizedOrder: z.string().max(120).optional(),
        hisEntryDocument: z.string().max(120).optional(),
        hisExitDocument: z.string().max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!canTreatBacklog(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A tratativa do backlog é do Planejador." });
        }
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.status !== "backlog") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Só notas em Backlog entram em tratativa." });
        }
        const validacao = validarTratativa(input);
        if (!validacao.ok) throw new TRPCError({ code: "BAD_REQUEST", message: validacao.erro });
        return treatBacklogAppointment({
          appointmentId: appointment.id,
          previousStatus: appointment.status,
          handledBy: ctx.user.id,
          eventNote: resumoDaTratativa(validacao.dados),
          ...validacao.dados,
        });
      }),
    rescue: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
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
        if (input?.appointmentId && !isSchedulingDesk(ctx.user.role)) {
          const appointment = await getAppointmentById(input.appointmentId);
          if (!appointment || !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode consultar sugestões deste agendamento." });
        }
        return listAppointmentSuggestions({ appointmentId: input?.appointmentId, status: input?.status, supplierIds: isSchedulingDesk(ctx.user.role) ? undefined : await supplierScopeIds(ctx.user) });
      }),
    create: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), suggestedFor: z.string().datetime(), notes: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!canSuggestSchedule(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Este perfil não envia sugestões de data." });
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode sugerir horário para este agendamento." });
        // O planejador trabalha a agenda inteira; o fornecedor, só as notas da
        // própria empresa. Por isso o recorte de escopo continua valendo para
        // quem não está na mesa de agendamentos.
        if (!isSchedulingDesk(ctx.user.role) && !isWithinScope(await supplierScopeIds(ctx.user), appointment.supplierId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode sugerir horário para este agendamento." });
        }
        if (!canApplySuggestion(appointment.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este agendamento não aceita novas sugestões." });
        const suggestedFor = new Date(input.suggestedFor);
        if (Number.isNaN(suggestedFor.getTime()) || suggestedFor.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Sugira uma data e horário futuros." });
        // `supplierId` sempre guardou quem escreveu a sugestão, e continua
        // assim com o planejador. O efeito colateral é bem-vindo: a proposta
        // dele fica fora do recorte do fornecedor, que não precisa acompanhar
        // um pedido interno ainda não confirmado.
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
  manutencao: router({
    // Só administrador: o arquivo gerado contém a base inteira.
    gerarBackup: adminProcedure.mutation(async () => gerarBackup()),
    /**
     * O que está no ar, em números conferíveis.
     *
     * "Atualizei e não mudou nada" é impossível de responder de fora: não dá
     * para saber se o deploy entrou, se o banco acompanhou, ou se a tela é
     * outra. Aqui o próprio sistema diz qual commit está rodando, desde quando,
     * e quantas migrações o banco tem — e aí a pergunta vira uma conferência.
     */
    estadoDoSistema: adminProcedure.query(async () => {
      const migracoes = await situacaoDasMigracoes();
      return {
        // O Railway injeta estas variáveis no container a cada deploy.
        commit: (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || null,
        branch: process.env.RAILWAY_GIT_BRANCH || null,
        mensagemDoCommit: (process.env.RAILWAY_GIT_COMMIT_MESSAGE || "").split("\n")[0] || null,
        subidoHaSegundos: Math.round(process.uptime()),
        migracoesRegistradas: migracoes.registradas,
        migracoesEsperadas: migracoes.esperadas,
        notasNoBanco: await contarAgendamentos(),
      };
    }),
    /**
     * Importa o acervo do sistema anterior a partir dos CSVs exportados de lá.
     *
     * Existe como rota, e não só como script, porque script exige console do
     * provedor — e o que exige console não é feito. Sem "confirmar" é só
     * simulação: lê, valida e conta, sem gravar. A carga é idempotente por
     * nota, então uma requisição que estoure o tempo pode ser repetida sem
     * duplicar nada.
     */
    importarAcervo: adminProcedure
      .input(
        z.object({
          // O teto acompanha o precedente do envio de XML: recusa limpa do zod
          // em vez de estourar a memória do servidor com um arquivo absurdo.
          consolidado: z.string().min(1, "Envie o relatório consolidado.").max(12_000_000, "O relatório consolidado passa do tamanho aceito."),
          detalhado: z.string().max(12_000_000, "O relatório detalhado passa do tamanho aceito.").nullish(),
          backlog: z.string().max(12_000_000, "O relatório de backlog passa do tamanho aceito.").nullish(),
          confirmar: z.boolean().default(false),
        })
      )
      .mutation(async ({ input }) => {
        // Uma de cada vez. A idempotência da carga é ler-antes-de-escrever, e
        // não um índice único no banco: se o navegador perder a resposta de uma
        // gravação demorada e o administrador clicar de novo, duas execuções
        // simultâneas leriam "ainda não existe" para a mesma nota e gravariam
        // as duas.
        if (importacaoEmCurso) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma importação em andamento. Espere ela terminar." });
        }
        importacaoEmCurso = true;
        try {
          return await importarAcervo(
            {
              consolidado: decodificarCsv(input.consolidado),
              detalhado: input.detalhado ? decodificarCsv(input.detalhado) : null,
              backlog: input.backlog ? decodificarCsv(input.backlog) : null,
            },
            { confirmar: input.confirmar }
          );
        } finally {
          importacaoEmCurso = false;
        }
      }),
  }),
  accessRequests: router({
    listPending: adminProcedure.query(async () => listPendingAccessRequests()),
    decide: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), approve: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        // Guard against an administrator locking themselves out mid-session.
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar o próprio acesso." });
        }
        await setUserAccessStatus({ userId: input.userId, accessStatus: input.approve ? "approved" : "rejected" });
        return { success: true } as const;
      }),
  }),
  messages: router({
    list: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await getAccessibleAppointment(ctx.user, input.appointmentId);
        await markAppointmentMessagesRead({ appointmentId: input.appointmentId, userId: ctx.user.id, isOperator: isSchedulingDesk(ctx.user.role) });
        return listAppointmentMessages(input.appointmentId);
      }),
    send: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), body: z.string().trim().min(1, "Digite uma mensagem.").max(1000) }))
      .mutation(async ({ ctx, input }) => {
        await getAccessibleAppointment(ctx.user, input.appointmentId);
        const id = await createAppointmentMessage({ appointmentId: input.appointmentId, senderId: ctx.user.id, body: input.body.trim(), senderIsOperator: isSchedulingDesk(ctx.user.role) });
        return { id };
      }),
    notifications: protectedProcedure.query(({ ctx }) => listUnreadAppointmentMessages({ userId: ctx.user.id, isOperator: isSchedulingDesk(ctx.user.role) })),
  }),
  reports: router({
    // O relatório de backlog junta o que está na nota com o que só existe no
    // histórico — quando entrou, quando saiu — e com as observações internas.
    // Por isso é montado aqui, e não a partir da lista de agendamentos.
    backlog: protectedProcedure.query(async ({ ctx }) => {
      assertSchedulingDesk(ctx.user.role);
      return listBacklogReportRows();
    }),
  }),
  internalNotes: router({
    list: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        return listAppointmentInternalNotes(input.appointmentId);
      }),
    create: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), body: z.string().trim().min(1, "Escreva a observação.").max(2000) }))
      .mutation(async ({ ctx, input }) => {
        // Internas quer dizer internas: o fornecedor nunca lê esta tabela, e
        // quem não trabalha a agenda também não escreve nela.
        assertSchedulingDesk(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        const id = await createAppointmentInternalNote({ appointmentId: appointment.id, authorId: ctx.user.id, body: input.body.trim() });
        return { id };
      }),
  }),
  calendar: router({
    list: protectedProcedure
      .input(z.object({ start: z.string().datetime(), end: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        assertSchedulingDesk(ctx.user.role);
        const start = new Date(input.start);
        const end = new Date(input.end);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new TRPCError({ code: "BAD_REQUEST", message: "Período inválido." });
        return listAppointmentsBetween(start, end);
      }),
  }),
  attendances: router({
    list: protectedProcedure
      .input(z.object({ status: z.enum(attendanceStatuses).optional(), statuses: z.array(z.enum(attendanceStatuses)).optional(), serviceType: z.enum(attendanceServiceTypes).optional() }).optional())
      .query(async ({ ctx, input }) => {
        assertAttendanceViewer(ctx.user.role);
        return hideDriverDocument(ctx.user.role, await listAttendances(input ?? {}));
      }),
    // O registro do dia é o que a operação de agendamentos consulta para saber
    // quais fornecedores e transportadoras entraram — por isso é o único ponto
    // do pátio aberto a ela.
    dayLog: protectedProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.").optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!canViewAttendances(ctx.user.role) && !isOperator(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Registro restrito às equipes internas." });
        }
        // O dia corrente é o de São Paulo, e não o do relógio do servidor.
        return hideDriverDocument(ctx.user.role, await listAttendancesByDay(input?.date ?? formatSaoPauloDateKey()));
      }),

    // O histórico geral é a consulta que a operação leva para a planilha, então
    // ele pede o período em vez de assumir um: sem as duas datas, a tela não
    // saberia o que está pedindo e o servidor devolveria o banco inteiro.
    report: protectedProcedure
      .input(
        z.object({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD."),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD."),
        })
      )
      .query(async ({ ctx, input }) => {
        if (!canViewGateHistory(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "O histórico do portão é de quem responde pelo pátio." });
        }
        if (input.from > input.to) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A data inicial não pode ser depois da final." });
        }
        return hideDriverDocument(ctx.user.role, await listAttendancesInRange(input.from, input.to));
      }),

    overview: protectedProcedure.query(async ({ ctx }) => {
      assertAttendanceViewer(ctx.user.role);
      return buildAttendanceMetrics(await listAttendances());
    }),
    history: protectedProcedure
      .input(z.object({ attendanceId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        assertAttendanceViewer(ctx.user.role);
        await getExistingAttendance(input.attendanceId);
        return listAttendanceEvents(input.attendanceId);
      }),
    create: protectedProcedure
      .input(
        z.object({
          driverName: z.string().trim().min(3, "Informe o nome do motorista.").max(160),
          driverDocument: z.string().trim().max(32).optional(),
          invoiceNumbers: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
          licensePlate: z.string().trim().min(7, "Informe a placa completa.").max(12),
          supplierName: z.string().trim().max(160).optional(),
          serviceType: z.enum(attendanceServiceTypes),
          classification: z.enum(attendanceClassifications),
          classificationDetail: z.enum(attendanceClassificationDetails),
          notes: z.string().trim().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertPortaria(ctx.user.role);
        if (!isValidClassificationDetail(input.classification, input.classificationDetail)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria informada não corresponde à classificação selecionada." });
        }
        const supplierRule = supplierNameRule(input.serviceType);
        if (supplierRule === "obrigatorio" && !input.supplierName) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o fornecedor." });
        }
        // Onde o campo não aparece na tela, um valor só chegaria por chamada
        // forjada — e gravaria um fornecedor que a Portaria nunca digitou.
        const supplierName = supplierRule === "oculto" ? null : (input.supplierName ?? null);
        return createAttendance({ ...input, supplierName, createdById: ctx.user.id });
      }),
    // Quem decide o recebimento é a Operação: a Portaria registra a chegada e
    // envia o caminhão para a decisão de quem vai receber a carga.
    decideReceipt: protectedProcedure
      .input(z.object({ attendanceId: z.number().int().positive(), decision: z.enum(["aprovar", "recusar"]), refusalReason: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        assertOperacao(ctx.user.role);
        const attendance = await getExistingAttendance(input.attendanceId);
        const invalid = validateEntryDecision(attendance.status, input.decision, input.refusalReason);
        if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: invalid });
        return decideAttendanceEntry({ attendanceId: input.attendanceId, decision: input.decision, refusalReason: input.refusalReason, decisionById: ctx.user.id });
      }),
    // Só o administrador apaga, e o que ele apaga é um registro de teste ou um
    // lançamento errado — por isso a exclusão é definitiva e leva o histórico
    // do protocolo junto, em vez de deixar um evento órfão apontando para nada.
    remove: adminProcedure
      .input(z.object({ attendanceId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const attendance = await getExistingAttendance(input.attendanceId);
        await deleteAttendanceById(attendance.id);
        return { protocol: attendance.protocol } as const;
      }),

    executeAction: protectedProcedure
      .input(
        z.object({
          attendanceId: z.number().int().positive(),
          action: z.enum(["iniciar", "liberar", "concluir"]),
          // A unidade tem duas docas, e informar é opcional: nem toda entrada
          // vai para doca, e o porteiro nem sempre sabe qual na hora de abrir.
          dockNumber: z.union([z.literal(1), z.literal(2)]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canPerformAttendanceAction(ctx.user.role, input.action)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Esta etapa é da ${attendanceActionOwner[input.action]}.`,
          });
        }
        const attendance = await getExistingAttendance(input.attendanceId);
        const invalid = validateOperationalTransition(attendance.status, input.action);
        if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: invalid });
        // A doca só faz sentido na abertura do portão: mandar uma doca junto
        // com a saída gravaria um destino para um caminhão que está indo embora.
        if (input.dockNumber && input.action !== "iniciar") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A doca é informada na liberação da entrada." });
        }
        return executeAttendanceAction({
          attendanceId: input.attendanceId,
          action: input.action,
          operatedById: ctx.user.id,
          dockNumber: input.dockNumber,
        });
      }),
  }),
  staff: router({
    list: adminProcedure.query(async () => listStaffUsers()),
    setRole: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "operator", "portaria", "operacao", "planejador"]) }))
      .mutation(async ({ ctx, input }) => {
        // An administrator changing their own role would drop the only account
        // that can hand the role back.
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar o seu próprio perfil." });
        }
        await assertAnotherAdminRemains(input.userId, input.role !== "admin");
        await setUserRole({ userId: input.userId, role: input.role });
        return { success: true } as const;
      }),

    // Bloquear devolve a conta ao estado de quem não passou pela aprovação: ela
    // continua no sistema, com o histórico intacto e atribuível, mas não entra.
    setAccess: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), allowed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await assertAnotherAdminRemains(input.userId, !input.allowed);
        await setUserAccessStatus({
          userId: input.userId,
          accessStatus: input.allowed ? "approved" : "rejected",
        });
        return { success: true } as const;
      }),
  }),
  analytics: router({
    dashboard: protectedProcedure.input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2100), day: z.number().int().min(1).max(31).optional() })).query(async ({ ctx, input }) => {
      assertSchedulingDesk(ctx.user.role);
      const items = (await listAppointments()).filter(item => item.status !== "backlog");
      return buildDashboardMetrics(items, input);
    }),
  }),
});

export type AppRouter = typeof appRouter;
