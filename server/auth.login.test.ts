import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  getUserByOpenId: vi.fn(),
  getUserById: vi.fn(),
  createLocalUser: vi.fn(),
  touchUserSignIn: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("./db", () => mocks);
vi.mock("./session", () => ({ clearRvdSession: vi.fn(), createRvdSession: vi.fn(), getRvdSessionUser: vi.fn() }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const SENHA = "senha-de-teste";

function hash(senha: string, salt = "saldeteste123456") {
  return `${salt}:${scryptSync(senha, salt, 64).toString("hex")}`;
}

function conta(role: User["role"]): User {
  const agora = new Date();
  return { id: 30, openId: `rvd-${role}`, name: "Conta interna", email: "interno@rvdsaude.com.br", loginMethod: "rvd-password", passwordHash: hash(SENHA), role, accessStatus: "approved", companyName: null, companyCnpj: null, createdAt: agora, updatedAt: agora, lastSignedIn: agora } as User;
}

function context(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"] };
}

describe("entrada dos perfis internos", () => {
  beforeEach(() => vi.clearAllMocks());

  // Planejador e Operação não têm porta própria na tela de entrada: o
  // administrador os atribui depois do cadastro, feito pela porta do Operador.
  // Se a porta deixasse de reconhecê-los, promover alguém seria trancá-lo fora.
  for (const role of ["planejador", "operacao"] as const) {
    it(`deixa o perfil ${role} entrar pela porta do Operador`, async () => {
      mocks.getUserByEmail.mockResolvedValue(conta(role));
      const caller = appRouter.createCaller(context());
      const entrou = await caller.auth.login({ email: "interno@rvdsaude.com.br", password: SENHA, profile: "operator" });
      expect(entrou).toMatchObject({ id: 30, role });
    });
  }

  it("não deixa um perfil interno entrar pela porta do fornecedor", async () => {
    mocks.getUserByEmail.mockResolvedValue(conta("planejador"));
    const caller = appRouter.createCaller(context());
    await expect(caller.auth.login({ email: "interno@rvdsaude.com.br", password: SENHA, profile: "supplier" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("recusa a senha errada antes de qualquer outra coisa", async () => {
    mocks.getUserByEmail.mockResolvedValue(conta("planejador"));
    const caller = appRouter.createCaller(context());
    await expect(caller.auth.login({ email: "interno@rvdsaude.com.br", password: "outra", profile: "operator" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
