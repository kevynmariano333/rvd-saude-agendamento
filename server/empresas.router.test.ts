import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

// O que este arquivo garante é a promessa principal da separação por empresa:
// quem opera para uma empresa não lê a nota de outra — nem pela lista, nem
// pelo id, nem pelo anexo, nem pela conversa.

const mocks = vi.hoisted(() => ({
  getAppointmentById: vi.fn(),
  listAppointments: vi.fn(),
  countAppointments: vi.fn(),
  countAppointmentsByStatus: vi.fn(),
  listAppointmentMessages: vi.fn(),
  listAppointmentInternalNotes: vi.fn(),
  listCalendarAppointments: vi.fn(),
  listReportRows: vi.fn(),
  listAppointmentSuggestions: vi.fn(),
  listUnreadAppointmentMessages: vi.fn(),
  contarMensagensPorNota: vi.fn(),
  contarTratativasPorNota: vi.fn(),
  sugestoesPendentesPorNota: vi.fn(),
  listBacklogReportRows: vi.fn(),
  datasFuradasPorNota: vi.fn(),
  listApprovedCompanyUserIds: vi.fn(),
  listarIdsDaEmpresa: vi.fn(),
  gravarSinalDePresenca: vi.fn(),
  notaPelaChaveDoArquivo: vi.fn(),
  listAppointmentHistory: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  createLocalUser: vi.fn(),
  setUserRole: vi.fn(),
  setUserEmpresa: vi.fn(),
  countActiveAdmins: vi.fn(),
  avisarAcessoLiberado: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, ...mocks };
});

const { appRouter } = await import("./routers");
const { podeBaixarArquivo } = await import("./escopoDeNotas");

const HOSPITAL = "06033403000113";
const RVD = "39283469000110";
const LLT = "45295469000133";

function usuario(role: User["role"], empresaOperada: string | null = null, id = 24): User {
  const now = new Date();
  return { id, openId: `t-${role}-${empresaOperada}`, name: "Teste", email: `${role}@x.com`, loginMethod: "test", passwordHash: null, role, companyCnpj: null, empresaOperada, accessStatus: "approved", createdAt: now, updatedAt: now, lastSignedIn: now } as unknown as User;
}

function como(user: User) {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
  } as never);
}

const notaDa = (cnpj: string | null, id = 1) => ({ id, supplierId: 50, status: "pending", recipientCnpj: cnpj, invoiceNumber: "100" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAppointments.mockResolvedValue([]);
  mocks.countAppointments.mockResolvedValue(0);
  mocks.countAppointmentsByStatus.mockResolvedValue({});
  mocks.listAppointmentMessages.mockResolvedValue([]);
  mocks.listAppointmentInternalNotes.mockResolvedValue([]);
  mocks.listCalendarAppointments.mockResolvedValue([]);
  mocks.listReportRows.mockResolvedValue({ linhas: [], total: 0 });
  mocks.listAppointmentSuggestions.mockResolvedValue([]);
  mocks.listUnreadAppointmentMessages.mockResolvedValue([]);
  mocks.contarMensagensPorNota.mockResolvedValue([]);
  mocks.contarTratativasPorNota.mockResolvedValue([]);
  mocks.sugestoesPendentesPorNota.mockResolvedValue([]);
  mocks.listBacklogReportRows.mockResolvedValue([]);
  mocks.datasFuradasPorNota.mockResolvedValue(new Map());
  mocks.listApprovedCompanyUserIds.mockResolvedValue([]);
  mocks.listarIdsDaEmpresa.mockResolvedValue([]);
  mocks.listAppointmentHistory.mockResolvedValue([]);
  mocks.updateAppointmentStatus.mockResolvedValue({ id: 1 });
  mocks.getUserByEmail.mockResolvedValue(undefined);
  mocks.createLocalUser.mockImplementation(async (dados: Record<string, unknown>) => ({ id: 99, name: "Novo", email: dados.email, role: dados.role, empresaOperada: dados.empresaOperada ?? null }));
  mocks.countActiveAdmins.mockResolvedValue(2);
});

