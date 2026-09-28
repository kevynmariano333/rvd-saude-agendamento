import type { jsPDF } from "jspdf";
import { MARCA } from "@shared/marca";
import { formatarCnpj, rotuloDoDestinatario, unidadePorCnpj } from "@shared/recipients";
import { carregarFerramentasDoPdf, getRvdLogoDataUrl } from "./receiptCertificatePdf";

/**
 * A nota fiscal desenhada numa folha, a partir do XML que já está guardado.
 *
 * O clipe da linha entrega o XML, que é o arquivo certo para o sistema e o
 * arquivo errado para uma pessoa: ninguém na doca lê etiqueta por etiqueta para
 * descobrir quantas caixas vêm. Quem precisava conferir imprimia o DANFE que o
 * fornecedor tinha mandado por e-mail — quando tinha mandado.
 *
 * Isto não é o DANFE oficial e não se apresenta como um: o que vale para o
 * fisco é a autorização na SEFAZ, e o DANFE é só a representação impressa dela.
 * É o espelho dos dados da nota, para conferência interna, e o rodapé diz isso
 * em letra que dá para ler.
 *
 * Nada aqui vai buscar coisa nenhuma fora: os dados saem do XML que o próprio
 * fornecedor subiu, lido na hora do envio e guardado desde então.
 */

export type ItemDaNota = {
  description: string;
  quantity: number | null;
  unitPriceCents: number | null;
  totalCents: number | null;
};

export type DadosDoEspelho = {
  invoiceNumber: string | null;
  accessKey: string | null;
  issuedAt: Date | string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  totalCents: number | null;
  volumeCount: number | null;
  items: ItemDaNota[];
  /** Quando a entrega está marcada, aparece no quadro do agendamento. */
  scheduledFor?: Date | string | null;
};

const PLUM: [number, number, number] = [120, 32, 120];
const TINTA: [number, number, number] = [63, 50, 68];
const CINZA: [number, number, number] = [122, 111, 126];
const BORDA: [number, number, number] = [222, 210, 224];

export function espelhoDaNotaFileName(invoiceNumber: string | null) {
  return `espelho-nota-${invoiceNumber || "sem-numero"}.pdf`;
}

/** A chave em grupos de quatro, que é como se confere dígito a dígito. */
export function chaveEmGrupos(chave: string | null): string {
  const digitos = (chave ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Série e modelo saem da própria chave de acesso.
 *
 * A chave de 44 dígitos carrega, em posições fixas, a UF, o mês da emissão, o
 * CNPJ do emitente, o modelo, a série e o número. Ler dali evita guardar no
 * banco um dado que já está guardado — e que, vindo da chave, não pode
 * divergir do resto da nota.
 */
export function dadosDaChave(chave: string | null): { modelo: string; serie: string; numero: string } | null {
  const d = (chave ?? "").replace(/\D/g, "");
  if (d.length !== 44) return null;
  return { modelo: d.slice(20, 22), serie: d.slice(22, 25), numero: d.slice(25, 34) };
}

function dinheiro(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function quantidade(valor: number | null): string {
  if (valor === null) return "—";
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function data(valor: Date | string | null | undefined, comHora = false): string {
  if (!valor) return "—";
  const quando = new Date(valor);
  if (Number.isNaN(quando.getTime())) return "—";
  // Fuso fixo de São Paulo: a folha é conferida na doca, e uma hora que muda
  // conforme o relógio de quem clicou não serve para conferir nada.
  const formato = comHora
    ? { dateStyle: "short" as const, timeStyle: "short" as const }
    : { dateStyle: "short" as const };
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...formato }).format(quando);
}

/** Um quadro com título pequeno em cima, como os do DANFE. */
function quadro(doc: jsPDF, x: number, y: number, largura: number, altura: number, titulo: string) {
  doc.setDrawColor(...BORDA);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, largura, altura, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...CINZA);
  doc.text(titulo.toUpperCase(), x + 3, y + 4.5);
}

function campo(doc: jsPDF, x: number, y: number, rotulo: string, valor: string, tamanho = 10) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...CINZA);
  doc.text(rotulo.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(tamanho);
  doc.setTextColor(...TINTA);
  doc.text(valor, x, y + 5);
}

