import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  createAttendance: vi.fn(),
  decideAttendanceEntry: vi.fn(),
  executeAttendanceAction: vi.fn(),
  getAttendanceById: vi.fn(),
  deleteAttendanceById: vi.fn(),
  listAttendanceEvents: vi.fn(),
  listAttendances: vi.fn(),
  listAttendancesByDay: vi.fn(),
  listAttendancesInRange: vi.fn(),
  listStaffUsers: vi.fn(),
  setUserRole: vi.fn(),
  setUserAccessStatus: vi.fn(),
  countActiveAdmins: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("./db", () => mocks);
vi.mock("./session", () => ({ clearRvdSession: vi.fn(), createRvdSession: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));

import { appRouter } from "./routers";
import { formatSaoPauloDateKey } from "../shared/dateFilters";
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
  supplierName: "Fornecedor Exemplo",
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
      appRouter.createCaller(context("portaria")).attendances.create({ ...arrival, classificationDetail: "correios" })
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

  it("deixa a Portaria abrir a entrada de um recebimento aceito", async () => {
    await appRouter.createCaller(context("portaria")).attendances.executeAction({ attendanceId: 1, action: "iniciar" });
    expect(mocks.executeAttendanceAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "iniciar", operatedById: 7 })
    );
  });

  it("impede a Operação de abrir a entrada — o portão é da Portaria", async () => {
    await expect(
      appRouter.createCaller(context("operacao")).attendances.executeAction({ attendanceId: 1, action: "iniciar" })
    ).rejects.toThrow(/Portaria/);
    expect(mocks.executeAttendanceAction).not.toHaveBeenCalled();
  });

  it("deixa a liberação da doca com a Operação", async () => {
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "em_atendimento" }));
    await appRouter.createCaller(context("operacao")).attendances.executeAction({ attendanceId: 1, action: "liberar" });
    expect(mocks.executeAttendanceAction).toHaveBeenCalledWith(expect.objectContaining({ action: "liberar" }));

    await expect(
      appRouter.createCaller(context("portaria")).attendances.executeAction({ attendanceId: 1, action: "liberar" })
    ).rejects.toThrow(/Operação/);
  });

  it("deixa a saída com a Portaria, e só depois da liberação", async () => {
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "liberado" }));
    await appRouter.createCaller(context("portaria")).attendances.executeAction({ attendanceId: 1, action: "concluir" });
    expect(mocks.executeAttendanceAction).toHaveBeenCalledWith(expect.objectContaining({ action: "concluir" }));

    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "em_atendimento" }));
    await expect(
      appRouter.createCaller(context("portaria")).attendances.executeAction({ attendanceId: 1, action: "concluir" })
    ).rejects.toThrow(/não está disponível para o status atual/);
  });

  it("bloqueia uma ação fora da ordem do fluxo", async () => {
    await expect(
      appRouter.createCaller(context("operacao")).attendances.executeAction({ attendanceId: 1, action: "liberar" })
    ).rejects.toThrow(/não está disponível para o status atual/);
  });

  // Apagar um protocolo é a saída para um registro de teste ou um lançamento
  // errado — e é só do administrador, porque leva o histórico junto.
  it("deixa só o administrador excluir um registro do portão", async () => {
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "concluido" }));

    await expect(appRouter.createCaller(context("admin")).attendances.remove({ attendanceId: 1 })).resolves.toEqual({
      protocol: "PRT-260901-AB12X",
    });
    expect(mocks.deleteAttendanceById).toHaveBeenCalledWith(1);

    for (const role of ["portaria", "operacao", "operator", "supplier"] as const) {
      await expect(appRouter.createCaller(context(role)).attendances.remove({ attendanceId: 1 })).rejects.toThrow();
    }
    expect(mocks.deleteAttendanceById).toHaveBeenCalledTimes(1);
  });

  it("não apaga um protocolo que não existe", async () => {
    mocks.getAttendanceById.mockResolvedValue(null);
    await expect(appRouter.createCaller(context("admin")).attendances.remove({ attendanceId: 99 })).rejects.toThrow(
      /não localizado/i
    );
    expect(mocks.deleteAttendanceById).not.toHaveBeenCalled();
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
    await expect(caller.attendances.list({})).rejects.toThrow(/equipes/);
    await expect(caller.attendances.history({ attendanceId: 1 })).rejects.toThrow(/equipes/);
    await expect(caller.attendances.overview()).rejects.toThrow(/equipes/);
  });

  // Quem cuida da agenda recebe a carga: autoriza e libera a doca, mas o portão
  // continua sendo da Portaria.
  it("deixa o operador autorizar o recebimento, e não abrir o portão", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await expect(caller.attendances.list({})).resolves.toHaveLength(2);
    await caller.attendances.decideReceipt({ attendanceId: 1, decision: "aprovar" });
    expect(mocks.decideAttendanceEntry).toHaveBeenCalled();

    await expect(caller.attendances.create(arrival)).rejects.toThrow(/Portaria/);
    await expect(caller.attendances.executeAction({ attendanceId: 1, action: "iniciar" })).rejects.toThrow(/Portaria/);
  });

  it("deixa toda a equipe interna ler a fila", async () => {
    for (const role of ["portaria", "operacao", "operator", "admin"] as const) {
      await expect(appRouter.createCaller(context(role)).attendances.list({})).resolves.toHaveLength(2);
    }
  });

  it("resume a fila em indicadores", async () => {
    const overview = await appRouter.createCaller(context("portaria")).attendances.overview();
    expect(overview).toMatchObject({ awaiting: 1, approved: 1, collections: 1, receipts: 1 });
  });
});

