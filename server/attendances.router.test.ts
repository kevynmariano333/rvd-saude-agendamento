import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  createAttendance: vi.fn(),
  decideAttendanceEntry: vi.fn(),
  executeAttendanceAction: vi.fn(),
  getAttendanceById: vi.fn(),
  listAttendanceEvents: vi.fn(),
  listAttendances: vi.fn(),
  listStaffUsers: vi.fn(),
  setUserRole: vi.fn(),
}));

vi.mock("./db", () => mocks);
vi.mock("./session", () => ({ clearRvdSession: vi.fn(), createRvdSession: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(role: User["role"], id = 7): TrpcContext {
  const now = new Date();
  const user = {
    id,
    openId: `test-${role}`,
    name: "Teste",
    email: `${role}@example.com`,
    loginMethod: "test",
    passwordHash: null,
    role,
    accessStatus: "approved",
    companyCnpj: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as unknown as User;
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const arrival = {
  driverName: "João da Silva",
  licensePlate: "ABC1D23",
  carrier: "Transportes Exemplo",
  serviceType: "recebimento" as const,
  classification: "amil" as const,
  classificationDetail: "maternidade" as const,
};

function attendance(overrides: Record<string, unknown> = {}) {
  return { id: 1, protocol: "PRT-260901-AB12X", status: "aguardando", ...overrides };
}

describe("procedures da Portaria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAttendances.mockResolvedValue([]);
    mocks.listAttendanceEvents.mockResolvedValue([]);
    mocks.getAttendanceById.mockResolvedValue(attendance());
    mocks.createAttendance.mockResolvedValue(attendance());
    mocks.decideAttendanceEntry.mockResolvedValue(attendance({ status: "aprovado" }));
    mocks.executeAttendanceAction.mockResolvedValue(attendance({ status: "em_atendimento" }));
    mocks.listStaffUsers.mockResolvedValue([]);
  });

  it("registra a chegada quando o perfil é da Portaria", async () => {
    await appRouter.createCaller(context("portaria")).attendances.create(arrival);
    expect(mocks.createAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ licensePlate: "ABC1D23", createdById: 7 })
    );
  });

  it("impede que a Operação registre chegadas", async () => {
    await expect(appRouter.createCaller(context("operacao")).attendances.create(arrival)).rejects.toThrow(
      /Portaria/
    );
    expect(mocks.createAttendance).not.toHaveBeenCalled();
  });

  it("recusa uma categoria que não pertence à classificação", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).attendances.create({ ...arrival, classificationDetail: "sedex" })
    ).rejects.toThrow(/não corresponde à classificação/);
    expect(mocks.createAttendance).not.toHaveBeenCalled();
  });

  it("não decide o recebimento: isso é da Operação", async () => {
    const caller = appRouter.createCaller(context("portaria"));
    await expect(caller.attendances.decideReceipt({ attendanceId: 1, decision: "aprovar" })).rejects.toThrow(
      /Operação/
    );
    expect(mocks.decideAttendanceEntry).not.toHaveBeenCalled();
  });
});

describe("decisão do recebimento pela Operação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAttendanceById.mockResolvedValue(attendance());
    mocks.decideAttendanceEntry.mockResolvedValue(attendance({ status: "aprovado" }));
  });

  it("aceita o recebimento enviado pela Portaria", async () => {
    const caller = appRouter.createCaller(context("operacao"));
    await caller.attendances.decideReceipt({ attendanceId: 1, decision: "aprovar" });
    expect(mocks.decideAttendanceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "aprovar", decisionById: 7 })
    );
  });

  it("exige o motivo para concluir uma recusa", async () => {
    const caller = appRouter.createCaller(context("operacao"));
    await expect(caller.attendances.decideReceipt({ attendanceId: 1, decision: "recusar" })).rejects.toThrow(
      /motivo da recusa é obrigatório/
    );
    expect(mocks.decideAttendanceEntry).not.toHaveBeenCalled();
  });

  it("registra a recusa quando o motivo é informado", async () => {
    const caller = appRouter.createCaller(context("operacao"));
    await caller.attendances.decideReceipt({ attendanceId: 1, decision: "recusar", refusalReason: "Sem espaço na doca" });
    expect(mocks.decideAttendanceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "recusar", refusalReason: "Sem espaço na doca", decisionById: 7 })
    );
  });

  it("não decide duas vezes o mesmo atendimento", async () => {
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "aprovado" }));
    const caller = appRouter.createCaller(context("operacao"));
    await expect(caller.attendances.decideReceipt({ attendanceId: 1, decision: "aprovar" })).rejects.toThrow(
      /aguardando/
    );
  });

  it("responde 404 para um protocolo inexistente", async () => {
    mocks.getAttendanceById.mockResolvedValue(null);
    const caller = appRouter.createCaller(context("operacao"));
    await expect(caller.attendances.decideReceipt({ attendanceId: 99, decision: "aprovar" })).rejects.toThrow(
      /não localizado/
    );
  });
});