export async function gerarEspelhoDaNota(dados: DadosDoEspelho): Promise<jsPDF> {
  const { jsPDF } = await carregarFerramentasDoPdf();
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const unidade = unidadePorCnpj(dados.recipientCnpj);
  const destinatario = rotuloDoDestinatario(dados.recipientCnpj);
  const daChave = dadosDaChave(dados.accessKey);

  // Cabeçalho
  doc.setFillColor(...PLUM);
  doc.rect(0, 0, 210, 26, "F");
  try {
    doc.addImage(await getRvdLogoDataUrl(), "PNG", 12, 4.5, 20, 17);
  } catch {
    // Sem logo o cabeçalho continua de pé: o que importa é o conteúdo abaixo.
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("ESPELHO DA NOTA FISCAL", 36, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${MARCA.nome} · conferência interna · não substitui o DANFE`, 36, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(dados.invoiceNumber ? `Nº ${dados.invoiceNumber}` : "SEM NÚMERO", 198, 15, { align: "right" });

  // Chave de acesso: o dado que identifica a nota inteira.
  quadro(doc, 12, 32, 186, 16, "Chave de acesso");
  doc.setFont("courier", "bold");
  doc.setFontSize(dados.accessKey ? 10.5 : 9);
  doc.setTextColor(...TINTA);
  doc.text(chaveEmGrupos(dados.accessKey) || "não informada no XML", 15, 43);

  // Emitente e destinatário, lado a lado: quem manda e quem recebe.
  quadro(doc, 12, 52, 91, 26, "Emitente");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  doc.text(doc.splitTextToSize(dados.supplierName ?? "—", 85), 15, 61);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...CINZA);
  doc.text(`CNPJ ${formatarCnpj(dados.supplierCnpj) || "—"}`, 15, 74);

  quadro(doc, 107, 52, 91, 26, "Destinatário");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  // Na folha cabe o nome inteiro da unidade — a sigla é abreviação de tela, e
  // quem confere na doca não é sempre quem já conhece as siglas.
  doc.text(unidade ? `${unidade.sigla} · ${unidade.nome}` : destinatario.principal, 110, 61);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...CINZA);
  doc.text(`CNPJ ${formatarCnpj(dados.recipientCnpj) || "—"}`, 110, 74);

  // A linha de dados da nota.
  quadro(doc, 12, 82, 186, 20, "Dados da nota");
  campo(doc, 15, 91, "Emissão", data(dados.issuedAt), 9.5);
  campo(doc, 52, 91, "Série", daChave?.serie ? String(Number(daChave.serie)) : "—", 9.5);
  campo(doc, 75, 91, "Modelo", daChave?.modelo ?? "—", 9.5);
  campo(doc, 100, 91, "Pedido de compra", dados.purchaseOrder ?? "—", 9.5);
  campo(doc, 145, 91, "Volumes", dados.volumeCount === null || dados.volumeCount === undefined ? "—" : String(dados.volumeCount), 9.5);
  campo(doc, 170, 91, "Agendamento", data(dados.scheduledFor, true), 9.5);

  // Os itens.
  let y = 115;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...CINZA);
  doc.text("ITENS DA NOTA", 12, 107);
  doc.setFillColor(247, 242, 247);
  doc.rect(12, y - 5, 186, 7, "F");
  doc.setFontSize(7);
  doc.setTextColor(...PLUM);
  doc.text("#", 15, y);
  doc.text("DESCRIÇÃO", 23, y);
  doc.text("QTD", 140, y, { align: "right" });
  doc.text("VALOR UNIT.", 168, y, { align: "right" });
  doc.text("TOTAL", 195, y, { align: "right" });
  y += 4;

  const itens = dados.items ?? [];
  if (!itens.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA);
    doc.text("O XML desta nota não trouxe itens detalhados.", 15, y + 4);
    y += 10;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  itens.forEach((item, indice) => {
    // Vira a página antes de invadir o rodapé, repetindo o cabeçalho da tabela.
    if (y > 258) {
      doc.addPage();
      // A folha que vira precisa dizer de qual nota ela é: página solta em cima
      // da mesa da doca, sem número, não serve para nada.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...CINZA);
      doc.text(`ESPELHO DA NOTA ${dados.invoiceNumber ?? "—"} · CONTINUAÇÃO`, 12, 14);
      y = 24;
      doc.setFillColor(247, 242, 247);
      doc.rect(12, y - 5, 186, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...PLUM);
      doc.text("#", 15, y);
      doc.text("DESCRIÇÃO (continuação)", 23, y);
      doc.text("QTD", 140, y, { align: "right" });
      doc.text("VALOR UNIT.", 168, y, { align: "right" });
      doc.text("TOTAL", 195, y, { align: "right" });
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    const linhas = doc.splitTextToSize(item.description || "—", 112) as string[];
    const altura = Math.max(6, linhas.length * 3.6 + 2.4);
    if (indice % 2 === 1) {
      doc.setFillColor(251, 249, 251);
      doc.rect(12, y - 0.5, 186, altura, "F");
    }
    doc.setTextColor(...CINZA);
    doc.text(String(indice + 1), 15, y + 4);
    doc.setTextColor(...TINTA);
    doc.text(linhas, 23, y + 4);
    doc.text(quantidade(item.quantity), 140, y + 4, { align: "right" });
    doc.text(dinheiro(item.unitPriceCents), 168, y + 4, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(dinheiro(item.totalCents), 195, y + 4, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += altura;
  });

  // Total, colado no fim da lista para não flutuar no meio da folha.
  y += 2;
  if (y > 250) {
    doc.addPage();
    y = 24;
  }
  doc.setFillColor(...PLUM);
  doc.roundedRect(118, y, 80, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("TOTAL DA NOTA", 123, y + 5.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(dinheiro(dados.totalCents), 194, y + 10.5, { align: "right" });

  // Rodapé em todas as páginas: o aviso e de onde isto saiu.
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(...BORDA);
    doc.setLineWidth(0.3);
    doc.line(12, 281, 198, 281);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...CINZA);
    doc.text(
      "Documento de conferência interna, gerado a partir do XML enviado pelo fornecedor. Não substitui o DANFE nem tem valor fiscal.",
      12,
      285,
    );
    doc.text(`${MARCA.nome} · gerado em ${data(new Date(), true)}`, 12, 288.5);
    doc.text(`Página ${pagina} de ${paginas}`, 198, 288.5, { align: "right" });
  }

  return doc;
}