describe("registro do dia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAttendancesByDay.mockResolvedValue([]);
  });

  // Hospedado em UTC, um corte pelo relógio do servidor viraria o dia às 21h no
  // Brasil e o turno da noite sumiria do registro com o porteiro trabalhando.
  it("usa o dia de São Paulo quando nenhuma data é informada", async () => {
    await appRouter.createCaller(context("portaria")).attendances.dayLog();
    const [dateKey] = mocks.listAttendancesByDay.mock.calls[0];
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateKey).toBe(formatSaoPauloDateKey());
  });

  it("aceita uma data específica no formato do dia", async () => {
    await appRouter.createCaller(context("portaria")).attendances.dayLog({ date: "2026-08-20" });
    expect(mocks.listAttendancesByDay).toHaveBeenCalledWith("2026-08-20");
  });

  it("recusa uma data fora do formato", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).attendances.dayLog({ date: "20/08/2026" })
    ).rejects.toThrow(/AAAA-MM-DD/);
    expect(mocks.listAttendancesByDay).not.toHaveBeenCalled();
  });

  // O operador de agendamentos não entra no pátio, mas precisa saber quem
  // chegou: este é o único ponto do módulo aberto a ele.
  it("abre o registro para o operador de agendamentos e fecha para o fornecedor", async () => {
    await expect(appRouter.createCaller(context("operator")).attendances.dayLog()).resolves.toEqual([]);
    await expect(appRouter.createCaller(context("supplier", 12)).attendances.dayLog()).rejects.toThrow(
      /equipes internas/
    );
  });
});

describe("perfis internos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listStaffUsers.mockResolvedValue([]);
    mocks.countActiveAdmins.mockResolvedValue(1);
    mocks.getUserById.mockResolvedValue({ id: 31, role: "portaria", accessStatus: "approved" });
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

  it("bloqueia e libera o acesso de uma conta", async () => {
    mocks.getUserById.mockResolvedValue({ id: 31, role: "portaria", accessStatus: "approved" });
    const caller = appRouter.createCaller(context("admin"));

    await caller.staff.setAccess({ userId: 31, allowed: false });
    expect(mocks.setUserAccessStatus).toHaveBeenCalledWith({ userId: 31, accessStatus: "rejected" });

    await caller.staff.setAccess({ userId: 31, allowed: true });
    expect(mocks.setUserAccessStatus).toHaveBeenCalledWith({ userId: 31, accessStatus: "approved" });
  });

  // Sem esta trava, um clique tranca o sistema por fora e a única volta é abrir
  // o banco na mão.
  it("recusa bloquear o último administrador ativo", async () => {
    mocks.getUserById.mockResolvedValue({ id: 31, role: "admin", accessStatus: "approved" });
    mocks.countActiveAdmins.mockResolvedValue(0);

    await expect(
      appRouter.createCaller(context("admin")).staff.setAccess({ userId: 31, allowed: false })
    ).rejects.toThrow(/último administrador/);
    expect(mocks.setUserAccessStatus).not.toHaveBeenCalled();
  });

  it("deixa bloquear um administrador quando ainda resta outro", async () => {
    mocks.getUserById.mockResolvedValue({ id: 31, role: "admin", accessStatus: "approved" });
    mocks.countActiveAdmins.mockResolvedValue(1);

    await appRouter.createCaller(context("admin")).staff.setAccess({ userId: 31, allowed: false });
    expect(mocks.setUserAccessStatus).toHaveBeenCalledWith({ userId: 31, accessStatus: "rejected" });
  });

  it("recusa rebaixar o último administrador ativo", async () => {
    mocks.getUserById.mockResolvedValue({ id: 31, role: "admin", accessStatus: "approved" });
    mocks.countActiveAdmins.mockResolvedValue(0);

    await expect(
      appRouter.createCaller(context("admin")).staff.setRole({ userId: 31, role: "portaria" })
    ).rejects.toThrow(/último administrador/);
    expect(mocks.setUserRole).not.toHaveBeenCalled();
  });

  it("promove uma conta a administrador", async () => {
    mocks.getUserById.mockResolvedValue({ id: 31, role: "portaria", accessStatus: "approved" });
    await appRouter.createCaller(context("admin")).staff.setRole({ userId: 31, role: "admin" });
    expect(mocks.setUserRole).toHaveBeenCalledWith({ userId: 31, role: "admin" });
  });

  it("mantém a gestão de perfis restrita ao administrador", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).staff.setRole({ userId: 31, role: "operacao" })
    ).rejects.toThrow();
    expect(mocks.setUserRole).not.toHaveBeenCalled();
  });
});

