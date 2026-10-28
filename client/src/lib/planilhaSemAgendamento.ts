import type { NotaSemAgendamento, ResumoSemAgendamento } from "@shared/recebimentoSemAgendamento";
import { formatReportDate, formatReportMoney } from "@/lib/reports";
import { unzipSync, zipSync } from "fflate";

/**
 * A planilha do recebimento sem agendamento, organizada de macro para micro.
 *
 * Aba Resumo: o total e a parte de cada unidade, com pizza. Uma aba por
 * unidade (HSH, MSH e as outras que tiverem nota): o ranking de quem mandou,
 * com a porcentagem da unidade e do total, e pizza. Aba Notas: a lista inteira,
 * para conferir nota a nota.
 *
 * O SheetJS monta as abas, mas não escreve gráficos. Os gráficos de pizza são
 * acrescentados ao arquivo depois, como as partes que o Excel espera (desenho e
 * gráfico), e o arquivo é fechado de novo com o mesmo conteúdo.
 */

export const COLUNAS_DA_NOTA = ["Nota fiscal", "Fornecedor", "Unidade", "Pedido", "Status", "Recebido em", "Valor", "Volumes"] as const;

const STATUS: Record<string, string> = { received: "Recebido", completed: "Concluído", backlog: "Backlog" };

/** As cores das fatias, na ordem das fatias. A primeira é a da marca. */
const CORES_DAS_FATIAS = ["782078", "8FBED1", "C76FB8", "4B5563", "E0A96D", "6C8EBF", "A3C98F", "D98C8C"];

export function linhaDaNota(nota: NotaSemAgendamento): Record<(typeof COLUNAS_DA_NOTA)[number], string> {
  return {
    "Nota fiscal": nota.nota,
    Fornecedor: nota.fornecedor,
    Unidade: nota.unidade,
    Pedido: nota.pedido,
    Status: STATUS[nota.status] ?? nota.status,
    "Recebido em": formatReportDate(nota.recebidoEm),
    Valor: nota.valorCentavos === null ? "—" : formatReportMoney(nota.valorCentavos),
    Volumes: nota.volumes === null ? "—" : String(nota.volumes),
  };
}

