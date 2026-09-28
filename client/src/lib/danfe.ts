import type { jsPDF } from "jspdf";
import type { NotaCompleta } from "@shared/notaCompleta";
import { carregarFerramentasDoPdf, getRvdLogoDataUrl } from "./receiptCertificatePdf";

/**
 * O DANFE, no desenho que a SEFAZ especifica.
 *
 * O espelho resolve conferir; este resolve reconhecer. Quem trabalha com
 * recebimento leu esta folha dez mil vezes e acha cada dado pela posição, sem
 * ler rótulo: a chave em cima à direita, o total à direita do quadro de
 * imposto, os itens embaixo. Um layout bonito porém diferente obriga a pessoa a
 * procurar — e procurar, na doca, com o caminhão parado, é o que ninguém tem.
 *
 * O código de barras é de verdade: Code 128C dos 44 dígitos da chave, o mesmo
 * que o leitor do almoxarifado espera. Foi conferido com um decodificador
 * independente, lendo de volta a chave que entrou.
 *
 * Continua não sendo documento fiscal: o que vale é a autorização na SEFAZ, e
 * a folha diz isso. Quando o XML é de homologação, a tarja de "SEM VALOR
 * FISCAL" aparece atravessada, como manda o manual — é o caso em que imprimir
 * sem avisar seria mentira.
 */

const MARGEM = 6;
const LARGURA = 198;
const DIREITA = MARGEM + LARGURA;
const TINTA: [number, number, number] = [0, 0, 0];

type Celula = {
  largura: number;
  rotulo?: string;
  valor?: string;
  /** Alinhamento do valor: números vão à direita, como no DANFE. */
  fim?: boolean;
  centro?: boolean;
  /** Corpo maior, para o que a pessoa procura de longe. */
  destaque?: boolean;
  /** Valor com mais de uma linha (endereço do transportador, observações). */
  linhas?: string[];
};

function texto(valor: string | null | undefined): string {
  return (valor ?? "").trim();
}

export function formatarDocumento(digitos: string | null): string {
  const d = (digitos ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

export function formatarCep(valor: string | null): string {
  const d = (valor ?? "").replace(/\D/g, "");
  return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, "$1-$2") : texto(valor);
}

/** A chave em blocos de quatro, como o DANFE imprime embaixo do código de barras. */
export function chaveFormatada(chave: string | null): string {
  const d = (chave ?? "").replace(/\D/g, "");
  return d ? d.replace(/(.{4})/g, "$1 ").trim() : "";
}

export function danfeFileName(numero: string | null): string {
  return `danfe-nfe-${numero || "sem-numero"}.pdf`;
}

function dinheiro(centavos: number | null | undefined, vazio = ""): string {
  if (centavos === null || centavos === undefined) return vazio;
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numero(valor: number | null | undefined, casas = 4): string {
  if (valor === null || valor === undefined) return "";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas === 0 ? 0 : 2, maximumFractionDigits: casas });
}

function dataHora(valor: Date | null, comHora = false): string {
  if (!valor) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(comHora ? { dateStyle: "short" as const, timeStyle: "short" as const } : { dateStyle: "short" as const }),
  }).format(valor);
}

/**
 * Uma fileira de quadros, que é a unidade de construção da folha inteira.
 *
 * O DANFE é uma grade: cada fileira tem a mesma altura e soma a mesma largura,
 * e cada quadro tem o rótulo miúdo em cima e o valor embaixo. Desenhar isso uma
 * vez e repetir é o que mantém as linhas alinhadas de um quadro para o outro —
 * feito à mão, quadro por quadro, elas desencontram por décimos de milímetro e
 * a folha fica torta.
 */
