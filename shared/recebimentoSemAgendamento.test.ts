import { describe, expect, it } from "vitest";
import { notaSemAgendamento, resumoSemAgendamento, type LinhaSemAgendamento } from "./recebimentoSemAgendamento";

const HSH = "06033403000113";
const RVD = "39283469000110";

const linha = (extra: Partial<LinhaSemAgendamento> = {}): LinhaSemAgendamento => ({
  id: 1,
  invoiceNumber: " 1951057 ",
  fornecedor: "Cremer",
  recipientCnpj: HSH,
  purchaseOrder: null,
  status: "received",
  receivedAt: new Date("2026-10-21T13:00:00Z"),
  invoiceTotalCents: 150000,
  invoiceVolumeCount: 4,
  ...extra,
});

describe("notaSemAgendamento", () => {
  it("monta a linha do relatório, com o que faltar em branco", () => {
    const nota = notaSemAgendamento(linha());
    expect(nota).toMatchObject({ nota: "1951057", fornecedor: "Cremer", unidade: "HSH", pedido: "—", valorCentavos: 150000, volumes: 4 });
  });

  it("deixa de fora o que não foi recebido", () => {
    expect(notaSemAgendamento(linha({ status: "pending" }))).toBeNull();
    expect(notaSemAgendamento(linha({ status: "scheduled" }))).toBeNull();
    expect(notaSemAgendamento(linha({ status: "rejected" }))).toBeNull();
  });

  it("aceita Recebido, Concluído e Backlog", () => {
    for (const status of ["received", "completed", "backlog"]) {
      expect(notaSemAgendamento(linha({ status }))).not.toBeNull();
    }
  });

  it("sem data de recebimento, não entra", () => {
    expect(notaSemAgendamento(linha({ receivedAt: null }))).toBeNull();
  });

  it("CNPJ desconhecido vira 'Sem unidade', e não some do relatório", () => {
    expect(notaSemAgendamento(linha({ recipientCnpj: "00000000000000" }))?.unidade).toBe("Sem unidade");
  });
});

describe("resumoSemAgendamento", () => {
  it("conta por dia de Brasília e por unidade", () => {
    const notas = [
      notaSemAgendamento(linha({ id: 1, receivedAt: new Date("2026-10-21T13:00:00Z") })),
      notaSemAgendamento(linha({ id: 2, receivedAt: new Date("2026-10-21T15:00:00Z"), recipientCnpj: RVD })),
      notaSemAgendamento(linha({ id: 3, receivedAt: new Date("2026-10-23T02:30:00Z") })),
    ].filter((nota): nota is NonNullable<typeof nota> => nota !== null);
    const resumo = resumoSemAgendamento(notas);
    expect(resumo.total).toBe(3);
    // 02:30 de 23/10 em UTC é 22/10 em São Paulo.
    expect(resumo.porDia).toEqual([
      { data: "2026-10-21", quantidade: 2 },
      { data: "2026-10-22", quantidade: 1 },
    ]);
    expect(resumo.porUnidade).toEqual([
      { unidade: "HSH", quantidade: 2 },
      { unidade: "RVD", quantidade: 1 },
    ]);
  });

  it("ranqueia os fornecedores pelo nome", () => {
    const notas = [
      notaSemAgendamento(linha({ id: 1, fornecedor: "Cremer" })),
      notaSemAgendamento(linha({ id: 2, fornecedor: "Cremer" })),
      notaSemAgendamento(linha({ id: 3, fornecedor: "Biolab" })),
    ].filter((nota): nota is NonNullable<typeof nota> => nota !== null);
    expect(resumoSemAgendamento(notas).porFornecedor).toEqual([
      { fornecedor: "Cremer", quantidade: 2 },
      { fornecedor: "Biolab", quantidade: 1 },
    ]);
  });

  it("sem notas, o resumo é zero", () => {
    expect(resumoSemAgendamento([])).toEqual({ total: 0, porDia: [], porDiaEUnidade: [], porUnidade: [], porFornecedor: [], ranking: [] });
  });

  it("organiza o ranking por unidade, HSH e MSH primeiro, com a parte de cada fornecedor", () => {
    const MSH = "43293604002120";
    const notas = [
      notaSemAgendamento(linha({ id: 1, fornecedor: "Cremer", recipientCnpj: HSH })),
      notaSemAgendamento(linha({ id: 2, fornecedor: "Biolab", recipientCnpj: HSH })),
      notaSemAgendamento(linha({ id: 3, fornecedor: "Biolab", recipientCnpj: HSH })),
      notaSemAgendamento(linha({ id: 4, fornecedor: "Cremer", recipientCnpj: MSH })),
      notaSemAgendamento(linha({ id: 5, fornecedor: "Cremer", recipientCnpj: RVD })),
    ].filter((nota): nota is NonNullable<typeof nota> => nota !== null);
    const { ranking } = resumoSemAgendamento(notas);
    expect(ranking.map(item => item.unidade)).toEqual(["HSH", "MSH", "RVD"]);
    expect(ranking[0]).toEqual({
      unidade: "HSH",
      total: 3,
      fornecedores: [
        { fornecedor: "Biolab", quantidade: 2, percentual: 66.7 },
        { fornecedor: "Cremer", quantidade: 1, percentual: 33.3 },
      ],
    });
  });

  it("separa cada dia por unidade para o gráfico empilhado", () => {
    const MSH = "43293604002120";
    const notas = [
      notaSemAgendamento(linha({ id: 1, recipientCnpj: HSH })),
      notaSemAgendamento(linha({ id: 2, recipientCnpj: MSH })),
      notaSemAgendamento(linha({ id: 3, recipientCnpj: MSH })),
    ].filter((nota): nota is NonNullable<typeof nota> => nota !== null);
    expect(resumoSemAgendamento(notas).porDiaEUnidade).toEqual([
      { data: "2026-10-21", total: 3, unidades: { HSH: 1, MSH: 2 } },
    ]);
  });
});
