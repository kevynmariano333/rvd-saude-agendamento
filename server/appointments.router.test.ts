import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  createAppointment: vi.fn(),
  createAppointmentSuggestion: vi.fn(),
  createManualXmlAppointment: vi.fn(),
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
  returnAppointmentForRescheduling: vi.fn(),
  touchUserSignIn: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  treatBacklogAppointment: vi.fn(),
  listAppointmentInternalNotes: vi.fn(),
  createAppointmentInternalNote: vi.fn(),
  createLocalUser: vi.fn(),
  deleteAppointmentById: vi.fn(),
  scheduleAppointment: vi.fn(),
  createUnscheduledReceipt: vi.fn(),
  listApprovedCompanyUserIds: vi.fn(),
  listPendingAccessRequests: vi.fn(),
  setUserAccessStatus: vi.fn(),
  updateUserName: vi.fn(),
  createAttendance: vi.fn(),
  decideAttendanceEntry: vi.fn(),
  executeAttendanceAction: vi.fn(),
  getAttendanceById: vi.fn(),
  listAttendanceEvents: vi.fn(),
  listAttendances: vi.fn(),
  listAttendancesInRange: vi.fn(),
  listStaffUsers: vi.fn(),
  setUserRole: vi.fn(),
}));

vi.mock("./db", () => mocks);
vi.mock("./session", () => ({
  clearRvdSession: vi.fn(),
  createRvdSession: vi.fn(),
}));
vi.mock("./storage", () => ({ storagePut: vi.fn().mockResolvedValue({ key: "recebimentos-avulsos/teste.xml", url: "https://storage.example/recebimentos-avulsos/teste.xml" }) }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function user(role: User["role"], companyCnpj: string | null = null): User {
  const now = new Date();
  return { id: role === "supplier" ? 12 : 24, openId: `test-${role}`, name: "Teste", email: `${role}@example.com`, loginMethod: "test", passwordHash: null, role, companyCnpj, createdAt: now, updatedAt: now, lastSignedIn: now } as User;
}

function context(role: User["role"], companyCnpj: string | null = null): TrpcContext {
  return { user: user(role, companyCnpj), req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"] };
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
    mocks.listApprovedCompanyUserIds.mockResolvedValue([]);
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

  it("permite somente ao Administrador retornar nota recebida para novo agendamento", async () => {
    const scheduledFor = new Date("2030-09-01T10:00:00.000Z");
    mocks.getAppointmentById.mockResolvedValue({ id: 72, supplierId: 12, status: "received", scheduledFor });
    mocks.returnAppointmentForRescheduling.mockResolvedValue({ id: 72, status: "scheduled" });

    const operatorCaller = appRouter.createCaller(context("operator"));
    await expect(operatorCaller.appointments.returnForRescheduling({ appointmentId: 72 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = appRouter.createCaller(context("admin"));
    await adminCaller.appointments.returnForRescheduling({ appointmentId: 72 });
    expect(mocks.returnAppointmentForRescheduling).toHaveBeenCalledWith({ appointmentId: 72, previousStatus: "received", previousScheduledFor: scheduledFor, handledBy: 24 });
  });

  it("impede retorno administrativo para novo agendamento fora de Recebido ou Concluído", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 73, supplierId: 12, status: "scheduled", scheduledFor: new Date("2030-09-01T10:00:00.000Z") });
    const adminCaller = appRouter.createCaller(context("admin"));
    await expect(adminCaller.appointments.returnForRescheduling({ appointmentId: 73 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.returnAppointmentForRescheduling).not.toHaveBeenCalled();
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
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [12], status: "pending" }));
  });

  it("mostra ao fornecedor os agendamentos dos demais logins do mesmo CNPJ", async () => {
    mocks.listApprovedCompanyUserIds.mockResolvedValue([12, 31]);
    const caller = appRouter.createCaller(context("supplier", "06.033.403/0001-13"));
    await caller.appointments.list();
    expect(mocks.listApprovedCompanyUserIds).toHaveBeenCalledWith("06033403000113");
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [12, 31] }));
  });

  it("não agrupa logins sem CNPJ utilizável", async () => {
    const caller = appRouter.createCaller(context("supplier", "00000000000000"));
    await caller.appointments.list();
    expect(mocks.listApprovedCompanyUserIds).not.toHaveBeenCalled();
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [12] }));
  });

  it("recusa o histórico de um agendamento de outra empresa", async () => {
    mocks.listApprovedCompanyUserIds.mockResolvedValue([12, 31]);
    mocks.getAppointmentById.mockResolvedValue({ id: 5, supplierId: 99, status: "pending" });
    const caller = appRouter.createCaller(context("supplier", "06.033.403/0001-13"));
    await expect(caller.appointments.history({ appointmentId: 5 })).rejects.toThrow(/não pode consultar o histórico/);
  });

  it("libera o histórico de um agendamento de um colega do mesmo CNPJ", async () => {
    mocks.listApprovedCompanyUserIds.mockResolvedValue([12, 31]);
    mocks.getAppointmentById.mockResolvedValue({ id: 5, supplierId: 31, status: "pending" });
    const caller = appRouter.createCaller(context("supplier", "06.033.403/0001-13"));
    await caller.appointments.history({ appointmentId: 5 });
    expect(mocks.listAppointmentHistory).toHaveBeenCalledWith(5);
  });

  it("recusa que fornecedor e operador decidam aprovações de acesso", async () => {
    for (const role of ["supplier", "operator"] as const) {
      const caller = appRouter.createCaller(context(role));
      await expect(caller.accessRequests.decide({ userId: 31, approve: true })).rejects.toThrow();
      await expect(caller.accessRequests.listPending()).rejects.toThrow();
    }
    expect(mocks.setUserAccessStatus).not.toHaveBeenCalled();
  });

  it("permite ao admin aprovar e recusar um acesso", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await caller.accessRequests.decide({ userId: 31, approve: true });
    expect(mocks.setUserAccessStatus).toHaveBeenCalledWith({ userId: 31, accessStatus: "approved" });
    await caller.accessRequests.decide({ userId: 32, approve: false });
    expect(mocks.setUserAccessStatus).toHaveBeenCalledWith({ userId: 32, accessStatus: "rejected" });
  });

  it("impede o admin de alterar o próprio acesso", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.accessRequests.decide({ userId: 24, approve: false })).rejects.toThrow(/próprio acesso/);
    expect(mocks.setUserAccessStatus).not.toHaveBeenCalled();
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

  it("permite ao fornecedor emitir o PDF de uma nota agendada", async () => {
    const scheduledFor = new Date("2030-09-01T13:37:00.000Z");
    mocks.getAppointmentById.mockResolvedValue({ id: 1, supplierId: 12, status: "scheduled", scheduledFor, updatedAt: scheduledFor });
    mocks.listAppointmentHistory.mockResolvedValue([{ nextStatus: "scheduled", createdAt: scheduledFor, handlerName: "Operador RVD", handlerEmail: "operador@rvdsaude.com.br" }]);
    const caller = appRouter.createCaller(context("supplier"));
    const result = await caller.appointments.receiptCertificate({ appointmentId: 1 });
    expect(result).toMatchObject({ confirmedByName: "Operador RVD", confirmedByLogin: "operador@rvdsaude.com.br", scheduledFor });
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

  it("permite ao fornecedor enviar XML com sugestão opcional de data e horário", async () => {
    mocks.createManualXmlAppointment.mockResolvedValue({ id: 11, status: "pending" });
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>123456</nNF></ide><emit><xNome>Fornecedor XML</xNome></emit><dest><CNPJ>12.345.678/0001-99</CNPJ></dest></infNFe></NFe>').toString("base64");
    const caller = appRouter.createCaller(context("supplier"));
    await caller.appointments.createManualXml({ fileName: "nota.xml", xmlBase64: xml, purchaseOrder: "4504748409", suggestedFor: "2030-09-01T10:00:00.000Z", suggestionNotes: "Preferência pela manhã" });
    expect(mocks.createManualXmlAppointment).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 12, purchaseOrder: "4504748409", suggestedFor: new Date("2030-09-01T10:00:00.000Z"), suggestionNotes: "Preferência pela manhã" }));
  });

  it("recusa o envio do fornecedor sem pedido de compra", async () => {
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>123456</nNF></ide></infNFe></NFe>').toString("base64");
    const caller = appRouter.createCaller(context("supplier"));
    // Só espaço passa pelo tamanho mínimo do schema, então a checagem precisa
    // existir também depois da normalização.
    await expect(caller.appointments.createManualXml({ fileName: "nota.xml", xmlBase64: xml, purchaseOrder: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createManualXmlAppointment).not.toHaveBeenCalled();
  });

  it("grava o pedido que o fornecedor digitou, e não o que veio no XML", async () => {
    mocks.createManualXmlAppointment.mockResolvedValue({ id: 12, status: "pending" });
    // O xPed do XML costuma vir de outro sistema do fornecedor e nem sempre é o
    // pedido da RVD; quem responde pela nota é quem a envia.
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>123456</nNF></ide><det><prod><xPed>PEDIDO-INTERNO-9</xPed></prod></det></infNFe></NFe>').toString("base64");
    const caller = appRouter.createCaller(context("supplier"));
    await caller.appointments.createManualXml({ fileName: "nota.xml", xmlBase64: xml, purchaseOrder: " 4504748409 " });
    expect(mocks.createManualXmlAppointment).toHaveBeenCalledWith(expect.objectContaining({ purchaseOrder: "4504748409" }));
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

describe("comprovante de entrega e os perfis de pátio", () => {
  const scheduledFor = new Date("2030-09-01T13:37:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listApprovedCompanyUserIds.mockResolvedValue([]);
    mocks.listAppointmentHistory.mockResolvedValue([]);
    mocks.getAppointmentById.mockResolvedValue({
      id: 77,
      supplierId: 12,
      status: "scheduled",
      scheduledFor,
      updatedAt: scheduledFor,
      invoiceNumber: "NF-5676",
      invoiceAccessKey: "35200000000000000000000000000000000000000000",
      recipientCnpj: "12345678000199",
      invoiceTotalCents: 3977800,
    });
  });

  // O comprovante carrega os dados fiscais da nota e um token de validação
  // assinado. Portaria e Operação não participam do fluxo de agendamento e não
  // podem emiti-lo para a nota de um fornecedor qualquer.
  it("recusa a emissão pelos perfis de Portaria e Operação", async () => {
    for (const role of ["portaria", "operacao"] as const) {
      await expect(
        appRouter.createCaller(context(role)).appointments.receiptCertificate({ appointmentId: 77 })
      ).rejects.toThrow(/não pode emitir este comprovante/);
    }
  });

  it("permite a emissão pelo operador de agendamentos", async () => {
    const result = await appRouter.createCaller(context("operator")).appointments.receiptCertificate({ appointmentId: 77 });
    expect(result.appointment.invoiceNumber).toBe("NF-5676");
    expect(typeof result.validationToken).toBe("string");
  });

  it("permite a emissão pelo fornecedor dono da nota e recusa a de outro", async () => {
    const owner = { ...user("supplier"), id: 12 };
    const ownerContext = { ...context("supplier"), user: owner };
    await expect(appRouter.createCaller(ownerContext).appointments.receiptCertificate({ appointmentId: 77 })).resolves.toMatchObject({
      appointment: { invoiceNumber: "NF-5676" },
    });

    const stranger = { ...user("supplier"), id: 999 };
    const strangerContext = { ...context("supplier"), user: stranger };
    await expect(
      appRouter.createCaller(strangerContext).appointments.receiptCertificate({ appointmentId: 77 })
    ).rejects.toThrow(/não pode emitir este comprovante/);
  });

  it("mantém os perfis de pátio fora da agenda, do histórico e das mensagens", async () => {
    mocks.listAppointments.mockResolvedValue([]);
    const caller = appRouter.createCaller(context("portaria"));

    // A listagem cai no ramo escopado: o filtro leva o próprio id, que nunca é
    // o supplierId de uma nota.
    await caller.appointments.list();
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [24] }));

    await expect(caller.appointments.history({ appointmentId: 77 })).rejects.toThrow(/não pode consultar o histórico/);
    await expect(caller.messages.list({ appointmentId: 77 })).rejects.toThrow(/não pode acessar as mensagens/);
  });
});

