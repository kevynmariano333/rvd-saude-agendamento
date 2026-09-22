import { describe, expect, it, vi } from "vitest";

type Escrita = { texto: string; y: number; pagina: number };
const registro = globalThis as unknown as { escritas: Escrita[]; pagina: number };

// O comprovante é desenhado por coordenada, não por fluxo: nada avisa quando um
// bloco passa por cima do outro. Aqui o PDF é gerado de verdade e cada escrita
// é anotada com a sua posição, que é o que dá para conferir sem abrir o arquivo.
vi.mock("jspdf", async original => {
  const real = await original<typeof import("jspdf")>();
  const Espiao = function (...args: unknown[]) {
    const doc = new (real.jsPDF as unknown as new (...a: unknown[]) => import("jspdf").jsPDF)(...args);
    const escrever = doc.text.bind(doc);
    const novaPagina = doc.addPage.bind(doc);
    doc.text = ((...a: [string, number, number]) => {
      registro.escritas.push({ texto: String(a[0]), y: a[2], pagina: registro.pagina });
      return escrever(...a);
    }) as typeof doc.text;
    doc.addPage = ((...a: []) => { registro.pagina += 1; return novaPagina(...a); }) as typeof doc.addPage;
    // Em teste não há navegador para receber o download.
    doc.save = (() => doc) as typeof doc.save;
    return doc;
  } as unknown as typeof real.jsPDF;
  return { ...real, jsPDF: Espiao };
});

const comprovante = {
  invoiceNumber: "5676",
  // Nome comprido de propósito: ele quebra em duas linhas e empurra todo o
  // resto para baixo, que é o caso em que o rodapé corre risco.
  supplierName: "Distribuidora Hospitalar Santa Helena Comércio de Medicamentos Ltda",
  recipientCnpj: "06.033.403/0001-13", purchaseOrder: "4000123456",
  scheduledFor: "2026-09-25T13:00:00.000Z", confirmedByName: "Kevyn Mariano",
  confirmedByLogin: "kevyn.mariano@rvdsaude.com.br",
  validationUrl: "https://portal.rvdsaude.com.br/validar/abc",
};

describe("desenho do comprovante", () => {
  it("cabe em uma página e mantém o operador logístico antes dos dados da nota", async () => {
    registro.escritas = [];
    registro.pagina = 1;
    const { generateReceiptCertificatePdf } = await import("./receiptCertificatePdf");
    await generateReceiptCertificatePdf(comprovante);

    const onde = (trecho: string) => registro.escritas.find(escrita => escrita.texto.includes(trecho));
    expect(onde("ENTREGAR EM")).toBeDefined();
    expect(onde("39.283.469/0001-10")).toBeDefined();
    expect(onde("Antônio Mestriner")).toBeDefined();
    expect(onde("07175-550")).toBeDefined();

    // O endereço vem antes da nota fiscal: é o que o motorista lê primeiro.
    expect(onde("Antônio Mestriner")!.y).toBeLessThan(onde("Nota fiscal")!.y);
    // E o bloco de confirmação continua acima do rodapé, na mesma página.
    expect(onde("AGENDAMENTO CONFIRMADO")!.y).toBeLessThan(272);
    expect(registro.pagina).toBe(1);
    expect(registro.escritas.every(escrita => escrita.y <= 282)).toBe(true);
  });
});
