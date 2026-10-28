import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { resumoSemAgendamento, type NotaSemAgendamento } from "@shared/recebimentoSemAgendamento";
import { montarFolhas, montarGraficoDePizza, montarPlanilhaSemAgendamento } from "./planilhaSemAgendamento";

const nota = (extra: Partial<NotaSemAgendamento>): NotaSemAgendamento => ({
  id: 1,
  nota: "1951057",
  fornecedor: "Cremer",
  unidade: "HSH",
  pedido: "—",
  status: "received",
  recebidoEm: "2026-10-21T13:00:00.000Z",
  valorCentavos: 150000,
  volumes: 4,
  ...extra,
});

const NOTAS = [
  nota({ id: 1, fornecedor: "Cremer", unidade: "HSH" }),
  nota({ id: 2, fornecedor: "Biolab", unidade: "HSH" }),
  nota({ id: 3, fornecedor: "Biolab", unidade: "HSH" }),
  nota({ id: 4, fornecedor: "Cremer", unidade: "MSH" }),
  nota({ id: 5, fornecedor: "Cremer", unidade: "RVD" }),
];

const entrada = () => ({ notas: NOTAS, resumo: resumoSemAgendamento(NOTAS), desde: "2026-10-01", ate: "2026-10-31" });

describe("montarFolhas", () => {
  it("organiza de macro para micro: Resumo, uma aba por unidade na ordem do ranking, e Notas", () => {
    const folhas = montarFolhas(entrada());
    expect(folhas.map(folha => folha.nome)).toEqual(["Resumo", "HSH", "MSH", "RVD", "Notas"]);
  });

  it("o ranking de cada unidade traz a porcentagem da unidade e do total", () => {
    const hsh = montarFolhas(entrada()).find(folha => folha.nome === "HSH");
    expect(hsh?.linhas[3]).toEqual(["Fornecedor", "Notas", "% da unidade", "% do total"]);
    const biolab = hsh?.linhas[4] ?? [];
    expect(biolab.slice(0, 2)).toEqual(["Biolab", 2]);
    expect(biolab[2]).toBeCloseTo(0.667, 3);
    expect(biolab[3]).toBeCloseTo(0.4, 3);
    const cremer = hsh?.linhas[5] ?? [];
    expect(cremer.slice(0, 2)).toEqual(["Cremer", 1]);
    expect(cremer[2]).toBeCloseTo(0.333, 3);
    expect(cremer[3]).toBeCloseTo(0.2, 3);
    expect(hsh?.porcentagens).toEqual(["C5", "D5", "C6", "D6"]);
  });

  it("a pizza da unidade aponta para a faixa certa da própria aba", () => {
    const hsh = montarFolhas(entrada()).find(folha => folha.nome === "HSH");
    expect(hsh?.pizza?.categorias).toEqual(["Biolab", "Cremer"]);
    expect(hsh?.pizza?.valores).toEqual([2, 1]);
    expect(hsh?.pizza?.primeiraLinha).toBe(4);
  });

  it("a pizza do Resumo mostra a parte de cada unidade", () => {
    const resumo = montarFolhas(entrada()).find(folha => folha.nome === "Resumo");
    expect(resumo?.pizza?.categorias).toEqual(["HSH", "MSH", "RVD"]);
    expect(resumo?.pizza?.valores).toEqual([3, 1, 1]);
  });
});

describe("montarGraficoDePizza", () => {
  it("liga as categorias e os valores às células da aba, e mostra a porcentagem", () => {
    const xml = montarGraficoDePizza({ titulo: "HSH", nomeDaAba: "HSH", primeiraLinha: 4, categorias: ["Biolab", "Cremer"], valores: [2, 1], ancora: { coluna: 5, linha: 3 } });
    expect(xml).toContain("<c:pieChart>");
    expect(xml).toContain("<c:f>'HSH'!$A$5:$A$6</c:f>");
    expect(xml).toContain("<c:f>'HSH'!$B$5:$B$6</c:f>");
    expect(xml).toContain('<c:showPercent val="1"/>');
    expect(xml).toContain("<c:v>Biolab</c:v>");
  });

  it("escapa o nome do fornecedor no XML", () => {
    const xml = montarGraficoDePizza({ titulo: "HSH", nomeDaAba: "HSH", primeiraLinha: 4, categorias: ["A & B <Ltda>"], valores: [1], ancora: { coluna: 0, linha: 0 } });
    expect(xml).toContain("A &amp; B &lt;Ltda&gt;");
    expect(xml).not.toContain("A & B");
  });
});

describe("montarPlanilhaSemAgendamento", () => {
  it("gera um .xlsx com as abas e as partes dos gráficos de pizza", async () => {
    const bytes = await montarPlanilhaSemAgendamento(entrada());
    const arquivos = unzipSync(bytes);
    expect(Object.keys(arquivos)).toEqual(expect.arrayContaining([
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/_rels/sheet1.xml.rels",
      "xl/drawings/drawing1.xml",
      "xl/drawings/_rels/drawing1.xml.rels",
      "xl/charts/chart1.xml",
    ]));
    const conteudo = new TextDecoder().decode(arquivos["[Content_Types].xml"]);
    expect(conteudo).toContain("/xl/charts/chart1.xml");
    expect(conteudo).toContain("/xl/drawings/drawing1.xml");
    const folha = new TextDecoder().decode(arquivos["xl/worksheets/sheet1.xml"]);
    expect(folha).toContain('<drawing r:id="rId1"/>');
  });
});
