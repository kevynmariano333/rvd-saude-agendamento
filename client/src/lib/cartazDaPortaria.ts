import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { MARCA } from "@shared/marca";
import { OPERADOR_LOGISTICO } from "@shared/operadorLogistico";
import { getRvdLogoDataUrl } from "./receiptCertificatePdf";

/**
 * O cartaz que fica na portaria.
 *
 * Fornecedor que chega sem agendamento quase nunca é má vontade: é gente que
 * não sabe que o portal existe. Explicar isso no portão, motorista por
 * motorista, depende de quem está na guarita ter tempo e lembrar do endereço.
 * Um cartaz com o QR resolve de uma vez — e quem chegou errado hoje já sai
 * sabendo agendar a próxima.
 *
 * O endereço não é escrito aqui: vem de onde a página está sendo servida. Um
 * endereço digitado à mão é um endereço que fica para trás no dia em que ele
 * mudar, e aí o cartaz manda o fornecedor para lugar nenhum.
 */
export function cartazDaPortariaFileName() {
  return "cartaz-portaria-rvd-recebe.pdf";
}

const PLUM: [number, number, number] = [120, 32, 120];
const TINTA: [number, number, number] = [63, 50, 68];
const CINZA: [number, number, number] = [122, 111, 126];

/** Os passos que o fornecedor segue depois de ler o QR. */
export const PASSOS_DO_CARTAZ = [
  { titulo: "Aponte a câmera", texto: "Leia o QR acima com o celular. Não precisa instalar nada." },
  { titulo: "Cadastre-se com o CNPJ", texto: "Se a sua empresa já entrega aqui, o nome aparece sozinho." },
  { titulo: "Envie o XML da nota", texto: "E informe o número do pedido de compra da entrega." },
  { titulo: "Aguarde a confirmação", texto: "Avisamos o dia e a hora. Só venha depois de confirmado." },
] as const;

export async function gerarCartazDaPortaria(enderecoDoPortal: string): Promise<jsPDF> {
  // Comprimido: o cartaz costuma ser mandado por WhatsApp para alguém
  // imprimir, e o logo sozinho leva o arquivo a alguns megabytes.
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  // Faixa do topo com a marca.
  doc.setFillColor(...PLUM);
  doc.rect(0, 0, 210, 40, "F");
  try {
    doc.addImage(await getRvdLogoDataUrl(), "PNG", 16, 9, 26, 22);
  } catch {
    // Sem o logo o cartaz continua servindo: o que importa é o QR.
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(MARCA.nome, 48, 21);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(MARCA.descricao.toUpperCase(), 48, 29);

  // A chamada, no tamanho de quem lê de longe.
  doc.setTextColor(...PLUM);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text("Agende sua entrega", 105, 60, { align: "center" });
  doc.text("antes de vir", 105, 73, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...TINTA);
  doc.text("Entrega sem agendamento pode ficar esperando na fila.", 105, 84, { align: "center" });

  // O QR, grande e com bastante folga em volta: leitor de celular ruim agradece.
  const qr = await QRCode.toDataURL(enderecoDoPortal, { errorCorrectionLevel: "M", margin: 1, width: 900, color: { dark: "#782078", light: "#ffffff" } });
  doc.setDrawColor(230, 220, 230);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(59, 92, 92, 92, 6, 6, "FD");
  doc.addImage(qr, "PNG", 63, 96, 84, 84);

  // O endereço escrito: nem todo motorista consegue ler o QR.
  doc.setFontSize(10);
  doc.setTextColor(...CINZA);
  doc.text("Ou digite no navegador:", 105, 192, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PLUM);
  doc.text(enderecoDoPortal.replace(/^https?:\/\//, ""), 105, 200, { align: "center" });

  // Os passos, em duas colunas.
  let y = 214;
  PASSOS_DO_CARTAZ.forEach((passo, indice) => {
    const x = indice % 2 === 0 ? 18 : 110;
    if (indice % 2 === 0 && indice > 0) y += 22;
    doc.setFillColor(...PLUM);
    doc.circle(x + 4, y - 1, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(String(indice + 1), x + 4, y + 0.5, { align: "center" });
    doc.setTextColor(...TINTA);
    doc.setFontSize(11);
    doc.text(passo.titulo, x + 11, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    doc.text(doc.splitTextToSize(passo.texto, 70), x + 11, y + 5);
  });

  // Rodapé: onde é a entrega, que é a outra dúvida de quem chega.
  doc.setFillColor(247, 242, 247);
  doc.rect(0, 262, 210, 35, "F");
  doc.setTextColor(...PLUM);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ENTREGA NO OPERADOR LOGÍSTICO", 105, 272, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TINTA);
  doc.text(`${OPERADOR_LOGISTICO.nome} · ${OPERADOR_LOGISTICO.enderecoEntrega}`, 105, 279, { align: "center" });
  doc.text(`CEP ${OPERADOR_LOGISTICO.cep} · CNPJ ${OPERADOR_LOGISTICO.cnpj}`, 105, 285, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(...CINZA);
  doc.text("A entrega é no operador logístico, e não no hospital que fez o pedido.", 105, 291, { align: "center" });

  return doc;
}