// A doca é o destino do caminhão dentro da unidade, informado pela Portaria na
// hora de abrir o portão — e informar é opcional.
describe("doca de destino", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "aprovado" }));
    mocks.executeAttendanceAction.mockResolvedValue(attendance({ status: "em_atendimento", dockNumber: 2 }));
  });

  it("grava a doca escolhida ao liberar a entrada", async () => {
    await appRouter
      .createCaller(context("portaria"))
      .attendances.executeAction({ attendanceId: 1, action: "iniciar", dockNumber: 2 });

    expect(mocks.executeAttendanceAction).toHaveBeenCalledWith({
      attendanceId: 1,
      action: "iniciar",
      operatedById: 7,
      dockNumber: 2,
    });
  });

  it("libera a entrada sem doca quando o porteiro não escolhe", async () => {
    await appRouter.createCaller(context("portaria")).attendances.executeAction({ attendanceId: 1, action: "iniciar" });

    expect(mocks.executeAttendanceAction).toHaveBeenCalledWith({
      attendanceId: 1,
      action: "iniciar",
      operatedById: 7,
      dockNumber: undefined,
    });
  });

  // A unidade tem duas docas; uma terceira só entraria por engano ou por
  // chamada forjada, e nos dois casos gravaria um destino que não existe.
  it("aceita apenas as docas 1 e 2", async () => {
    await expect(
      appRouter
        .createCaller(context("portaria"))
        .attendances.executeAction({ attendanceId: 1, action: "iniciar", dockNumber: 3 as 1 })
    ).rejects.toThrow();
    expect(mocks.executeAttendanceAction).not.toHaveBeenCalled();
  });

  it("não aceita doca numa etapa que não é a da entrada", async () => {
    mocks.getAttendanceById.mockResolvedValue(attendance({ status: "liberado" }));
    await expect(
      appRouter
        .createCaller(context("portaria"))
        .attendances.executeAction({ attendanceId: 1, action: "concluir", dockNumber: 1 })
    ).rejects.toThrow(/liberação da entrada/);
    expect(mocks.executeAttendanceAction).not.toHaveBeenCalled();
  });
});

// No recebimento alguém entrega e esse nome precisa ficar registrado; na coleta
// é a RVD que busca, e a classificação já diz de onde.
describe("fornecedor na chegada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAttendance.mockResolvedValue(attendance());
  });

  it("exige o fornecedor no recebimento", async () => {
    const caller = appRouter.createCaller(context("portaria"));
    await expect(caller.attendances.create({ ...arrival, supplierName: undefined })).rejects.toThrow(
      /Informe o fornecedor/
    );
    expect(mocks.createAttendance).not.toHaveBeenCalled();

    await caller.attendances.create(arrival);
    expect(mocks.createAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ supplierName: "Fornecedor Exemplo" })
    );
  });

  it("dispensa o fornecedor na coleta, em qualquer classificação", async () => {
    const caller = appRouter.createCaller(context("portaria"));
    for (const [classification, classificationDetail] of [
      ["amil", "maternidade"],
      ["rvd", "braspress"],
      ["llt", "nao_aplicavel"],
    ] as const) {
      await caller.attendances.create({
        ...arrival,
        serviceType: "coleta",
        classification,
        classificationDetail,
        supplierName: undefined,
      });
    }
    expect(mocks.createAttendance).toHaveBeenCalledTimes(3);
  });

  // O campo não existe na tela da coleta, então um nome aqui só chegaria por
  // chamada forjada — e gravaria um fornecedor que a Portaria nunca digitou.
  it("descarta o fornecedor enviado numa coleta", async () => {
    await appRouter.createCaller(context("portaria")).attendances.create({
      ...arrival,
      serviceType: "coleta",
      supplierName: "Enviado à revelia",
    });

    expect(mocks.createAttendance).toHaveBeenCalledWith(expect.objectContaining({ supplierName: null }));
  });

  it("aceita a categoria DIBPEL na RVD", async () => {
    await appRouter.createCaller(context("portaria")).attendances.create({
      ...arrival,
      classification: "rvd",
      classificationDetail: "dibpel",
    });

    expect(mocks.createAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ classificationDetail: "dibpel" })
    );
  });

  // A categoria pertence a uma classificação só: DIBPEL é da RVD, e aceitá-la
  // na AMIL deixaria o relatório com uma categoria que não existe naquela conta.
  it("recusa DIBPEL fora da RVD", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).attendances.create({
        ...arrival,
        classification: "amil",
        classificationDetail: "dibpel",
      })
    ).rejects.toThrow(/não corresponde à classificação/);
    expect(mocks.createAttendance).not.toHaveBeenCalled();
  });

  it("aceita a categoria Cliente retira na RVD", async () => {
    await appRouter.createCaller(context("portaria")).attendances.create({
      ...arrival,
      classification: "rvd",
      classificationDetail: "cliente_retira",
    });

    expect(mocks.createAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ classificationDetail: "cliente_retira" })
    );
  });
});

