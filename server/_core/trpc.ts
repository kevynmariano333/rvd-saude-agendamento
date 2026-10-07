import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '../../shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";

/**
 * O que a pessoa lê quando a validação recusa o formulário.
 *
 * Sem isto, o tRPC manda a lista de erros do zod serializada, e a tela
 * imprime ela crua. Um fornecedor tentando se cadastrar via, em cima do
 * botão, um bloco começando em `[ { "origin": "string", "code":
 * "invalid_format", "pattern": "/^(?!\\.)..."` — a expressão regular
 * inteira do e-mail. Ele não tem como saber que faltava tirar um espaço.
 *
 * Cada campo já tem a sua frase escrita no esquema; o que faltava era
 * entregá-la. Quando mais de um campo falha, vão todas, separadas por ponto:
 * corrigir um erro por vez e levar outro de volta é pior do que ler dois.
 */
const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const problemas = error.cause instanceof ZodError ? error.cause.issues : null;
    if (!problemas?.length) return shape;
    const frases = Array.from(new Set(problemas.map(problema => problema.message).filter(Boolean)));
    return { ...shape, message: frases.join(" ") || shape.message };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Checked on every request, not only at sign-in: revoking an approval has to
  // take effect at once, and a session cookie already issued would otherwise
  // keep working until it expired.
  if (ctx.user.accessStatus && ctx.user.accessStatus !== "approved") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        ctx.user.accessStatus === "pending"
          ? "Seu acesso ainda está em análise pelo Operador."
          : "Seu acesso a esta empresa não foi autorizado. Fale com o Operador.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
