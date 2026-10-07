import { describe, expect, it } from "vitest";
import { z } from "zod";

/*
 * Um fornecedor tentando se cadastrar viu, em cima do botão, a lista de erros
 * do zod serializada — a expressão regular inteira do e-mail incluída. Ele não
 * tinha como saber que o problema era um espaço colado junto do endereço.
 *
 * São duas coisas: o espaço não devia derrubar o cadastro, e o erro, quando
 * houver, tem que ser uma frase.
 */
const cadastro = z.object({
  companyName: z.string().trim().min(2, "Informe a razão social.").max(255),
  companyCnpj: z.string().trim().min(14, "Informe o CNPJ.").max(20),
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha deve conter pelo menos 6 caracteres."),
});

const valido = {
  companyName: "Ativa Logística",
  companyCnpj: "01125797000701",
  email: "agendamento_sp2@ativalog.com.br",
  password: "senha-boa",
};

describe("o cadastro do fornecedor", () => {
  it("aceita o e-mail que o fornecedor digitou", () => {
    expect(cadastro.safeParse(valido).success).toBe(true);
  });

  it("não recusa por um espaço que ninguém vê", () => {
    // Quem cola o endereço de outro lugar traz o espaço junto, e ele é
    // invisível na caixa de texto.
    for (const sujo of [" agendamento_sp2@ativalog.com.br", "agendamento_sp2@ativalog.com.br ", "\tagendamento_sp2@ativalog.com.br\n"]) {
      const resultado = cadastro.safeParse({ ...valido, email: sujo });
      expect(resultado.success).toBe(true);
      if (resultado.success) expect(resultado.data.email).toBe("agendamento_sp2@ativalog.com.br");
    }
  });

  it("o mesmo vale para o CNPJ e a razão social", () => {
    const resultado = cadastro.safeParse({ ...valido, companyCnpj: " 01125797000701 ", companyName: "  Ativa Logística  " });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.companyName).toBe("Ativa Logística");
  });

  it("e-mail que de fato está errado continua recusado, com frase legível", () => {
    const resultado = cadastro.safeParse({ ...valido, email: "ativalog.com.br" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const frases = resultado.error.issues.map(problema => problema.message);
      expect(frases).toContain("Informe um e-mail válido.");
      // A frase é o que a tela mostra — nunca o objeto com a expressão regular.
      expect(frases.join(" ")).not.toContain("pattern");
      expect(frases.join(" ")).not.toContain("invalid_format");
    }
  });

  it("dois campos errados viram duas frases, não um despejo", () => {
    const resultado = cadastro.safeParse({ ...valido, email: "nao-e-email", password: "123" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const frase = Array.from(new Set(resultado.error.issues.map(p => p.message))).join(" ");
      expect(frase).toBe("Informe um e-mail válido. A senha deve conter pelo menos 6 caracteres.");
    }
  });
});
