import { describe, expect, it } from "vitest";
import { alturaDoBlocoDeEntrega, receiptCertificateFileName } from "./receiptCertificatePdf";
import { CAMPOS_DO_OPERADOR } from "@shared/operadorLogistico";

describe("comprovante de recebimento em PDF", () => {
  it("identifica o arquivo pela nota fiscal para entrega", () => {
    expect(receiptCertificateFileName("5676")).toBe("comprovante-agendamento-rvd-nf-5676.pdf");
  });

  it("guarda os dados do operador dentro do quadro, sem sobrar para fora", () => {
    // O último campo é desenhado 4,5 mm abaixo do seu rótulo; se a altura do
    // quadro não contar essa linha, o CEP e o endereço saem por baixo dele.
    const linhasDeCampos = Math.ceil(CAMPOS_DO_OPERADOR.length / 2);
    for (const linhasDoAviso of [1, 2, 3]) {
      const ultimoValor = 17 + linhasDoAviso * 4 + (linhasDeCampos - 1) * 11 + 4.5;
      expect(alturaDoBlocoDeEntrega(linhasDoAviso, CAMPOS_DO_OPERADOR.length)).toBeGreaterThan(ultimoValor);
    }
  });
});