/** "2026-10-21" como "21/10/2026". */
function dataBrasileira(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Um gráfico de pizza: as categorias e os valores vêm de uma faixa da própria aba. */
type Pizza = {
  titulo: string;
  nomeDaAba: string;
  /** Linha (base 0) da primeira categoria na aba. As categorias ficam na coluna A e os valores na B. */
  primeiraLinha: number;
  categorias: string[];
  valores: number[];
  /** Onde o gráfico aparece: coluna e linha (base 0) do canto superior esquerdo. */
  ancora: { coluna: number; linha: number };
};

type Folha = {
  nome: string;
  linhas: (string | number | null)[][];
  /** Células com porcentagem, como "C5": saem com formato de 0,0%. */
  porcentagens: string[];
  /** Largura por coluna, em caracteres. */
  larguras: number[];
  pizza?: Pizza;
};

const escapar = (texto: string) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const referencia = (nomeDaAba: string, coluna: string, primeiraLinha: number, quantidade: number) =>
  `'${nomeDaAba}'!$${coluna}$${primeiraLinha + 1}:$${coluna}$${primeiraLinha + quantidade}`;

/**
 * A parte de gráfico que o Excel lê: uma pizza com a porcentagem em cada fatia
 * e a legenda ao lado. Exportado para o teste conferir a estrutura.
 */
export function montarGraficoDePizza(pizza: Pizza): string {
  const n = pizza.categorias.length;
  const cache = (valores: string[]) => valores.map((valor, indice) => `<c:pt idx="${indice}"><c:v>${escapar(valor)}</c:v></c:pt>`).join("");
  const fatias = pizza.categorias.map((_, indice) =>
    `<c:dPt><c:idx val="${indice}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${CORES_DAS_FATIAS[indice % CORES_DAS_FATIAS.length]}"/></a:solidFill></c:spPr></c:dPt>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="pt-BR" sz="1200" b="1"/><a:t>${escapar(pizza.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Notas</c:v></c:tx>${fatias}<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"/></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr><c:dLblPos val="bestFit"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls><c:cat><c:strRef><c:f>${escapar(referencia(pizza.nomeDaAba, "A", pizza.primeiraLinha, n))}</c:f><c:strCache><c:ptCount val="${n}"/>${cache(pizza.categorias)}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${escapar(referencia(pizza.nomeDaAba, "B", pizza.primeiraLinha, n))}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${pizza.valores.map((valor, indice) => `<c:pt idx="${indice}"><c:v>${valor}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:val></c:ser><c:firstSliceAng val="0"/></c:pieChart></c:plotArea><c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

/** O desenho que prende o gráfico numa posição da aba. */
function montarDesenho(pizza: Pizza): string {
  const { coluna, linha } = pizza.ancora;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>${coluna}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${linha}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${coluna + 7}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${linha + 20}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="${escapar(pizza.titulo)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
}

const RELACAO_DE_DESENHO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const RELACAO_DE_GRAFICO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const TIPO_DE_DESENHO = "application/vnd.openxmlformats-officedocument.drawing+xml";
const TIPO_DE_GRAFICO = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const RELACIONAMENTOS = "http://schemas.openxmlformats.org/package/2006/relationships";

/** Monta as folhas a partir do resumo e da lista. Função pura: o arquivo sai daqui. */
export function montarFolhas(input: { notas: NotaSemAgendamento[]; resumo: ResumoSemAgendamento; desde: string; ate: string }): Folha[] {
  const { notas, resumo, desde, ate } = input;
  const folhas: Folha[] = [];
  const porcentagemDoTotal = (quantidade: number) => (resumo.total ? quantidade / resumo.total : 0);

  // Resumo: a visão de cima. O total, a parte de cada unidade e a pizza das unidades.
  const linhasDoResumo: (string | number | null)[][] = [
    ["Notas recebidas sem agendamento"],
    [`Período: ${dataBrasileira(desde)} a ${dataBrasileira(ate)}`],
    ["Total de notas", resumo.total],
    [],
    ["Unidade", "Notas", "% do total"],
    ...resumo.porUnidade.map(item => [item.unidade, item.quantidade, porcentagemDoTotal(item.quantidade)]),
  ];
  const porcentagensDoResumo = resumo.porUnidade.map((_, indice) => `C${6 + indice}`);
  folhas.push({
    nome: "Resumo",
    linhas: linhasDoResumo,
    porcentagens: porcentagensDoResumo,
    larguras: [34, 12, 14],
    pizza: resumo.porUnidade.length
      ? {
          titulo: "Notas por unidade",
          nomeDaAba: "Resumo",
          primeiraLinha: 5,
          categorias: resumo.porUnidade.map(item => item.unidade),
          valores: resumo.porUnidade.map(item => item.quantidade),
          ancora: { coluna: 4, linha: 3 },
        }
      : undefined,
  });

  // Uma aba por unidade: quem mandou, do maior para o menor, com as duas porcentagens.
  for (const grupo of resumo.ranking) {
    const linhas: (string | number | null)[][] = [
      [`${grupo.unidade} — notas recebidas sem agendamento`],
      ["Total na unidade", grupo.total],
      [],
      ["Fornecedor", "Notas", "% da unidade", "% do total"],
      ...grupo.fornecedores.map(item => [item.fornecedor, item.quantidade, item.percentual / 100, porcentagemDoTotal(item.quantidade)]),
    ];
    const nomeDaAba = grupo.unidade.slice(0, 31);
    folhas.push({
      nome: nomeDaAba,
      linhas,
      porcentagens: grupo.fornecedores.flatMap((_, indice) => [`C${5 + indice}`, `D${5 + indice}`]),
      larguras: [40, 12, 16, 14],
      pizza: {
        titulo: `${grupo.unidade}: notas por fornecedor`,
        nomeDaAba,
        primeiraLinha: 4,
        categorias: grupo.fornecedores.map(item => item.fornecedor),
        valores: grupo.fornecedores.map(item => item.quantidade),
        ancora: { coluna: 5, linha: 3 },
      },
    });
  }

  // A lista inteira, na ordem da organização: unidade, depois fornecedor, depois a data.
  const ordemDaUnidade = new Map(resumo.ranking.map((grupo, indice) => [grupo.unidade, indice]));
  const notasOrdenadas = [...notas].sort((a, b) => {
    const unidade = (ordemDaUnidade.get(a.unidade) ?? 0) - (ordemDaUnidade.get(b.unidade) ?? 0);
    if (unidade) return unidade;
    const fornecedor = a.fornecedor.localeCompare(b.fornecedor, "pt-BR");
    if (fornecedor) return fornecedor;
    return b.recebidoEm.localeCompare(a.recebidoEm);
  });
  folhas.push({
    nome: "Notas",
    linhas: [[...COLUNAS_DA_NOTA], ...notasOrdenadas.map(nota => Object.values(linhaDaNota(nota)))],
    porcentagens: [],
    larguras: [16, 36, 10, 16, 14, 18, 16, 10],
  });
  return folhas;
}

/**
 * Monta o arquivo .xlsx completo: as abas, as porcentagens e as pizzas.
 * Usa o SheetJS para as abas e o fflate para acrescentar os gráficos.
 */
export async function montarPlanilhaSemAgendamento(input: { notas: NotaSemAgendamento[]; resumo: ResumoSemAgendamento; desde: string; ate: string }): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const folhas = montarFolhas(input);
  const livro = XLSX.utils.book_new();
  for (const folha of folhas) {
    const planilha = XLSX.utils.aoa_to_sheet(folha.linhas as unknown[][]);
    for (const ref of folha.porcentagens) {
      const celula = planilha[ref];
      if (celula) celula.z = "0.0%";
    }
    planilha["!cols"] = folha.larguras.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(livro, planilha, folha.nome);
  }
  const bytes = new Uint8Array(XLSX.write(livro, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  return acrescentarGraficos(bytes, folhas);
}

/** Acrescenta as partes de gráfico ao arquivo que o SheetJS escreveu. */
function acrescentarGraficos(bytes: Uint8Array, folhas: Folha[]): Uint8Array {
  const arquivos = unzipSync(bytes);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const texto = (nome: string) => decoder.decode(arquivos[nome]);
  let tiposXml = texto("[Content_Types].xml");

  let contador = 0;
  folhas.forEach((folha, indice) => {
    if (!folha.pizza) return;
    contador += 1;
    const numeroDaFolha = indice + 1;
    const caminhoDaFolha = `xl/worksheets/sheet${numeroDaFolha}.xml`;
    let xmlDaFolha = texto(caminhoDaFolha);
    if (!xmlDaFolha.includes("xmlns:r=")) {
      xmlDaFolha = xmlDaFolha.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    }
    xmlDaFolha = xmlDaFolha.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>');
    arquivos[caminhoDaFolha] = encoder.encode(xmlDaFolha);

    arquivos[`xl/worksheets/_rels/sheet${numeroDaFolha}.xml.rels`] = encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELACIONAMENTOS}"><Relationship Id="rId1" Type="${RELACAO_DE_DESENHO}" Target="../drawings/drawing${contador}.xml"/></Relationships>`,
    );
    arquivos[`xl/drawings/drawing${contador}.xml`] = encoder.encode(montarDesenho(folha.pizza));
    arquivos[`xl/drawings/_rels/drawing${contador}.xml.rels`] = encoder.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELACIONAMENTOS}"><Relationship Id="rId1" Type="${RELACAO_DE_GRAFICO}" Target="../charts/chart${contador}.xml"/></Relationships>`,
    );
    arquivos[`xl/charts/chart${contador}.xml`] = encoder.encode(montarGraficoDePizza(folha.pizza));
    tiposXml = tiposXml.replace(
      "</Types>",
      `<Override PartName="/xl/drawings/drawing${contador}.xml" ContentType="${TIPO_DE_DESENHO}"/><Override PartName="/xl/charts/chart${contador}.xml" ContentType="${TIPO_DE_GRAFICO}"/></Types>`,
    );
  });

  arquivos["[Content_Types].xml"] = encoder.encode(tiposXml);
  return zipSync(arquivos);
}

/** Entrega o arquivo ao navegador, como o baixarPlanilha faz. */
export async function baixarPlanilhaSemAgendamento(input: { notas: NotaSemAgendamento[]; resumo: ResumoSemAgendamento; desde: string; ate: string; arquivo: string }) {
  const bytes = await montarPlanilhaSemAgendamento(input);
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = input.arquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