describe("abrir uma nota de outra empresa", () => {
  it("a RVD não abre a nota que vai para o Hospital", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(HOSPITAL));
    await expect(como(usuario("operator", "rvd")).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a Amil não abre a nota da LLT", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(LLT));
    await expect(como(usuario("operator", "amil")).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a LLT não abre a nota da RVD", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(RVD));
    await expect(como(usuario("operator", "llt")).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cada uma abre as notas da própria empresa", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(RVD));
    await expect(como(usuario("operator", "rvd")).appointments.byId({ appointmentId: 1 })).resolves.toBeTruthy();
    mocks.getAppointmentById.mockResolvedValue(notaDa(HOSPITAL));
    await expect(como(usuario("operator", "amil")).appointments.byId({ appointmentId: 1 })).resolves.toBeTruthy();
  });

  it("o planejador da Amil também é barrado nas outras", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(LLT));
    await expect(como(usuario("planejador", "amil")).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("o perfil de consulta segue o mesmo corte", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(RVD));
    await expect(como(usuario("planejador_leitura", "amil")).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("o administrador abre todas", async () => {
    for (const cnpj of [HOSPITAL, RVD, LLT]) {
      mocks.getAppointmentById.mockResolvedValue(notaDa(cnpj));
      await expect(como(usuario("admin")).appointments.byId({ appointmentId: 1 })).resolves.toBeTruthy();
    }
  });

  it("a nota sem destinatário continua sendo da Amil", async () => {
    // O acervo antigo não tem CNPJ reconhecível, e a Amil sempre o viu.
    mocks.getAppointmentById.mockResolvedValue(notaDa(null));
    await expect(como(usuario("operator", "amil")).appointments.byId({ appointmentId: 1 })).resolves.toBeTruthy();
    await expect(como(usuario("operator", "rvd")).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("operador sem empresa marcada vale Amil: nunca \"todas\"", async () => {
    // Faltar o cadastro não pode abrir as outras duas empresas.
    mocks.getAppointmentById.mockResolvedValue(notaDa(RVD));
    await expect(como(usuario("operator", null)).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    mocks.getAppointmentById.mockResolvedValue(notaDa(HOSPITAL));
    await expect(como(usuario("operator", null)).appointments.byId({ appointmentId: 1 })).resolves.toBeTruthy();
  });

  it("um código de empresa inventado também cai na Amil", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(LLT));
    await expect(como(usuario("operator", "qualquer-coisa")).appointments.byId({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("recusa com \"não encontrado\", e não com \"proibido\"", async () => {
    // Dizer que a nota existe mas é de outra empresa já seria contar o que
    // não se deve.
    mocks.getAppointmentById.mockResolvedValue(notaDa(HOSPITAL));
    await expect(como(usuario("operator", "rvd")).appointments.byId({ appointmentId: 1 })).rejects.toThrow(/não encontrado/i);
  });
});

describe("a conversa e o histórico de uma nota de outra empresa", () => {
  it("a mensagem da nota da LLT não abre para a Amil", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(LLT));
    await expect(como(usuario("operator", "amil")).messages.list({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.listAppointmentMessages).not.toHaveBeenCalled();
  });

  it("o histórico da nota da RVD não abre para a LLT", async () => {
    mocks.getAppointmentById.mockResolvedValue(notaDa(RVD));
    await expect(como(usuario("operator", "llt")).appointments.history({ appointmentId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.listAppointmentHistory).not.toHaveBeenCalled();
  });
});

describe("as listas respeitam a empresa", () => {
  it("a lista de notas leva o corte da empresa", async () => {
    await como(usuario("operator", "rvd")).appointments.list();
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ empresa: "rvd" }));
  });

  it("o corte vale também para quem filtra pelo seletor de destinatário", async () => {
    // O seletor só estreita o que já é da empresa: escolher o CNPJ do Hospital
    // na conta da RVD não devolve o Hospital.
    await como(usuario("operator", "rvd")).appointments.list({ recipientCnpjs: [HOSPITAL] });
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ empresa: "rvd", recipientCnpjs: [HOSPITAL] }));
  });

  it("o total e as abas contam só a empresa", async () => {
    await como(usuario("operator", "llt")).appointments.total();
    await como(usuario("operator", "llt")).appointments.counts();
    expect(mocks.countAppointments).toHaveBeenCalledWith(expect.objectContaining({ empresa: "llt" }));
    expect(mocks.countAppointmentsByStatus).toHaveBeenCalledWith(expect.objectContaining({ empresa: "llt" }));
  });

  it("o administrador lista sem corte", async () => {
    await como(usuario("admin")).appointments.list();
    expect(mocks.listAppointments).toHaveBeenCalledWith(expect.objectContaining({ empresa: null }));
  });

  it("o calendário, o relatório e o sino levam o corte", async () => {
    const rvd = como(usuario("operator", "rvd"));
    await rvd.calendar.list({ start: "2026-11-01T00:00:00.000Z", end: "2026-11-30T23:59:59.000Z" });
    await rvd.reports.notas();
    expect(mocks.listCalendarAppointments).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), "rvd");
    await rvd.messages.notifications();
    await rvd.messages.porNota();
    expect(mocks.listReportRows).toHaveBeenCalledWith(expect.objectContaining({ empresa: "rvd" }));
    expect(mocks.listUnreadAppointmentMessages).toHaveBeenCalledWith(expect.objectContaining({ empresa: "rvd" }));
    expect(mocks.contarMensagensPorNota).toHaveBeenCalledWith(expect.objectContaining({ empresa: "rvd" }));
  });

  it("as sugestões pendentes levam o corte", async () => {
    await como(usuario("operator", "llt")).suggestions.list();
    expect(mocks.listAppointmentSuggestions).toHaveBeenCalledWith(expect.objectContaining({ empresa: "llt" }));
  });
});

describe("o anexo da nota", () => {
  it("a RVD não baixa o XML de uma nota do Hospital", async () => {
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 1, supplierId: 50, recipientCnpj: HOSPITAL });
    expect(await podeBaixarArquivo({ id: 24, role: "operator", empresaOperada: "rvd" }, "agendamentos-xml/50/a.xml")).toBe(false);
  });

  it("a Amil baixa o da própria empresa", async () => {
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 1, supplierId: 50, recipientCnpj: HOSPITAL });
    expect(await podeBaixarArquivo({ id: 24, role: "operator", empresaOperada: "amil" }, "agendamentos-xml/50/a.xml")).toBe(true);
  });

  it("o administrador baixa de qualquer uma", async () => {
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 1, supplierId: 50, recipientCnpj: LLT });
    expect(await podeBaixarArquivo({ id: 1, role: "admin" }, "agendamentos-xml/50/a.xml")).toBe(true);
  });
});