// O histórico geral é a consulta que vira planilha, então o período é dele: sem
// as duas datas o servidor não sabe o que está sendo pedido.
describe("histórico do portão por período", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAttendancesInRange.mockResolvedValue([]);
  });

  it("consulta o período pedido", async () => {
    await appRouter.createCaller(context("portaria")).attendances.report({ from: "2026-09-01", to: "2026-09-30" });
    expect(mocks.listAttendancesInRange).toHaveBeenCalledWith("2026-09-01", "2026-09-30");
  });

  it("recusa um período de trás para frente", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).attendances.report({ from: "2026-09-30", to: "2026-09-01" })
    ).rejects.toThrow(/data inicial/i);
    expect(mocks.listAttendancesInRange).not.toHaveBeenCalled();
  });

  it("recusa uma data fora do formato", async () => {
    await expect(
      appRouter.createCaller(context("portaria")).attendances.report({ from: "01/09/2026", to: "2026-09-30" })
    ).rejects.toThrow();
    expect(mocks.listAttendancesInRange).not.toHaveBeenCalled();
  });

  it("abre para as equipes internas e fecha para o fornecedor", async () => {
    const periodo = { from: "2026-09-01", to: "2026-09-30" };
    for (const role of ["portaria", "operacao", "operator", "admin"] as const) {
      await expect(appRouter.createCaller(context(role)).attendances.report(periodo)).resolves.toEqual([]);
    }
    await expect(appRouter.createCaller(context("supplier", 12)).attendances.report(periodo)).rejects.toThrow(
      /equipes/
    );
  });
});

// O RG do motorista é dado pessoal: fica registrado, mas o portal só o entrega
// ao administrador. Apagar na tela e mandar no JSON não restringe nada.
describe("RG do motorista", () => {
  const withDocument = [
    { ...attendance({ status: "concluido" }), driverName: "João da Silva", driverDocument: "12.345.678-9" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAttendances.mockResolvedValue(withDocument);
    mocks.listAttendancesByDay.mockResolvedValue(withDocument);
    mocks.listAttendancesInRange.mockResolvedValue(withDocument);
  });

  it("entrega o RG ao administrador", async () => {
    const caller = appRouter.createCaller(context("admin"));
    expect((await caller.attendances.list({}))[0].driverDocument).toBe("12.345.678-9");
    expect((await caller.attendances.dayLog())[0].driverDocument).toBe("12.345.678-9");
    const report = await caller.attendances.report({ from: "2026-09-01", to: "2026-09-30" });
    expect(report[0].driverDocument).toBe("12.345.678-9");
  });

  it("não entrega o RG a mais ninguém, em nenhuma das consultas", async () => {
    for (const role of ["portaria", "operacao", "operator"] as const) {
      const caller = appRouter.createCaller(context(role));
      expect((await caller.attendances.list({}))[0].driverDocument).toBeNull();
      expect((await caller.attendances.dayLog())[0].driverDocument).toBeNull();
      const report = await caller.attendances.report({ from: "2026-09-01", to: "2026-09-30" });
      expect(report[0].driverDocument).toBeNull();
    }
  });

  // Esconder o RG não pode custar o resto da linha: o portão continua
  // precisando da placa, do motorista e do protocolo.
  it("mantém o resto do atendimento intacto", async () => {
    const [row] = await appRouter.createCaller(context("portaria")).attendances.dayLog();
    expect(row.driverName).toBe("João da Silva");
    expect(row.protocol).toBe("PRT-260901-AB12X");
    expect(row.status).toBe("concluido");
  });
});