function fileira(doc: jsPDF, y: number, altura: number, celulas: Celula[]): number {
  let x = MARGEM;
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.2);
  for (const celula of celulas) {
    doc.rect(x, y, celula.largura, altura);
    if (celula.rotulo) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.6);
      doc.text(celula.rotulo.toUpperCase(), x + 1, y + 2.6);
    }
    const alturaDoRotulo = celula.rotulo ? 3.2 : 0;
    doc.setFont("helvetica", celula.destaque ? "bold" : "normal");
    doc.setFontSize(celula.destaque ? 8.5 : 6.8);
    const conteudo = celula.linhas ?? [texto(celula.valor)];
    conteudo.forEach((linha, indice) => {
      if (!linha) return;
      const alvo = celula.fim ? x + celula.largura - 1 : celula.centro ? x + celula.largura / 2 : x + 1;
      // Sem maxWidth quando as linhas já vêm quebradas: o jsPDF quebraria de
      // novo, com o espaçamento dele, por cima das linhas escritas aqui.
      doc.text(linha, alvo, y + alturaDoRotulo + 3.4 + indice * 3, {
        align: celula.fim ? "right" : celula.centro ? "center" : "left",
        ...(celula.linhas ? {} : { maxWidth: celula.largura - 2 }),
      });
    });
    x += celula.largura;
  }
  return y + altura;
}

/** O título de seção: a barrinha com o nome do bloco, em versal miúdo. */
function secao(doc: jsPDF, y: number, titulo: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.4);
  doc.text(titulo.toUpperCase(), MARGEM, y + 2.4);
  return y + 3.2;
}

/**
 * O código de barras da chave.
 *
 * Code 128C porque é o que o manual manda e o que o leitor de mão do
 * almoxarifado espera. A biblioteca entrega a sequência de barras; aqui ela
 * vira retângulo no PDF, que é a única parte que o navegador precisa fazer.
 */
async function barrasDaChave(doc: jsPDF, chave: string, x: number, y: number, largura: number, altura: number) {
  const { CODE128C } = await import("jsbarcode/bin/barcodes/CODE128/index.js");
  const codificador = new CODE128C(chave, {});
  if (!codificador.valid()) return;
  const bits: string = codificador.encode().data;
  const espessura = largura / bits.length;
  doc.setFillColor(0, 0, 0);
  let indice = 0;
  while (indice < bits.length) {
    if (bits[indice] === "0") {
      indice += 1;
      continue;
    }
    let fim = indice;
    while (fim < bits.length && bits[fim] === "1") fim += 1;
    doc.rect(x + indice * espessura, y, (fim - indice) * espessura, altura, "F");
    indice = fim;
  }
}

/** Linha pontilhada do canhoto: onde a folha é dobrada e destacada. */
function tracejado(doc: jsPDF, y: number) {
  doc.setLineWidth(0.2);
  for (let x = MARGEM; x < DIREITA; x += 3) {
    doc.line(x, y, Math.min(x + 1.6, DIREITA), y);
  }
}

const ALTURA_DA_LINHA_DE_ITEM = 3.4;

/**
 * Quanto sobra para os itens em cada folha.
 *
 * A primeira perde quase tudo para o canhoto, o cabeçalho, o destinatário, os
 * impostos e o transporte; as seguintes só repetem o cabeçalho. São medidas do
 * desenho, e é por isso que estão aqui em cima, ao lado dele: mexer na altura
 * de um quadro sem mexer nestes números faz a tabela invadir o rodapé.
 */
const ESPACO_DE_ITENS_NA_PRIMEIRA = 70;
const ESPACO_DE_ITENS_NAS_DEMAIS = 193;

/** Onde a tabela de itens termina, sobre ou não conteúdo — como no DANFE impresso. */
const FIM_DA_TABELA = 257;
/** O bloco de observações, ancorado no pé da última folha. */
const TOPO_DOS_ADICIONAIS = 258;

const COLUNAS = [
  { rotulo: "CÓDIGO", largura: 18 },
  { rotulo: "DESCRIÇÃO DO PRODUTO / SERVIÇO", largura: 54 },
  { rotulo: "NCM/SH", largura: 13 },
  { rotulo: "CST", largura: 7 },
  { rotulo: "CFOP", largura: 9 },
  { rotulo: "UN", largura: 9 },
  { rotulo: "QUANT.", largura: 13 },
  { rotulo: "VALOR UNIT.", largura: 17 },
  { rotulo: "VALOR TOTAL", largura: 17 },
  { rotulo: "B.CÁLC. ICMS", largura: 14 },
  { rotulo: "VLR. ICMS", largura: 13 },
  { rotulo: "ALÍQ.", largura: 14 },
] as const;

