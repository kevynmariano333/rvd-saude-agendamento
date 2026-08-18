import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  createAppointment: vi.fn(),
  getAppointmentById: vi.fn(),
  getUserByEmail: vi.fn(),
  listAppointmentHistory: vi.fn(),
  listAppointments: vi.fn(),
  touchUserSignIn: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  createLocalUser: vi.fn(),
  scheduleAppointment: vi.fn(),
  createUnscheduledReceipt: vi.fn(),
}));

vi.mock("./db", () => mocks);
vi.mock("./session", () => ({
  clearRvdSession: vi.fn(),
  createRvdSession: vi.fn(),
}));
vi.mock("./storage", () => ({ storagePut: vi.fn().mockResolvedValue({ key: "recebimentos-avulsos/teste.xml", url: "https://storage.example/recebimentos-avulsos/teste.xml" }) }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function user(role: User["role"]): User {
  const now = new Date();
  return { id: role === "supplier" ? 12 : 24, openId: `test-${role}`, name: "Teste", email: `${role}@example.com`, loginMethod: "test", passwordHash: null, role, createdAt: now, updatedAt: now, lastSignedIn: now };
}

function context(role: User["role"]): TrpcContext {
  return { user: user(role), req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"] };
}

describe("procedures de agendamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAppointment.mockResolvedValue({ id: 1, status: "pending" });
    mocks.listAppointmentHistory.mockResolvedValue([]);
    mocks.listAppointments.mockResolvedValue([]);
  });

  it("permite que o fornecedor crie uma solicitação própria", async () => {
    const caller = appRouter.createCaller(context("supplier"));
    await caller.appointments.create({ serviceType: "Consulta", scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), notes: "Preferência pela manhã" });
    expect(mocks.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 12, serviceType: "Consulta" }));
  });

  it("bloqueia a criação de solicitações pelo operador", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await expect(caller.appointments.create({ serviceType: "Consulta", scheduledFor: new Date(Date.now() + 86_400_000).toISOString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("aplica o escopo do fornecedor ao listar agendamentos", async () => {
    const caller = appRouter.createCaller(context("supplier"));
    await caller.appointments.list({ status: "pending" });
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 12, status: "pending" }));
  });

  it("encaminha os filtros de nota, fornecedor e CNPJ ao operador", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.list({ invoiceNumber: "987654", supplierName: "Fornecedor XML", recipientCnpj: "12.345.678/0001-99" });
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ invoiceNumber: "987654", supplierName: "Fornecedor XML", recipientCnpj: "12.345.678/0001-99" }));
  });

  it("permite que o fornecedor consulte somente o histórico do próprio agendamento", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, supplierId: 12, status: "pending" });
    const caller = appRouter.createCaller(context("supplier"));
    await caller.appointments.history({ appointmentId: 1 });
    expect(mocks.listAppointmentHistory).toHaveBeenCalledWith(1);
  });

  it("bloqueia o histórico de outro fornecedor", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, supplierId: 99, status: "pending" });
    const caller = appRouter.createCaller(context("supplier"));
    await expect(caller.appointments.history({ appointmentId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("recusa uma transição que não é permitida", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, status: "pending" });
    const caller = appRouter.createCaller(context("operator"));
    await expect(caller.appointments.updateStatus({ appointmentId: 1, status: "completed" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("registra uma transição válida com o responsável operacional", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, status: "pending" });
    mocks.updateAppointmentStatus.mockResolvedValue({ id: 1, status: "scheduled" });
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.updateStatus({ appointmentId: 1, status: "scheduled" });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 1, status: "scheduled", previousStatus: "pending", handledBy: 24 }));
  });

  it("registra as datas anterior e nova quando o operador reagenda", async () => {
    const previousScheduledFor = new Date("2030-09-01T09:00:00.000Z");
    mocks.getAppointmentById.mockResolvedValue({ id: 1, status: "scheduled", scheduledFor: previousScheduledFor });
    mocks.scheduleAppointment.mockResolvedValue({ id: 1, status: "scheduled" });
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.schedule({ appointmentId: 1, scheduledFor: "2030-09-01T10:00:00.000Z" });
    expect(mocks.scheduleAppointment).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 1, previousScheduledFor, scheduledFor: new Date("2030-09-01T10:00:00.000Z"), rescheduled: true }));
  });

  it("permite ao operador registrar um recebimento avulso pelo XML", async () => {
    mocks.createUnscheduledReceipt.mockResolvedValue({ id: 9, status: "received" });
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>987654</nNF></ide><emit><xNome>Fornecedor XML</xNome></emit><dest><CNPJ>12.345.678/0001-99</CNPJ></dest><det><prod><xProd>Recebimento avulso</xProd></prod></det></infNFe></NFe>').toString("base64");
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.registerUnscheduledReceipt({ fileName: "nota.xml", xmlBase64: xml });
    expect(mocks.createUnscheduledReceipt).toHaveBeenCalledWith(expect.objectContaining({ operatorId: 24, invoiceNumber: "987654", invoiceSupplierName: "Fornecedor XML", recipientCnpj: "12345678000199" }));
  });
});