describe("o que a RVD e a LLT não usam", () => {
  const recebida = (cnpj: string | null) => ({ ...notaDa(cnpj), status: "received" });

  it("a nota da RVD conclui sem MIRO", async () => {
    // MIRO é o número do SAP da Amil. Cobrá-lo de quem não tem SAP travaria a
    // conclusão numa pergunta sem resposta.
    mocks.getAppointmentById.mockResolvedValue(recebida(RVD));
    await como(usuario("operator", "rvd")).appointments.updateStatus({ appointmentId: 1, status: "completed" });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", miroNumber: undefined }));
  });

  it("a nota da LLT também", async () => {
    mocks.getAppointmentById.mockResolvedValue(recebida(LLT));
    await como(usuario("operator", "llt")).appointments.updateStatus({ appointmentId: 1, status: "completed" });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalled();
  });

  it("a da Amil continua exigindo o MIRO", async () => {
    mocks.getAppointmentById.mockResolvedValue(recebida(HOSPITAL));
    await expect(como(usuario("operator", "amil")).appointments.updateStatus({ appointmentId: 1, status: "completed" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("nem o administrador manda nota da RVD para o backlog", async () => {
    mocks.getAppointmentById.mockResolvedValue(recebida(RVD));
    await expect(
      como(usuario("admin")).appointments.updateStatus({ appointmentId: 1, status: "backlog", backlogReasonCode: "OUTRO", note: "x" }),
    ).rejects.toThrow(/não usa o backlog/);
    expect(mocks.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("a nota da Amil vai ao backlog normalmente", async () => {
    mocks.getAppointmentById.mockResolvedValue(recebida(HOSPITAL));
    await como(usuario("operator", "amil")).appointments.updateStatus({ appointmentId: 1, status: "backlog", backlogReasonCode: "OUTRO", note: "divergência" });
    expect(mocks.updateAppointmentStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "backlog" }));
  });

  it("devolver ao backlog uma nota da LLT também é recusado", async () => {
    mocks.getAppointmentById.mockResolvedValue({ ...notaDa(LLT), status: "completed" });
    await expect(
      como(usuario("admin")).appointments.voltarParaBacklog({ appointmentId: 1, backlogReasonCode: "OUTRO" }),
    ).rejects.toThrow(/não usa o backlog/);
  });
});

describe("a empresa de cada conta", () => {
  const nova = (role: string, empresa?: string) => ({
    nome: "Fulano da Silva",
    email: "fulano@exemplo.com",
    senha: "senha-forte-123",
    role: role as never,
    ...(empresa ? { empresa: empresa as never } : {}),
  });

  it("o operador criado sem empresa atende a Amil", async () => {
    await como(usuario("admin")).staff.criarUsuario(nova("operator"));
    expect(mocks.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({ role: "operator", empresaOperada: "amil" }));
  });

  it("o operador da RVD e o da LLT guardam a empresa", async () => {
    await como(usuario("admin")).staff.criarUsuario(nova("operator", "rvd"));
    expect(mocks.createLocalUser).toHaveBeenLastCalledWith(expect.objectContaining({ empresaOperada: "rvd" }));
    await como(usuario("admin")).staff.criarUsuario({ ...nova("operator", "llt"), email: "outro@exemplo.com" });
    expect(mocks.createLocalUser).toHaveBeenLastCalledWith(expect.objectContaining({ empresaOperada: "llt" }));
  });

  it("não existe planejador na RVD nem na LLT, por enquanto", async () => {
    for (const empresa of ["rvd", "llt"]) {
      await expect(como(usuario("admin")).staff.criarUsuario(nova("planejador", empresa))).rejects.toThrow(/ainda não tem planejador/);
      await expect(como(usuario("admin")).staff.criarUsuario(nova("planejador_leitura", empresa))).rejects.toThrow(/ainda não tem planejador/);
    }
    expect(mocks.createLocalUser).not.toHaveBeenCalled();
  });

  it("o planejador da Amil é criado normalmente", async () => {
    await como(usuario("admin")).staff.criarUsuario(nova("planejador", "amil"));
    expect(mocks.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({ role: "planejador", empresaOperada: "amil" }));
  });

  it("administrador e fornecedor não ganham empresa", async () => {
    await como(usuario("admin")).staff.criarUsuario(nova("admin"));
    expect(mocks.createLocalUser).toHaveBeenLastCalledWith(expect.objectContaining({ role: "admin", empresaOperada: null }));
  });

  it("só o administrador muda a empresa de uma conta", async () => {
    await expect(como(usuario("operator", "amil")).staff.setEmpresa({ userId: 5, empresa: "rvd" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.setUserEmpresa).not.toHaveBeenCalled();
  });

  it("move um operador da Amil para a RVD", async () => {
    mocks.getUserById.mockResolvedValue({ id: 5, role: "operator", empresaOperada: "amil" });
    await como(usuario("admin")).staff.setEmpresa({ userId: 5, empresa: "rvd" });
    expect(mocks.setUserEmpresa).toHaveBeenCalledWith({ userId: 5, empresa: "rvd" });
  });

  it("não move um planejador para uma empresa sem planejamento", async () => {
    mocks.getUserById.mockResolvedValue({ id: 5, role: "planejador", empresaOperada: "amil" });
    await expect(como(usuario("admin")).staff.setEmpresa({ userId: 5, empresa: "llt" })).rejects.toThrow(/ainda não tem planejador/);
    expect(mocks.setUserEmpresa).not.toHaveBeenCalled();
  });

  it("não dá empresa a quem não trabalha na mesa", async () => {
    mocks.getUserById.mockResolvedValue({ id: 5, role: "supplier", empresaOperada: null });
    await expect(como(usuario("admin")).staff.setEmpresa({ userId: 5, empresa: "rvd" })).rejects.toThrow(/Só operador e planejador/);
  });

  it("transformar em planejador quem atende a RVD é recusado", async () => {
    mocks.getUserById.mockResolvedValue({ id: 5, role: "operator", empresaOperada: "rvd" });
    await expect(como(usuario("admin")).staff.setRole({ userId: 5, role: "planejador" })).rejects.toThrow(/ainda não tem planejador/);
    expect(mocks.setUserRole).not.toHaveBeenCalled();
  });
});
