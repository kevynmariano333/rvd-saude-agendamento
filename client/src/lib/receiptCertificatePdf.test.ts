import { describe, expect, it } from "vitest";
import { receiptCertificateFileName } from "./receiptCertificatePdf";

describe("comprovante de recebimento em PDF", () => {
  it("identifica o arquivo pela nota fiscal para entrega", () => {
    expect(receiptCertificateFileName("5676")).toBe("comprovante-agendamento-rvd-nf-5676.pdf");
  });
});
