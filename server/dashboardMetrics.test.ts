import { describe, expect, it } from "vitest";
import { buildDashboardMetrics, siglaDaUnidade } from "./dashboardMetrics";

describe("buildDashboardMetrics", () => {
  it("agrupa recebimentos, fornecedores e espera usando o período selecionado", () => {
    const metrics = buildDashboardMetrics([
      { status: "pending", createdAt: new Date("2026-08-10T09:00:00"), scheduledFor: null, receivedAt: null, supplierName: "Clínica Alfa", invoiceSupplierName: null, invoiceTotalCents: 15000 },
      { status: "pending", createdAt: new Date("2026-08-10T10:30:00"), scheduledFor: null, receivedAt: null, supplierName: "Clínica Beta", invoiceSupplierName: null, invoiceTotalCents: 5000 },
      { status: "scheduled", createdAt: new Date("2026-08-01T09:00:00"), scheduledFor: new Date("2026-08-15T09:00:00"), receivedAt: null, supplierName: "Clínica Alfa", invoiceSupplierName: null, invoiceTotalCents: 21000 },
      { status: "received", createdAt: new Date("2026-08-02T09:00:00"), scheduledFor: new Date("2026-08-12T09:00:00"), receivedAt: new Date("2026-08-12T11:00:00"), supplierName: "Clínica Alfa", invoiceSupplierName: null, invoiceTotalCents: 30000 },
      { status: "completed", createdAt: new Date("2026-08-03T09:00:00"), scheduledFor: new Date("2026-08-13T09:00:00"), receivedAt: new Date("2026-08-12T15:00:00"), supplierName: null, invoiceSupplierName: "Distribuidora Beta", invoiceTotalCents: 12500 },
      { status: "received", createdAt: new Date("2026-07-30T09:00:00"), scheduledFor: new Date("2026-07-31T09:00:00"), receivedAt: new Date("2026-07-31T11:00:00"), supplierName: "Clínica Alfa", invoiceSupplierName: null, invoiceTotalCents: 9900 },
    ], { month: 8, year: 2026, now: new Date("2026-08-10T11:30:00") });

    expect(metrics.pendingCount).toBe(2);
    expect(metrics.scheduledCount).toBe(1);
    expect(metrics.receivedCount).toBe(2);
    expect(metrics.pendingTotalCents).toBe(20000);
    expect(metrics.scheduledTotalCents).toBe(21000);
    expect(metrics.receivedTotalCents).toBe(42500);
    expect(metrics.dailyReceived[11]).toMatchObject({ label: "12/08", total: 2 });
    expect(metrics.topSuppliers).toEqual([
      { name: "Clínica Alfa", notesReceived: 1 },
      { name: "Distribuidora Beta", notesReceived: 1 },
    ]);
    expect(metrics.averageWaitMinutes).toBe(105);
    expect(metrics.pendingBasis).toBe(2);
  });

  const agosto = [
    { status: "received" as const, createdAt: new Date("2026-08-02T09:00:00"), scheduledFor: new Date("2026-08-12T09:00:00"), receivedAt: new Date("2026-08-12T11:00:00"), supplierName: "Clínica Alfa", invoiceSupplierName: null, invoiceTotalCents: 30000 },
    { status: "received" as const, createdAt: new Date("2026-08-03T09:00:00"), scheduledFor: new Date("2026-08-13T09:00:00"), receivedAt: new Date("2026-08-13T15:00:00"), supplierName: "Clínica Beta", invoiceSupplierName: null, invoiceTotalCents: 12500 },
    { status: "scheduled" as const, createdAt: new Date("2026-08-01T09:00:00"), scheduledFor: new Date("2026-08-12T09:00:00"), receivedAt: null, supplierName: "Clínica Alfa", invoiceSupplierName: null, invoiceTotalCents: 21000 },
    { status: "received" as const, createdAt: new Date("2026-09-01T09:00:00"), scheduledFor: new Date("2026-09-04T09:00:00"), receivedAt: new Date("2026-09-04T11:00:00"), supplierName: "Clínica Gama", invoiceSupplierName: null, invoiceTotalCents: 9900 },
  ];

  it("recorta os números num dia do mês", () => {
    const metrics = buildDashboardMetrics(agosto, { month: 8, year: 2026, day: 12 });

    expect(metrics.period).toMatchObject({ month: 8, year: 2026, day: 12 });
    expect(metrics.receivedCount).toBe(1);
    expect(metrics.receivedTotalCents).toBe(30000);
    expect(metrics.scheduledCount).toBe(1);
    expect(metrics.topSuppliers).toEqual([{ name: "Clínica Alfa", notesReceived: 1 }]);
  });

  // O gráfico é a forma do mês: recortar um dia deixaria uma barra sozinha, e
  // aí não dá para situar o dia dentro do mês.
  it("mantém o gráfico por dia no mês inteiro mesmo com um dia escolhido", () => {
    const metrics = buildDashboardMetrics(agosto, { month: 8, year: 2026, day: 12 });

    expect(metrics.dailyReceived[11]).toMatchObject({ label: "12/08", total: 1 });
    expect(metrics.dailyReceived[12]).toMatchObject({ label: "13/08", total: 1 });
  });

  // Um 31 herdado de um mês de 31 dias não pode zerar o painel em setembro.
  it("ignora um dia que não existe no mês e volta ao mês inteiro", () => {
    const metrics = buildDashboardMetrics(agosto, { month: 9, year: 2026, day: 31 });

    expect(metrics.period.day).toBeNull();
    expect(metrics.receivedCount).toBe(1);
  });

  it("conta as notas por mês no ano inteiro", () => {
    const metrics = buildDashboardMetrics(agosto, { month: 8, year: 2026 });

    expect(metrics.monthlyReceived).toHaveLength(12);
    expect(metrics.monthlyReceived[7]).toMatchObject({ month: 8, label: "Ago", total: 2 });
    expect(metrics.monthlyReceived[8]).toMatchObject({ month: 9, label: "Set", total: 1 });
    expect(metrics.monthlyReceived[0]!.total).toBe(0);
  });

  it("não deixa outro ano entrar na contagem por mês", () => {
    const metrics = buildDashboardMetrics(agosto, { month: 8, year: 2025 });

    expect(metrics.monthlyReceived.every(item => item.total === 0)).toBe(true);
  });
});

