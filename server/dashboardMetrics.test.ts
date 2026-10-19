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
      { month: 8, year: 2026, now: new Date("2026-08-20T10:00:00") },
    );
    expect(metrics.receivedVolumes).toBe(12);
    expect(metrics.receivedPorUnidade).toEqual([
      { sigla: "HSH", notas: 1, volumes: 12 },
      { sigla: "MSH", notas: 1, volumes: 0 },
      { sigla: "Outros", notas: 0, volumes: 0 },
    ]);
  });

  it("reconhece a unidade pelo CNPJ do destinatário", () => {
    expect(siglaDaUnidade(HSH)).toBe("HSH");
    expect(siglaDaUnidade(MSH)).toBe("MSH");
    expect(siglaDaUnidade(null)).toBe("Outros");
    expect(siglaDaUnidade("99999999999999")).toBe("Outros");
  });
});