describe("nome da conta", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deixa a pessoa corrigir o próprio nome", async () => {
    await appRouter.createCaller(context("operator")).auth.updateName({ name: "  Kevyn Mariano  " });
    expect(mocks.updateUserName).toHaveBeenCalledWith({ userId: 24, name: "Kevyn Mariano" });
  });

  it("recusa um nome vazio", async () => {
    await expect(
      appRouter.createCaller(context("operator")).auth.updateName({ name: " " })
    ).rejects.toThrow();
    expect(mocks.updateUserName).not.toHaveBeenCalled();
  });

  // O nome é do dono da sessão: não há como alterar o de outra conta por aqui.
  it("altera apenas a conta autenticada", async () => {
    await appRouter.createCaller(context("supplier")).auth.updateName({ name: "Outro Nome" });
    expect(mocks.updateUserName).toHaveBeenCalledWith({ userId: 12, name: "Outro Nome" });
  });
});

describe("perfil planejador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAppointments.mockResolvedValue([]);
    mocks.listAppointmentSuggestions.mockResolvedValue([]);
    mocks.listApprovedCompanyUserIds.mockResolvedValue([]);
  });

  it("enxerga a agenda inteira, e não só o que ele mesmo enviou", async () => {
    const caller = appRouter.createCaller(context("planejador"));
    await caller.appointments.list();
    // Sem supplierIds no filtro: o recorte por fornecedor não se aplica a ele.
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.not.objectContaining({ supplierIds: expect.anything() }));
  });

  it("sugere uma data em vez de marcá-la", async () => {
    const amanha = new Date(Date.now() + 86_400_000);
    mocks.getAppointmentById.mockResolvedValue({ id: 7, supplierId: 12, status: "pending" });
    mocks.createAppointmentSuggestion.mockResolvedValue({ id: 3 });
    const caller = appRouter.createCaller(context("planejador"));
    await caller.suggestions.create({ appointmentId: 7, suggestedFor: amanha.toISOString() });
    // A sugestão fica no nome de quem a escreveu, como sempre foi — o que a
    // mantém fora do recorte do fornecedor até o Operador aceitar.
    expect(mocks.createAppointmentSuggestion).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 7, supplierId: 24 }));
  });

  it("não confirma o agendamento nem aceita sugestão", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 7, supplierId: 12, status: "pending" });
    const caller = appRouter.createCaller(context("planejador"));
    await expect(caller.appointments.schedule({ appointmentId: 7, scheduledFor: new Date(Date.now() + 86_400_000).toISOString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.suggestions.accept({ suggestionId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.scheduleAppointment).not.toHaveBeenCalled();
  });

  it("conclui o recebimento de uma nota já recebida", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 7, supplierId: 12, status: "received" });
    mocks.updateAppointmentStatus.mockResolvedValue({ id: 7, status: "completed" });
    const caller = appRouter.createCaller(context("planejador"));
    await caller.appointments.updateStatus({ appointmentId: 7, status: "completed", miroNumber: "5105101642" });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 7, status: "completed", handledBy: 24, miroNumber: "5105101642" }));
  });

  it("fica fora do pátio e do recebimento avulso", async () => {
    const caller = appRouter.createCaller(context("planejador"));
    await expect(caller.attendances.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.attendances.dayLog()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const xml = Buffer.from('<NFe><infNFe Id="NFe35260112345678901234550010000000011000000010"><ide><nNF>1</nNF></ide></infNFe></NFe>').toString("base64");
    await expect(caller.appointments.registerUnscheduledReceipt({ fileName: "nota.xml", xmlBase64: xml })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("não alcança a administração", async () => {
    const caller = appRouter.createCaller(context("planejador"));
    await expect(caller.accessRequests.listPending()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.staff.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.manutencao.gerarBackup()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});


describe("fechamento do recebimento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppointmentById.mockResolvedValue({ id: 7, supplierId: 12, status: "received" });
    mocks.updateAppointmentStatus.mockResolvedValue({ id: 7, status: "completed" });
  });

  it("não conclui sem o número MIRO", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await expect(caller.appointments.updateStatus({ appointmentId: 7, status: "completed" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("não conclui com um MIRO que não tem dez dígitos", async () => {
    const caller = appRouter.createCaller(context("operator"));
    for (const miroNumber of ["510510164", "51051016423", "51051O1642"]) {
      await expect(caller.appointments.updateStatus({ appointmentId: 7, status: "completed", miroNumber })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("registra o MIRO no histórico junto da conclusão", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.updateStatus({ appointmentId: 7, status: "completed", miroNumber: " 5105101642 " });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({ miroNumber: "5105101642", eventNote: "Recebimento concluído. MIRO 5105101642." }));
  });

  it("manda para o backlog sem exigir MIRO, guardando motivo e descrição", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.updateStatus({ appointmentId: 7, status: "backlog", backlogReasonCode: "DIVERGENCIA_QUANTIDADE", note: "Chegaram 6 de 8." });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: "backlog", miroNumber: undefined, backlogReasonCode: "DIVERGENCIA_QUANTIDADE",
      // O histórico ganha a frase inteira; a coluna da nota guarda só a
      // descrição, senão o relatório repete o rótulo duas vezes.
      eventNote: "Divergência de quantidade: Chegaram 6 de 8.",
      backlogReason: "Chegaram 6 de 8.",
    }));
  });

  it("não manda para o backlog sem motivo nem sem descrição", async () => {
    const caller = appRouter.createCaller(context("operator"));
    // Uma nota que volta sem dizer por quê só muda o problema de mesa.
    await expect(caller.appointments.updateStatus({ appointmentId: 7, status: "backlog", note: "Chegaram 6 de 8." })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.appointments.updateStatus({ appointmentId: 7, status: "backlog", backlogReasonCode: "DIVERGENCIA_QUANTIDADE" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.appointments.updateStatus({ appointmentId: 7, status: "backlog", backlogReasonCode: "DIVERGENCIA_QUANTIDADE", note: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("recusa motivo que não está na lista", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await expect(caller.appointments.updateStatus({ appointmentId: 7, status: "backlog", backlogReasonCode: "INVENTADO", note: "Qualquer coisa." })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("ignora um MIRO enviado numa transição que não é a conclusão", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await caller.appointments.updateStatus({ appointmentId: 7, status: "backlog", backlogReasonCode: "OUTRO", note: "Retida na conferência.", miroNumber: "5105101642" });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "backlog", miroNumber: undefined }));
  });
});

describe("tratativa do backlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppointmentById.mockResolvedValue({ id: 9, supplierId: 12, status: "backlog" });
    mocks.treatBacklogAppointment.mockResolvedValue({ id: 9, status: "completed" });
  });

  it("é do planejador, e não de quem mandou a nota para o backlog", async () => {
    const operador = appRouter.createCaller(context("operator"));
    await expect(operador.appointments.tratarBacklog({ appointmentId: 9, miroNumber: "5105101642" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const fornecedor = appRouter.createCaller(context("supplier"));
    await expect(fornecedor.appointments.tratarBacklog({ appointmentId: 9, miroNumber: "5105101642" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.treatBacklogAppointment).not.toHaveBeenCalled();
  });

  it("grava os documentos e conclui a nota", async () => {
    const caller = appRouter.createCaller(context("planejador"));
    await caller.appointments.tratarBacklog({ appointmentId: 9, miroNumber: " 5105101642 ", quotationNumber: " COT-88 ", hisEntryDocument: "0244599" });
    expect(mocks.treatBacklogAppointment).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: 9, handledBy: 24, miroNumber: "5105101642", quotationNumber: "COT-88",
      memorizedOrder: null, hisEntryDocument: "0244599", hisExitDocument: null,
      eventNote: "Backlog tratado: MIRO 5105101642, cotação COT-88, entrada HIS 0244599.",
    }));
  });

  it("não fecha a tratativa sem MIRO de dez dígitos", async () => {
    const caller = appRouter.createCaller(context("planejador"));
    await expect(caller.appointments.tratarBacklog({ appointmentId: 9, miroNumber: "510510" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.treatBacklogAppointment).not.toHaveBeenCalled();
  });

  it("recusa tratar uma nota que não está em backlog", async () => {
    mocks.getAppointmentById.mockResolvedValue({ id: 9, supplierId: 12, status: "received" });
    const caller = appRouter.createCaller(context("planejador"));
    await expect(caller.appointments.tratarBacklog({ appointmentId: 9, miroNumber: "5105101642" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("observações internas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppointmentById.mockResolvedValue({ id: 9, supplierId: 12, status: "backlog" });
    mocks.listAppointmentInternalNotes.mockResolvedValue([]);
    mocks.createAppointmentInternalNote.mockResolvedValue(3);
  });

  it("ficam restritas a quem trabalha a agenda", async () => {
    // São movimentações internas de SAP: o fornecedor não lê nem escreve.
    const fornecedor = appRouter.createCaller(context("supplier"));
    await expect(fornecedor.internalNotes.list({ appointmentId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(fornecedor.internalNotes.create({ appointmentId: 9, body: "teste" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const portaria = appRouter.createCaller(context("portaria"));
    await expect(portaria.internalNotes.list({ appointmentId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.createAppointmentInternalNote).not.toHaveBeenCalled();
  });

  it("o planejador e o operador escrevem nelas", async () => {
    for (const perfil of ["planejador", "operator"] as const) {
      const caller = appRouter.createCaller(context(perfil));
      await caller.internalNotes.create({ appointmentId: 9, body: "  Movimento complementar 0244599  " });
    }
    expect(mocks.createAppointmentInternalNote).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 9, body: "Movimento complementar 0244599" }));
    expect(mocks.createAppointmentInternalNote).toHaveBeenCalledTimes(2);
  });
});

describe("alcance da Portaria", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não abre o histórico do portão para quem está no portão", async () => {
    const caller = appRouter.createCaller(context("portaria"));
    await expect(caller.attendances.report({ from: "2026-09-01", to: "2026-09-30" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("mantém a fila do portão, que é o trabalho dela", async () => {
    mocks.listAttendances.mockResolvedValue([]);
    const caller = appRouter.createCaller(context("portaria"));
    await expect(caller.attendances.list()).resolves.toEqual([]);
  });

  it("abre o histórico para o Operador e o Administrador", async () => {
    mocks.listAttendancesInRange.mockResolvedValue([]);
    for (const perfil of ["operator", "admin"] as const) {
      const caller = appRouter.createCaller(context(perfil));
      await expect(caller.attendances.report({ from: "2026-09-01", to: "2026-09-30" })).resolves.toEqual([]);
    }
  });
});