const HSH = "06033403000113";
const MSH = "43293604002120";

const recebida = (dia: number, recipientCnpj: string | null, volumes: number | null) => ({
  status: "received" as const,
  createdAt: new Date(`2026-08-0${dia}T09:00:00`),
  scheduledFor: new Date(`2026-08-1${dia}T09:00:00`),
  receivedAt: new Date(`2026-08-1${dia}T11:00:00`),
  supplierName: "Fornecedor",
  invoiceSupplierName: null,
  invoiceTotalCents: 1000,
  recipientCnpj,
  invoiceVolumeCount: volumes,
});

describe("a divisão por unidade e os volumes", () => {
  it("separa a barra do dia entre HSH e MSH", () => {
    const metrics = buildDashboardMetrics(
      [recebida(2, HSH, 10), recebida(2, MSH, 4), recebida(2, HSH, 6)],
      { month: 8, year: 2026, now: new Date("2026-08-20T10:00:00") },
    );
    expect(metrics.dailyReceived[11]).toMatchObject({ label: "12/08", total: 3, HSH: 2, MSH: 1, volumes: 20 });
  });

  it("a nota sem destinatário reconhecido não some da contagem", () => {
    // Somem do gráfico e o total do dia deixa de bater com o número de notas
    // recebidas — que é o pior jeito de um painel mentir.
    const metrics = buildDashboardMetrics(
      [recebida(2, HSH, 1), recebida(2, null, 2)],
      { month: 8, year: 2026, now: new Date("2026-08-20T10:00:00") },
    );
    const barra = metrics.dailyReceived[11]!;
    expect(barra.total).toBe(2);
    expect(barra.HSH).toBe(1);
    expect(barra.Outros).toBe(1);
    expect(Number(barra.HSH) + Number(barra.MSH) + Number(barra.Outros)).toBe(barra.total);
  });

  it("soma os volumes do período, e nota sem volume informado conta como zero", () => {
    const metrics = buildDashboardMetrics(
      [recebida(2, HSH, 12), recebida(2, MSH, null)],
      { month: 8, year: 2026, now: new Date("2026-08-20T10:00:00"), empresas: ["amil"] },
    );
    expect(metrics.receivedVolumes).toBe(12);
    expect(metrics.receivedPorUnidade).toEqual([
      { sigla: "HSH", notas: 1, volumes: 12 },
      { sigla: "MSH", notas: 1, volumes: 0 },
      { sigla: "Outros", notas: 0, volumes: 0 },
    ]);
  });

  describe("o painel de cada empresa", () => {
    const RVD = "39283469000110";
    const LLT = "45295469000133";
    const periodo = { month: 8, year: 2026, now: new Date("2026-08-20T10:00:00") } as const;
    const nota = (cnpj: string | null, fornecedor: string) => ({
      ...recebida(2, cnpj, 5),
      invoiceSupplierName: fornecedor,
    });
    const notas = [nota(HSH, "Cremer"), nota(RVD, "Fornecedor da RVD"), nota(LLT, "Fornecedor da LLT"), nota(null, "Acervo antigo")];

    it("o administrador vê as três empresas juntas", () => {
      const metrics = buildDashboardMetrics(notas, periodo);
      expect(metrics.receivedCount).toBe(4);
      expect(metrics.receivedPorUnidade.map(item => item.sigla)).toEqual(["HSH", "MSH", "RVD", "LLT", "Outros"]);
    });

    it("a Amil não vê nota nem fornecedor da RVD e da LLT", () => {
      // O corte vale para tudo que o painel conta: o ranking também sai desse
      // conjunto. Filtrar só o gráfico deixaria o nome de um fornecedor da LLT
      // na lista da Amil.
      const metrics = buildDashboardMetrics(notas, { ...periodo, empresas: ["amil"] });
      expect(metrics.receivedCount).toBe(2);
      const nomes = metrics.topSuppliers.map(item => item.name);
      expect(nomes).toContain("Cremer");
      expect(nomes).not.toContain("Fornecedor da RVD");
      expect(nomes).not.toContain("Fornecedor da LLT");
      expect(metrics.receivedPorUnidade.map(item => item.sigla)).toEqual(["HSH", "MSH", "Outros"]);
    });

    it("o acervo sem destinatário continua sendo da Amil", () => {
      // O portal nasceu só com a Amil: o que não se reconhece não pode sumir da
      // mesa dela.
      const metrics = buildDashboardMetrics(notas, { ...periodo, empresas: ["amil"] });
      expect(metrics.receivedPorUnidade.find(item => item.sigla === "Outros")?.notas).toBe(1);
    });

    it("a RVD vê só as notas da RVD, e sem a coluna Outros", () => {
      const metrics = buildDashboardMetrics(notas, { ...periodo, empresas: ["rvd"] });
      expect(metrics.receivedCount).toBe(1);
      expect(metrics.topSuppliers.map(item => item.name)).toEqual(["Fornecedor da RVD"]);
      expect(metrics.receivedPorUnidade.map(item => item.sigla)).toEqual(["RVD"]);
    });

    it("a LLT vê só as da LLT", () => {
      const metrics = buildDashboardMetrics(notas, { ...periodo, empresas: ["llt"] });
      expect(metrics.receivedCount).toBe(1);
      expect(metrics.topSuppliers.map(item => item.name)).toEqual(["Fornecedor da LLT"]);
    });
  });

  it("reconhece a unidade pelo CNPJ do destinatário", () => {
    expect(siglaDaUnidade(HSH)).toBe("HSH");
    expect(siglaDaUnidade(MSH)).toBe("MSH");
    expect(siglaDaUnidade(null)).toBe("Outros");
    expect(siglaDaUnidade("99999999999999")).toBe("Outros");
  });
});

