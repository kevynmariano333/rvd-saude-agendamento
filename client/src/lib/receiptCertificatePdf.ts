import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { CAMPOS_DO_OPERADOR, OPERADOR_LOGISTICO } from "@shared/operadorLogistico";

export type ReceiptCertificateData = {
  invoiceNumber: string | null;
  supplierName: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  scheduledFor: Date | string;
  confirmedByName: string;
  confirmedByLogin: string;
  validationUrl: string;
};

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export function receiptCertificateFileName(invoiceNumber: string | null) {
  return `comprovante-agendamento-rvd-nf-${invoiceNumber || "sem-numero"}.pdf`;
}

let logoDataUrlPromise: Promise<string> | undefined;

function getRvdLogoDataUrl() {
  if (logoDataUrlPromise) return logoDataUrlPromise;
  logoDataUrlPromise = fetch("/RVD-Saude.png")
    .then(async response => {
      if (!response.ok) throw new Error("Não foi possível carregar o logo da RVD Saúde.");
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Não foi possível preparar o logo da RVD Saúde."));
        reader.readAsDataURL(blob);
      });
    })
    .catch(error => {
      logoDataUrlPromise = undefined;
      throw error;
    });
  return logoDataUrlPromise;
}

const ALTURA_DA_LINHA_DO_AVISO = 4;
const ALTURA_DA_LINHA_DE_CAMPOS = 11;
const PRIMEIRO_CAMPO = 17;
const ALTURA_DA_CONFIRMACAO = 46;
/** Abaixo disto está o rodapé, que nenhum bloco pode invadir. */
const LIMITE_DA_PAGINA = 272;

/**
 * A altura do quadro "Entregar em", medida pelo que ele contém.
 *
 * O aviso pode quebrar em mais de uma linha conforme a fonte, e os campos vêm
 * de uma lista que pode crescer. Fixar a altura na mão deixaria o último campo
 * para fora do quadro no dia em que qualquer um dos dois mudasse.
 */
export function alturaDoBlocoDeEntrega(linhasDoAviso: number, campos: number) {
  const linhasDeCampos = Math.ceil(campos / 2);
  const ultimoValor = PRIMEIRO_CAMPO + linhasDoAviso * ALTURA_DA_LINHA_DO_AVISO + (linhasDeCampos - 1) * ALTURA_DA_LINHA_DE_CAMPOS + 4.5;
  return ultimoValor + 3;
}

export async function generateReceiptCertificatePdf(data: ReceiptCertificateData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const plum: [number, number, number] = [120, 32, 120];
  const blue: [number, number, number] = [142, 193, 217];
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 46, "F");
  doc.setFillColor(247, 242, 247); doc.roundedRect(11, 5, 40, 32, 5, 5, "F");
  try { doc.addImage(await getRvdLogoDataUrl(), "PNG", 14, 6.5, 34, 29); } catch { doc.setFillColor(...blue); doc.roundedRect(20, 13, 14, 14, 4, 4, "F"); }
  doc.setTextColor(...plum); doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.text("RVD Saúde", 57, 20); doc.setFontSize(10); doc.text("AGENDAMENTO · COMPROVANTE PARA ENTREGA", 57, 28);
  doc.setFont("helvetica", "normal"); doc.setTextColor(100, 75, 100); doc.setFontSize(8); doc.text("Documento digital de confirmação", 57, 34);
  doc.setFillColor(...plum); doc.rect(0, 42, 210, 4, "F");
  doc.setTextColor(...plum); doc.setFontSize(19); doc.text("Comprovante de agendamento", 16, 64);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(70, 50, 70); doc.text("Documento para acompanhar a entrega da nota fiscal agendada.", 16, 72);
  doc.setDrawColor(...blue); doc.setLineWidth(0.7); doc.line(16, 79, 194, 79);

  // Para onde a carga vai. Fica antes dos dados da nota porque é o que o
  // motorista precisa ler primeiro — endereço errado custa a viagem inteira.
  const avisoLinhas = doc.splitTextToSize(OPERADOR_LOGISTICO.aviso, 168);
  const entregaY = 84;
  const alturaDaEntrega = alturaDoBlocoDeEntrega(avisoLinhas.length, CAMPOS_DO_OPERADOR.length);
  doc.setFillColor(247, 242, 247); doc.roundedRect(16, entregaY, 178, alturaDaEntrega, 4, 4, "F");
  doc.setTextColor(...plum); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("ENTREGAR EM", 22, entregaY + 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(70, 50, 70); doc.text(avisoLinhas, 22, entregaY + 13.5);

  let campoY = entregaY + PRIMEIRO_CAMPO + avisoLinhas.length * ALTURA_DA_LINHA_DO_AVISO;
  for (let indice = 0; indice < CAMPOS_DO_OPERADOR.length; indice += 2) {
    CAMPOS_DO_OPERADOR.slice(indice, indice + 2).forEach((campo, coluna) => {
      const x = coluna === 0 ? 22 : 112;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(120, 100, 120); doc.text(campo.rotulo.toUpperCase(), x, campoY);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(45, 35, 45);
      doc.text(doc.splitTextToSize(campo.valor, coluna === 0 ? 86 : 76), x, campoY + 4.5);
    });
    campoY += ALTURA_DA_LINHA_DE_CAMPOS;
  }

  const rows = [["Nota fiscal", data.invoiceNumber || "Não informado"], ["Fornecedor", data.supplierName || "Não informado"], ["Pedido", data.purchaseOrder || "Não informado"], ["CNPJ destinatário", data.recipientCnpj || "Não informado"], ["Data e hora da entrega", formatDateTime(data.scheduledFor)], ["Agendamento confirmado por", data.confirmedByName], ["Login do confirmador", data.confirmedByLogin]];
  let y = entregaY + alturaDaEntrega + 10;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...plum); doc.text(label, 18, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(45, 35, 45); const text = doc.splitTextToSize(value, 112); doc.text(text, 76, y); y += Math.max(11, text.length * 5 + 5);
    doc.setDrawColor(230, 215, 230); doc.setLineWidth(0.25); doc.line(18, y - 4, 192, y - 4);
  }
  const qrCode = await QRCode.toDataURL(data.validationUrl, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#782078", light: "#FFFFFF" } });
  // Um nome de fornecedor comprido quebra em duas linhas e empurra tudo para
  // baixo; se a confirmação não couber inteira acima do rodapé, ela vira
  // página em vez de imprimir por cima dele.
  let confirmationY = y + 6;
  if (confirmationY + ALTURA_DA_CONFIRMACAO > LIMITE_DA_PAGINA) { doc.addPage(); confirmationY = 24; }
  doc.setFillColor(247, 242, 247); doc.roundedRect(16, confirmationY, 178, 46, 4, 4, "F");
  doc.addImage(qrCode, "PNG", 151, confirmationY + 5, 35, 35);
  doc.setTextColor(...plum); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("AGENDAMENTO CONFIRMADO", 22, confirmationY + 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 50, 70); doc.text("Apresente este comprovante junto à nota fiscal no momento da entrega.", 22, confirmationY + 23);
  doc.setFontSize(8); doc.text("Aponte a câmera do celular para o QR ao lado", 22, confirmationY + 32); doc.text("e confirme este agendamento no portal RVD Saúde.", 22, confirmationY + 38);
  doc.setTextColor(120, 100, 120); doc.setFontSize(8); doc.text("RVD Saúde Agendamento · documento emitido pelo portal", 16, 282); doc.text(`Emitido em ${formatDateTime(new Date())}`, 194, 282, { align: "right" });
  doc.save(receiptCertificateFileName(data.invoiceNumber));
}
