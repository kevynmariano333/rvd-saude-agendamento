import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  createAppointment: vi.fn(),
  createAppointmentSuggestion: vi.fn(),
  createAppointmentMessage: vi.fn(),
  confirmAppointmentPreNote: vi.fn(),
  getAppointmentById: vi.fn(),
  getSuggestionById: vi.fn(),
  getUserByCompanyCnpj: vi.fn(),
  getUserByEmail: vi.fn(),
  listAppointmentHistory: vi.fn(),
  listAppointmentMessages: vi.fn(),
  listAppointments: vi.fn(),
  listAppointmentSuggestions: vi.fn(),
  listUnreadAppointmentMessages: vi.fn(),
  markAppointmentMessagesRead: vi.fn(),
  touchUserSignIn: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  createLocalUser: vi.fn(),
  deleteAppointmentById: vi.fn(),
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
    mocks.confirmAppointmentPreNote.mockResolvedValue({ id: 1, status: "scheduled", preNoteConfirmedAt: new Date() });
    mocks.listAppointmentHistory.mockResolvedValue([]);
    mocks.listAppointmentMessages.mockResolvedValue([]);
    mocks.listAppointments.mockResolvedValue([]);
    mocks.listAppointmentSuggestions.mockResolvedValue([]);
  });

  it("permite que o fornecedor crie uma solicitação própria", async () => {
    const caller = appRouter.createCaller(context("supplier"));
    await caller.appointments.create({ serviceType: "Consulta", scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), notes: "Preferência pela manhã" });
    expect(mocks.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 12, serviceType: "Consulta" }));
  });

  it("permite o cadastro autônomo de um fornecedor", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);
    mocks.getUserByCompanyCnpj.mockResolvedValue(undefined);
    mocks.createLocalUser.mockResolvedValue(user("supplier"));
    const caller = appRouter.createCaller(context("supplier"));
    await caller.auth.registerSupplier({ companyName: "Fornecedor Exemplo", companyCnpj: "12.345.678/0001-99", email: "novo@fornecedor.com", password: "senha123" });
    expect(mocks.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({ name: "Fornecedor Exemplo", companyName: "Fornecedor Exemplo", companyCnpj: "12345678000199", email: "novo@fornecedor.com", role: "supplier" }));
  });

  it("permite o cadastro de operador sem exigir CNPJ", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);
    mocks.createLocalUser.mockResolvedValue(user("operator"));
    const caller = appRouter.createCaller(context("supplier"));
    await caller.auth.register({ profile: "operator", name: "Operador Exemplo", email: "novo@operador.com", password: "senha123" });
    expect(mocks.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({ name: "Operador Exemplo", email: "novo@operador.com", role: "operator", companyName: undefined, companyCnpj: undefined }));
  });

  it("restringe a exclusão definitiva de nota ao Administrador", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 71, supplierId: 12, status: "received" });
    const operatorCaller = appRouter.createCaller(context("operator"));
    await expect(operatorCaller.appointments.delete({ appointmentId: 71 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = appRouter.createCaller(context("admin"));
    await adminCaller.appointments.delete({ appointmentId: 71 });
    expect(mocks.deleteAppointmentById).toHaveBeenCalledWith(71);
  });

  it("provisiona o acesso de teste admin para operador e fornecedor conforme o perfil", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);
    mocks.createLocalUser.mockResolvedValue(user("operator"));
    const operatorCaller = appRouter.createCaller(context("supplier"));
    await operatorCaller.auth.login({ email: "admin", password: "admin", profile: "operator" });
    expect(mocks.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({ email: "teste.operador@rvdsaude.local", role: "admin", name: "Operador de Teste RVD Saúde" }));

    mocks.createLocalUser.mockResolvedValue(user("supplier"));
    const supplierCaller = appRouter.createCaller(context("operator"));
    await supplierCaller.auth.login({ email: "admin", password: "admin", profile: "supplier" });
    expect(mocks.createLocalUser).toHaveBeenLastCalledWith(expect.objectContaining({ email: "teste.fornecedor@rvdsaude.local", role: "supplier", companyCnpj: "00000000000000" }));
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

  it("permite ao operador filtrar sugestões pelo agendamento no histórico de datas", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await caller.suggestions.list({ appointmentId: 1 });
    expect(mocks.listAppointmentSuggestions).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 1 }));
  });

  it("permite ao fornecedor sugerir novo horário para um item agendado", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, supplierId: 12, status: "scheduled" });
    mocks.createAppointmentSuggestion.mockResolvedValue({ id: 8, status: "pending" });
    const caller = appRouter.createCaller(context("supplier"));
    await caller.suggestions.create({ appointmentId: 1, suggestedFor: "2030-09-01T10:00:00.000Z", notes: "Prefiro este horário" });
    expect(mocks.createAppointmentSuggestion).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 1, supplierId: 12, notes: "Prefiro este horário" }));
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

  it("registra a confirmação de recebimento com o responsável operacional", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, status: "scheduled" });
    mocks.updateAppointmentStatus.mockResolvedValue({ id: 1, status: "received", receivedAt: new Date() });
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.updateStatus({ appointmentId: 1, status: "received" });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 1, status: "received", previousStatus: "scheduled", handledBy: 24, eventNote: "Recebimento confirmado pelo operador." }));
  });

  it("permite ao operador confirmar a pré-nota e registra o responsável", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, status: "scheduled", preNoteConfirmedAt: null });
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.confirmPreNote({ appointmentId: 1 });
    expect(mocks.confirmAppointmentPreNote).toHaveBeenCalledWith({ appointmentId: 1, status: "scheduled", operatorId: 24 });
  });

  it("registra as datas anterior e nova quando o operador reagenda", async () => {
    const previousScheduledFor = new Date("2030-09-01T09:00:00.000Z");
    mocks.getAppointmentById.mockResolvedValue({ id: 1, status: "scheduled", scheduledFor: previousScheduledFor });
    mocks.scheduleAppointment.mockResolvedValue({ id: 1, status: "scheduled" });
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.schedule({ appointmentId: 1, scheduledFor: "2030-09-01T10:00:00.000Z" });
    expect(mocks.scheduleAppointment).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 1, previousScheduledFor, scheduledFor: new Date("2030-09-01T10:00:00.000Z"), rescheduled: true }));
  });

  it("confirma o agendamento e registra a sugestão aceita", async () => {
    const previousScheduledFor = new Date("2030-09-01T09:00:00.000Z");
    mocks.getAppointmentById.mockResolvedValue({ id: 1, status: "pending", scheduledFor: previousScheduledFor });
    mocks.getSuggestionById.mockResolvedValue({ id: 5, appointmentId: 1, status: "pending" });
    mocks.scheduleAppointment.mockResolvedValue({ id: 1, status: "scheduled" });
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.schedule({ appointmentId: 1, scheduledFor: "2030-09-01T10:00:00.000Z", acceptedSuggestionId: 5 });
    expect(mocks.scheduleAppointment).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 1, acceptedSuggestionId: 5, scheduledFor: new Date("2030-09-01T10:00:00.000Z") }));
  });

  it("permite ao operador registrar um recebimento avulso pelo XML", async () => {
    mocks.createUnscheduledReceipt.mockResolvedValue({ id: 9, status: "received" });
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>987654</nNF></ide><emit><xNome>Fornecedor XML</xNome></emit><dest><CNPJ>12.345.678/0001-99</CNPJ></dest><det><prod><xProd>Recebimento avulso</xProd></prod></det></infNFe></NFe>').toString("base64");
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.registerUnscheduledReceipt({ fileName: "nota.xml", xmlBase64: xml });
    expect(mocks.createUnscheduledReceipt).toHaveBeenCalledWith(expect.objectContaining({ operatorId: 24, invoiceNumber: "987654", invoiceSupplierName: "Fornecedor XML", recipientCnpj: "12345678000199" }));
  });

  it("permite que o fornecedor envie uma mensagem no próprio agendamento", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, supplierId: 12, status: "scheduled" });
    mocks.createAppointmentMessage.mockResolvedValue(17);
    const caller = appRouter.createCaller(context("supplier"));
    await caller.messages.send({ appointmentId: 1, body: "Posso antecipar a entrega?" });
    expect(mocks.createAppointmentMessage).toHaveBeenCalledWith({ appointmentId: 1, senderId: 12, body: "Posso antecipar a entrega?", senderIsOperator: false });
  });

  it("bloqueia o chat de um agendamento que não pertence ao fornecedor", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, supplierId: 99, status: "scheduled" });
    const caller = appRouter.createCaller(context("supplier"));
    await expect(caller.messages.list({ appointmentId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marca mensagens como lidas e entrega as notificações do perfil atual", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 1, supplierId: 12, status: "scheduled" });
    mocks.listUnreadAppointmentMessages.mockResolvedValue([]);
    const caller = appRouter.createCaller(context("operator"));
    await caller.messages.list({ appointmentId: 1 });
    await caller.messages.notifications();
    expect(mocks.markAppointmentMessagesRead).toHaveBeenCalledWith({ appointmentId: 1, userId: 24, isOperator: true });
    expect(mocks.listUnreadAppointmentMessages).toHaveBeenCalledWith({ userId: 24, isOperator: true });
  });
});