function cabecalhoDosItens(doc: jsPDF, y: number): number {
  let x = MARGEM;
  doc.setLineWidth(0.2);
  doc.rect(MARGEM, y, LARGURA, 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.6);
  for (const coluna of COLUNAS) {
    if (x > MARGEM) doc.line(x, y, x, y + 5);
    doc.text(coluna.rotulo, x + 1, y + 3.2, { maxWidth: coluna.largura - 2 });
    x += coluna.largura;
  }
  return y + 5;
}

export async function gerarDanfe(nota: NotaCompleta, opcoes: { logo?: boolean } = {}): Promise<jsPDF> {
  const { jsPDF } = await carregarFerramentasDoPdf();
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setTextColor(...TINTA);

  // Quantas páginas os itens vão ocupar: o cabeçalho diz "FOLHA 1/3" antes de
  // a terceira existir, então a conta vem antes do desenho.
  // A medida precisa ser tirada com a fonte que vai ser usada para escrever: o
  // padrão do jsPDF é bem maior, e medir com ele dava linha de item com o
  // triplo da altura — a tabela transbordava a folha por cima do rodapé.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  const alturaDeCadaItem = nota.itens.map(item => {
    const linhas = doc.splitTextToSize(item.descricao, COLUNAS[1].largura - 2) as string[];
    return Math.max(ALTURA_DA_LINHA_DE_ITEM, linhas.length * 2.2 + 1.2);
  });
  const paginas = paginar(alturaDeCadaItem, ESPACO_DE_ITENS_NA_PRIMEIRA, ESPACO_DE_ITENS_NAS_DEMAIS);
  const totalDePaginas = paginas.length;

  for (let pagina = 0; pagina < totalDePaginas; pagina += 1) {
    if (pagina > 0) doc.addPage();
    const primeira = pagina === 0;
    let y = MARGEM;

    if (primeira) {
      // Canhoto: o comprovante que fica com quem entregou.
      y = fileira(doc, y, 11, [
        {
          largura: 152,
          linhas: [
            `RECEBEMOS DE ${texto(nota.emitente.nome).toUpperCase()}`,
            "OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO",
          ],
        },
        { largura: 46, centro: true, linhas: ["NF-e", `Nº ${formatarNumero(nota.numero)}`, `SÉRIE ${texto(nota.serie).padStart(3, "0")}`] },
      ]);
      y = fileira(doc, y, 8, [
        { largura: 40, rotulo: "Data de recebimento" },
        { largura: 112, rotulo: "Identificação e assinatura do recebedor" },
        { largura: 46 },
      ]);
      tracejado(doc, y + 2);
      y += 4;
    }

    // Cabeçalho: emitente, identificação do DANFE e a chave com o código de barras.
    const topo = y;
    doc.setLineWidth(0.2);
    doc.rect(MARGEM, topo, 74, 32);
    if (opcoes.logo !== false) {
      try {
        doc.addImage(await getRvdLogoDataUrl(), "PNG", MARGEM + 2, topo + 2, 16, 13);
      } catch {
        // Sem logo o quadro segue; o nome do emitente é o que identifica.
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.text(doc.splitTextToSize(texto(nota.emitente.nome), 50) as string[], MARGEM + 21, topo + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    const emit = nota.emitente.endereco;
    doc.text(
      [
        [texto(emit.logradouro), texto(emit.numero)].filter(Boolean).join(", "),
        [texto(emit.bairro), formatarCep(emit.cep)].filter(Boolean).join(" - "),
        [texto(emit.municipio), texto(emit.uf)].filter(Boolean).join(" / "),
        emit.telefone ? `Fone: ${texto(emit.telefone)}` : "",
      ].filter(Boolean),
      MARGEM + 21,
      topo + 12,
    );

    doc.rect(MARGEM + 74, topo, 46, 32);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("DANFE", MARGEM + 97, topo + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.text("Documento Auxiliar da", MARGEM + 97, topo + 9.5, { align: "center" });
    doc.text("Nota Fiscal Eletrônica", MARGEM + 97, topo + 12, { align: "center" });
    doc.setFontSize(5.4);
    doc.text("0 - ENTRADA", MARGEM + 79, topo + 17);
    doc.text("1 - SAÍDA", MARGEM + 79, topo + 20);
    doc.rect(MARGEM + 105, topo + 15, 6, 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(nota.tipo === "entrada" ? "0" : nota.tipo === "saida" ? "1" : "", MARGEM + 108, topo + 19.5, { align: "center" });
    doc.setFontSize(8);
    doc.text(`Nº ${formatarNumero(nota.numero)}`, MARGEM + 97, topo + 25, { align: "center" });
    doc.setFontSize(6.4);
    doc.text(`SÉRIE ${texto(nota.serie).padStart(3, "0")}    FOLHA ${pagina + 1}/${totalDePaginas}`, MARGEM + 97, topo + 29, { align: "center" });

    doc.rect(MARGEM + 120, topo, 78, 32);
    if (nota.chave) await barrasDaChave(doc, nota.chave, MARGEM + 123, topo + 3, 72, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.6);
    doc.text("CHAVE DE ACESSO", MARGEM + 123, topo + 19);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.text(chaveFormatada(nota.chave), MARGEM + 159, topo + 22.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.text(
      doc.splitTextToSize(
        "Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz autorizadora",
        72,
      ) as string[],
      MARGEM + 123,
      topo + 26,
    );
    y = topo + 32;

    y = fileira(doc, y, 8, [
      { largura: 124, rotulo: "Natureza da operação", valor: texto(nota.naturezaDaOperacao) },
      {
        largura: 74,
        rotulo: "Protocolo de autorização de uso",
        valor: [texto(nota.protocolo), dataHora(nota.protocoloEm, true)].filter(Boolean).join("  "),
      },
    ]);
    y = fileira(doc, y, 8, [
      { largura: 74, rotulo: "Inscrição estadual", valor: texto(nota.emitente.inscricaoEstadual) },
      { largura: 60, rotulo: "Inscr. estadual do subst. trib.", valor: texto(nota.emitente.inscricaoSubstituto) },
      { largura: 64, rotulo: "CNPJ", valor: formatarDocumento(nota.emitente.documento) },
    ]);

    if (primeira) {
      const dest = nota.destinatario.endereco;
      y = secao(doc, y + 1, "Destinatário / Remetente");
      y = fileira(doc, y, 8, [
        { largura: 110, rotulo: "Nome / Razão social", valor: texto(nota.destinatario.nome) },
        { largura: 48, rotulo: "CNPJ / CPF", valor: formatarDocumento(nota.destinatario.documento) },
        { largura: 40, rotulo: "Data da emissão", valor: dataHora(nota.emitidaEm), fim: true },
      ]);
      y = fileira(doc, y, 8, [
        { largura: 88, rotulo: "Endereço", valor: [texto(dest.logradouro), texto(dest.numero), texto(dest.complemento)].filter(Boolean).join(", ") },
        { largura: 46, rotulo: "Bairro / Distrito", valor: texto(dest.bairro) },
        { largura: 24, rotulo: "CEP", valor: formatarCep(dest.cep) },
        { largura: 40, rotulo: "Data da saída / entrada", valor: dataHora(nota.saiuEm), fim: true },
      ]);
      y = fileira(doc, y, 8, [
        { largura: 66, rotulo: "Município", valor: texto(dest.municipio) },
        { largura: 34, rotulo: "Fone / Fax", valor: texto(dest.telefone) },
        { largura: 10, rotulo: "UF", valor: texto(dest.uf), centro: true },
        { largura: 48, rotulo: "Inscrição estadual", valor: texto(nota.destinatario.inscricaoEstadual) },
        { largura: 40, rotulo: "Hora de saída", valor: nota.saiuEm ? dataHora(nota.saiuEm, true).split(" ").pop() ?? "" : "", fim: true },
      ]);

      y = secao(doc, y + 1, "Cálculo do imposto");
      const t = nota.totais;
      y = fileira(doc, y, 8, [
        { largura: 40, rotulo: "Base de cálculo do ICMS", valor: dinheiro(t.baseIcmsCents), fim: true },
        { largura: 40, rotulo: "Valor do ICMS", valor: dinheiro(t.valorIcmsCents), fim: true },
        { largura: 39, rotulo: "Base de cálculo do ICMS ST", valor: dinheiro(t.baseIcmsStCents), fim: true },
        { largura: 39, rotulo: "Valor do ICMS ST", valor: dinheiro(t.valorIcmsStCents), fim: true },
        { largura: 40, rotulo: "Valor total dos produtos", valor: dinheiro(t.produtosCents), fim: true },
      ]);
      y = fileira(doc, y, 9, [
        { largura: 33, rotulo: "Valor do frete", valor: dinheiro(t.freteCents), fim: true },
        { largura: 33, rotulo: "Valor do seguro", valor: dinheiro(t.seguroCents), fim: true },
        { largura: 33, rotulo: "Desconto", valor: dinheiro(t.descontoCents), fim: true },
        { largura: 33, rotulo: "Outras despesas", valor: dinheiro(t.outrasCents), fim: true },
        { largura: 33, rotulo: "Valor total do IPI", valor: dinheiro(t.ipiCents), fim: true },
        { largura: 33, rotulo: "Valor total da nota", valor: dinheiro(t.notaCents), fim: true, destaque: true },
      ]);

      const transporte = nota.transporte;
      y = secao(doc, y + 1, "Transportador / Volumes transportados");
      y = fileira(doc, y, 8, [
        { largura: 78, rotulo: "Razão social", valor: texto(transporte.transportador) },
        { largura: 34, rotulo: "Frete por conta", valor: texto(transporte.modalidade) },
        { largura: 20, rotulo: "Placa do veículo", valor: texto(transporte.placa) },
        { largura: 10, rotulo: "UF", valor: texto(transporte.placaUf), centro: true },
        { largura: 56, rotulo: "CNPJ / CPF", valor: formatarDocumento(transporte.documento) },
      ]);
      y = fileira(doc, y, 8, [
        { largura: 78, rotulo: "Endereço", valor: texto(transporte.endereco) },
        { largura: 64, rotulo: "Município", valor: texto(transporte.municipio) },
        { largura: 10, rotulo: "UF", valor: texto(transporte.uf), centro: true },
        { largura: 46, rotulo: "Inscrição estadual", valor: texto(transporte.inscricaoEstadual) },
      ]);
      y = fileira(doc, y, 8, [
        { largura: 26, rotulo: "Quantidade", valor: numero(transporte.quantidade, 0) },
        { largura: 34, rotulo: "Espécie", valor: texto(transporte.especie) },
        { largura: 34, rotulo: "Marca", valor: texto(transporte.marca) },
        { largura: 34, rotulo: "Numeração", valor: texto(transporte.numeracao) },
        { largura: 35, rotulo: "Peso bruto", valor: numero(transporte.pesoBruto, 3), fim: true },
        { largura: 35, rotulo: "Peso líquido", valor: numero(transporte.pesoLiquido, 3), fim: true },
      ]);
      y = secao(doc, y + 1, "Dados do produto / serviço");
    } else {
      y = secao(doc, y + 2, "Dados do produto / serviço (continuação)");
    }

    // Os itens desta página.
    const inicioDaTabela = y;
    y = cabecalhoDosItens(doc, y);
    const doPagina = paginas[pagina];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    for (const indice of doPagina) {
      const item = nota.itens[indice];
      const altura = alturaDeCadaItem[indice];
      let x = MARGEM;
      const valores = [
        texto(item.codigo),
        "",
        texto(item.ncm),
        texto(item.cst),
        texto(item.cfop),
        texto(item.unidade),
        numero(item.quantidade, 2),
        dinheiro(item.valorUnitarioCents),
        dinheiro(item.valorTotalCents),
        dinheiro(item.baseIcmsCents),
        dinheiro(item.valorIcmsCents),
        item.aliquotaIcms === null ? "" : `${numero(item.aliquotaIcms, 2)}%`,
      ];
      COLUNAS.forEach((coluna, posicao) => {
        const aDireita = posicao >= 6;
        if (posicao === 1) {
          doc.text(doc.splitTextToSize(item.descricao, coluna.largura - 2) as string[], x + 1, y + 2.6);
        } else if (valores[posicao]) {
          doc.text(valores[posicao], aDireita ? x + coluna.largura - 1 : x + 1, y + 2.6, { align: aDireita ? "right" : "left" });
        }
        x += coluna.largura;
      });
      y += altura;
    }

    // As divisórias vão do cabeçalho até o pé da tabela, e não linha a linha: é
    // assim que o DANFE se parece com uma tabela e não com uma pilha de
    // retângulos. E o quadro desce até a altura fixa mesmo quando os itens
    // acabam antes — folha com o quadro cortado no meio não é a folha que quem
    // confere conhece.
    doc.setLineWidth(0.2);
    doc.rect(MARGEM, inicioDaTabela, LARGURA, FIM_DA_TABELA - inicioDaTabela);
    let x = MARGEM;
    for (const coluna of COLUNAS) {
      if (x > MARGEM) doc.line(x, inicioDaTabela, x, FIM_DA_TABELA);
      x += coluna.largura;
    }

    if (pagina === totalDePaginas - 1) {
      const topo = secao(doc, TOPO_DOS_ADICIONAIS, "Dados adicionais");
      const observacoes = [texto(nota.informacoesComplementares), texto(nota.informacoesAoFisco)].filter(Boolean).join(" · ");
      // A quebra é medida com a fonte em que o texto vai sair, senão a linha
      // some por baixo do quadro do lado.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      fileira(doc, topo, 26, [
        { largura: 124, rotulo: "Informações complementares", linhas: (doc.splitTextToSize(observacoes, 120) as string[]).slice(0, 6) },
        { largura: 74, rotulo: "Reservado ao fisco" },
      ]);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.8);
    doc.text(
      "Representação gerada pelo portal a partir do XML da nota. Documento de conferência interna: a validade fiscal é a da autorização na SEFAZ.",
      MARGEM,
      291,
    );

    // Homologação é nota de teste. Imprimir sem dizer isso seria o começo de uma
    // confusão cara na doca.
    if (nota.ambiente === "homologacao") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(30);
      doc.setTextColor(170, 170, 170);
      doc.text("SEM VALOR FISCAL", 105, 160, { align: "center", angle: 35 });
      doc.setTextColor(...TINTA);
    }
  }

  return doc;
}

/** O número da nota com os pontos de milhar, como o DANFE imprime. */
export function formatarNumero(numeroDaNota: string | null): string {
  const d = (numeroDaNota ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.padStart(9, "0").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
}

/**
 * Quais itens cabem em cada página.
 *
 * A primeira folha perde quase dois terços da altura para o cabeçalho, o
 * destinatário, os impostos e o transporte; as seguintes só repetem o
 * cabeçalho. Contar isso antes de desenhar é o que permite escrever "FOLHA
 * 1/3" na primeira página — que é impressa antes de a terceira existir.
 */
export function paginar(alturas: number[], primeiraFolha: number, demaisFolhas: number): number[][] {
  if (!alturas.length) return [[]];
  const paginas: number[][] = [];
  let atual: number[] = [];
  let usado = 0;
  let limite = primeiraFolha;
  alturas.forEach((altura, indice) => {
    if (usado + altura > limite && atual.length) {
      paginas.push(atual);
      atual = [];
      usado = 0;
      limite = demaisFolhas;
    }
    atual.push(indice);
    usado += altura;
  });
  paginas.push(atual);
  return paginas;
}
