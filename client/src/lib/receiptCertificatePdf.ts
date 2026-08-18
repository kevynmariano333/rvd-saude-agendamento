import { jsPDF } from "jspdf";

export type ReceiptCertificateData = {
  invoiceNumber: string | null;
  supplierName: string | null;
  recipientCnpj: string | null;
  purchaseOrder: string | null;
  receivedAt: Date | string;
  confirmedByName: string;
  confirmedByLogin: string;
};

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export function receiptCertificateFileName(invoiceNumber: string | null) {
  return `comprovante-recebimento-rvd-nf-${invoiceNumber || "sem-numero"}.pdf`;
}

export function generateReceiptCertificatePdf(data: ReceiptCertificateData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const plum: [number, number, number] = [120, 32, 120];
  const blue: [number, number, number] = [142, 193, 217];
  doc.setFillColor(...plum); doc.rect(0, 0, 210, 42, "F");
  doc.setFillColor(...blue); doc.roundedRect(16, 12, 12, 12, 3, 3, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("RVD Saúde", 34, 20); doc.setFontSize(10); doc.text("AGENDAMENTO · COMPROVANTE DE RECEBIMENTO", 34, 28);
  doc.setTextColor(...plum); doc.setFontSize(19); doc.text("Comprovante de recebimento", 16, 62);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(70, 50, 70); doc.text("Documento para acompanhar a entrega da nota fiscal.", 16, 70);
  doc.setDrawColor(...blue); doc.setLineWidth(0.7); doc.line(16, 77, 194, 77);
  const rows = [["Nota fiscal", data.invoiceNumber || "Não informado"], ["Fornecedor", data.supplierName || "Não informado"], ["Pedido", data.purchaseOrder || "Não informado"], ["CNPJ destinatário", data.recipientCnpj || "Não informado"], ["Recebimento confirmado em", formatDateTime(data.receivedAt)], ["Confirmado por", data.confirmedByName], ["Login do confirmador", data.confirmedByLogin]];
  let y = 91;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...plum); doc.text(label, 18, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(45, 35, 45); const text = doc.splitTextToSize(value, 112); doc.text(text, 76, y); y += Math.max(11, text.length * 5 + 5);
    doc.setDrawColor(230, 215, 230); doc.setLineWidth(0.25); doc.line(18, y - 4, 192, y - 4);
  }
  doc.setFillColor(247, 242, 247); doc.roundedRect(16, y + 8, 178, 33, 4, 4, "F"); doc.setTextColor(...plum); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("IMPORTANTE", 22, y + 18); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 50, 70); doc.text("Apresente este comprovante junto à nota fiscal no momento da entrega.", 22, y + 26);
  doc.setTextColor(120, 100, 120); doc.setFontSize(8); doc.text("RVD Saúde Agendamento · documento emitido pelo portal", 16, 282); doc.text(`Emitido em ${formatDateTime(new Date())}`, 194, 282, { align: "right" });
  doc.save(receiptCertificateFileName(data.invoiceNumber));
}
