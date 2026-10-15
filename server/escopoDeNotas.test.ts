import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notaPelaChaveDoArquivo: vi.fn(),
  listApprovedCompanyUserIds: vi.fn(),
  listarIdsDaEmpresa: vi.fn(),
}));

vi.mock("./db", () => mocks);

const { idsNoEscopo, podeBaixarArquivo, podeVerNota } = await import("./escopoDeNotas");

const CHAVE = "agendamentos-xml/41/nota_a1b2c3d4.xml";

const fornecedor = (dados: Partial<Parameters<typeof idsNoEscopo>[0]> = {}) => ({
  id: 41,
  role: "supplier" as const,
  companyCnpj: "12420164000580",
  ...dados,
});

beforeEach(() => {
  mocks.notaPelaChaveDoArquivo.mockReset();
  mocks.listApprovedCompanyUserIds.mockReset().mockResolvedValue([]);
  mocks.listarIdsDaEmpresa.mockReset().mockResolvedValue([]);
});

describe("quem pode baixar o anexo da nota", () => {
  it("o fornecedor baixa o arquivo da própria nota", async () => {
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 7, supplierId: 41 });
    expect(await podeBaixarArquivo(fornecedor(), CHAVE)).toBe(true);
  });

  it("e não baixa o de outro fornecedor, mesmo sabendo o nome do arquivo", async () => {
    // É o buraco que isto fecha: antes bastava estar logado e conhecer a
    // chave, e o sigilo ficava por conta do sufixo sorteado no nome.
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 8, supplierId: 99 });
    expect(await podeBaixarArquivo(fornecedor(), CHAVE)).toBe(false);
  });

  it("as contas da mesma empresa dividem os arquivos", async () => {
    mocks.listApprovedCompanyUserIds.mockResolvedValue([41, 55]);
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 9, supplierId: 55 });
    expect(await podeBaixarArquivo(fornecedor(), CHAVE)).toBe(true);
  });

  it("conta sem CNPJ válido só alcança o que ela mesma mandou", async () => {
    // Agrupar as contas sem CNPJ juntas seria o vazamento que o escopo existe
    // para evitar.
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 10, supplierId: 99 });
    expect(await podeBaixarArquivo(fornecedor({ companyCnpj: "00000000000000" }), CHAVE)).toBe(false);
    expect(await podeBaixarArquivo(fornecedor({ companyCnpj: null }), CHAVE)).toBe(false);
  });

  it("a mesa de agendamentos lê a agenda inteira", async () => {
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 11, supplierId: 99 });
    for (const role of ["operator", "admin", "planejador"] as const) {
      expect(await podeBaixarArquivo({ id: 1, role }, CHAVE)).toBe(true);
    }
  });

  it("quem não cuida da agenda não entra pela porta dos arquivos", async () => {
    mocks.notaPelaChaveDoArquivo.mockResolvedValue({ id: 12, supplierId: 99 });
    for (const role of ["portaria", "operacao"] as const) {
      expect(await podeBaixarArquivo({ id: 2, role }, CHAVE)).toBe(false);
    }
  });

  it("chave sem nota dona não é liberada para ninguém", async () => {
    // O bucket guarda mais coisas que anexos. Sem dono para comparar, negar é
    // a única resposta honesta.
    mocks.notaPelaChaveDoArquivo.mockResolvedValue(null);
    expect(await podeBaixarArquivo({ id: 1, role: "admin" }, CHAVE)).toBe(false);
    expect(await podeBaixarArquivo(fornecedor(), CHAVE)).toBe(false);
  });
});

describe("o escopo do fornecedor", () => {
  it("sempre inclui a própria conta, mesmo quando a busca da empresa volta vazia", async () => {
    mocks.listApprovedCompanyUserIds.mockResolvedValue([]);
    expect(await idsNoEscopo(fornecedor())).toEqual([41]);
  });

  it("a empresa cadastrada manda mais que o CNPJ solto", async () => {
    mocks.listarIdsDaEmpresa.mockResolvedValue([41, 77]);
    expect(await idsNoEscopo(fornecedor({ companyId: 3 }))).toEqual([41, 77]);
    expect(mocks.listApprovedCompanyUserIds).not.toHaveBeenCalled();
  });

  it("nota sem fornecedor não cai no colo de ninguém", async () => {
    expect(await podeVerNota(fornecedor(), null)).toBe(false);
  });
});