describe("procedures da Operação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAttendances.mockResolvedValue([]);
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "aprovado" }));
    mocks.executeAttendanceAction.mockResolvedValue(attendance({ status: "em_atendimento" }));
  });

  it("inicia um atendimento aprovado", async () => {
    await appRouter.createCaller(context("operacao")).attendances.executeAction({ attendanceId: 1, action: "iniciar" });
    expect(mocks.executeAttendanceAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "iniciar", operatedById: 7 })
    );
  });

  it("impede que a Portaria conduza o pátio", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).attendances.executeAction({ attendanceId: 1, action: "iniciar" })
    ).rejects.toThrow(/Operação/);
    expect(mocks.executeAttendanceAction).not.toHaveBeenCalled();
  });

  it("bloqueia uma ação fora da ordem do fluxo", async () => {
    await expect(
      appRouter.createCaller(context("operacao")).attendances.executeAction({ attendanceId: 1, action: "liberar" })
    ).rejects.toThrow(/não está disponível para o status atual/);
  });

  it("deixa o administrador atuar nos dois lados", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await caller.attendances.executeAction({ attendanceId: 1, action: "iniciar" });
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "aguardando" }));
    await caller.attendances.decideReceipt({ attendanceId: 1, decision: "aprovar" });
    expect(mocks.executeAttendanceAction).toHaveBeenCalled();
    expect(mocks.decideAttendanceEntry).toHaveBeenCalled();
  });
});

describe("visibilidade do pátio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAttendances.mockResolvedValue([
      { status: "aguardando", serviceType: "coleta", arrivalAt: new Date() },
      { status: "aprovado", serviceType: "recebimento", arrivalAt: new Date() },
    ]);
    mocks.listAttendanceEvents.mockResolvedValue([]);
    mocks.getAttendanceById.mockResolvedValue(attendance());
  });

  it("mantém o fornecedor fora da fila e do histórico", async () => {
    const caller = appRouter.createCaller(context("supplier", 12));
    await expect(caller.attendances.list({})).rejects.toThrow(/Portaria e da Operação/);
    await expect(caller.attendances.history({ attendanceId: 1 })).rejects.toThrow(/Portaria e da Operação/);
    await expect(caller.attendances.overview()).rejects.toThrow(/Portaria e da Operação/);
  });

  // Cada perfil no seu posto: quem cuida de agendamentos tem a própria agenda e
  // não enxerga o pátio.
  it("mantém o operador de agendamentos fora do pátio", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await expect(caller.attendances.list({})).rejects.toThrow(/Portaria e da Operação/);
    await expect(caller.attendances.overview()).rejects.toThrow(/Portaria e da Operação/);
    await expect(caller.attendances.create(arrival)).rejects.toThrow(/Portaria/);
    await expect(caller.attendances.executeAction({ attendanceId: 1, action: "iniciar" })).rejects.toThrow(/Operação/);
  });

  it("deixa Portaria, Operação e administrador lerem a fila", async () => {
    for (const role of ["portaria", "operacao", "admin"] as const) {
      await expect(appRouter.createCaller(context(role)).attendances.list({})).resolves.toHaveLength(2);
    }
  });

  it("resume a fila em indicadores", async () => {
    const overview = await appRouter.createCaller(context("portaria")).attendances.overview();
    expect(overview).toMatchObject({ awaiting: 1, approved: 1, collections: 1, receipts: 1 });
  });
});

describe("perfis internos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listStaffUsers.mockResolvedValue([]);
  });

  it("permite ao administrador mover alguém para a Portaria", async () => {
    await appRouter.createCaller(context("admin")).staff.setRole({ userId: 31, role: "portaria" });
    expect(mocks.setUserRole).toHaveBeenCalledWith({ userId: 31, role: "portaria" });
  });

  it("impede o administrador de rebaixar a própria conta", async () => {
    await expect(
      appRouter.createCaller(context("admin", 7)).staff.setRole({ userId: 7, role: "operacao" })
    ).rejects.toThrow(/próprio perfil/);
    expect(mocks.setUserRole).not.toHaveBeenCalled();
  });

  it("mantém a gestão de perfis restrita ao administrador", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).staff.setRole({ userId: 31, role: "operacao" })
    ).rejects.toThrow();
    expect(mocks.setUserRole).not.toHaveBeenCalled();
  });
});
