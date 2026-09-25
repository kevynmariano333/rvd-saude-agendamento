import { describe, expect, it } from "vitest";
import { conteudoDoAcessoLiberado, portaDoPerfil } from "./emailDeAcesso";

const base = { nome: "Onco Distribuidora", email: "contato@onco.com.br", appUrl: "https://agendamento.rvdsaude.com.br" } as const;

describe("aviso de que o login está ativo", () => {
  it("diz que o acesso foi liberado e com qual login se entra", () => {
    const conteudo = conteudoDoAcessoLiberado({ ...base, role: "supplier" });
    expect(conteudo.subject).toContain("Seu login está ativo");
    expect(conteudo.text).toContain("contato@onco.com.br");
    expect(conteudo.html).toContain("contato@onco.com.br");
  });

  it("nunca repete a senha — só diz de quem ela é", () => {
    const conteudo = conteudoDoAcessoLiberado({ ...base, role: "supplier" });
    expect(conteudo.text).toContain("Senha: a que você cadastrou");
    expect(conteudo.text).not.toMatch(/Senha: (?!a que você cadastrou)/);
  });

  it("manda cada perfil para a sua porta de entrada", () => {
    expect(portaDoPerfil("supplier")).toBe("fornecedor");
    expect(portaDoPerfil("portaria")).toBe("portaria");
    // Operação e Planejamento entram pela porta do Operador, como no login.
    expect(portaDoPerfil("planejador")).toBe("operador");
    expect(portaDoPerfil("operacao")).toBe("operador");
    expect(portaDoPerfil("admin")).toBe("operador");
    expect(conteudoDoAcessoLiberado({ ...base, role: "supplier" }).text).toContain("https://agendamento.rvdsaude.com.br/entrar/fornecedor");
    expect(conteudoDoAcessoLiberado({ ...base, role: "planejador" }).text).toContain("https://agendamento.rvdsaude.com.br/entrar/operador");
  });

  it("sai sem link, e não com um link quebrado, quando o portal não tem endereço", () => {
    const conteudo = conteudoDoAcessoLiberado({ ...base, role: "supplier", appUrl: null });
    expect(conteudo.text).not.toContain("undefined");
    expect(conteudo.text).not.toContain("Entre em:");
    expect(conteudo.html).not.toContain("Entrar no portal");
  });

  it("fala diferente com quem volta depois de bloqueado", () => {
    const conteudo = conteudoDoAcessoLiberado({ ...base, role: "supplier", reativado: true });
    expect(conteudo.subject).toContain("Seu login voltou a funcionar");
    expect(conteudo.text).toContain("liberado de novo");
  });

  it("só o fornecedor recebe o passo a passo do envio da nota", () => {
    expect(conteudoDoAcessoLiberado({ ...base, role: "supplier" }).text).toContain("Envie o XML da nota fiscal");
    expect(conteudoDoAcessoLiberado({ ...base, role: "portaria" }).text).not.toContain("Envie o XML da nota fiscal");
  });

  it("escapa o que vem do cadastro em vez de deixar virar HTML", () => {
    const conteudo = conteudoDoAcessoLiberado({ ...base, nome: 'Fornecedor <script>alert("x")</script>', role: "supplier" });
    expect(conteudo.html).not.toContain("<script>");
    expect(conteudo.html).toContain("&lt;script&gt;");
  });
});
