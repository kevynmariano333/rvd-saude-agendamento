import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appointmentStatuses, type AppointmentStatus } from "../drizzle/schema";
import {
  type AppointmentFilters,
  createAppointment,
  createLocalUser,
  getAppointmentById,
  getUserByEmail,
  listAppointmentHistory,
  listAppointments,
  touchUserSignIn,
  updateAppointmentStatus,
} from "./db";
import { canRequestAppointment, canTransitionAppointment, isOperator } from "./permissions";
import { clearRvdSession, createRvdSession } from "./session";
import { systemRouter } from "./_core/systemRouter";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "../shared/const";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";

const localProfileSchema = z.enum(["operator", "supplier"]);
const statusSchema = z.enum(appointmentStatuses);

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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? publicUser(ctx.user) : null)),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email("Informe um e-mail válido."),
          password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres."),
          profile: localProfileSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        const existing = await getUserByEmail(email);
        let user;

        if (existing) {
          const profileAllowed = existing.role === input.profile || (existing.role === "admin" && input.profile === "operator");
          if (!profileAllowed || !existing.passwordHash || !passwordMatches(input.password, existing.passwordHash)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail, senha ou perfil não conferem." });
          }
          await touchUserSignIn(existing.id);
          user = existing;
        } else {
          user = await createLocalUser({
            email,
            role: input.profile,
            passwordHash: hashPassword(input.password),
          });
        }

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
    list: protectedProcedure
      .input(z.object({ date: z.string().optional(), status: statusSchema.optional() }).optional())
      .query(async ({ ctx, input }) => {
        const filters: AppointmentFilters = { date: input?.date, status: input?.status as AppointmentStatus | undefined };
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
    updateStatus: protectedProcedure
      .input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(["approved", "rejected", "completed"]) }))
      .mutation(async ({ ctx, input }) => {
        assertOperator(ctx.user.role);
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (!canTransitionAppointment(appointment.status, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Essa alteração de status não é permitida." });
        }
        return updateAppointmentStatus({ ...input, previousStatus: appointment.status, handledBy: ctx.user.id });
      }),
  }),
});

export type AppRouter = typeof appRouter;
