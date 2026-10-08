import { describe, expect, it } from "vitest";
import { bancoEmRedeInterna, montarEstadoDeSeguranca, segredoForte } from "./estadoDeSeguranca";

describe("como o banco está ligado", () => {
  it("reconhece a rede interna da hospedagem", () => {
    expect(bancoEmRedeInterna("mysql://usuario:senha@mysql.railway.internal:3306/railway")).toBe(true);
  });

  it("aponta o endereço público, que é o que se quer fechar", () => {
    expect(bancoEmRedeInterna("mysql://usuario:senha@maglev.proxy.rlwy.net:41234/railway")).toBe(false);
  });

  it("aceita o banco da própria máquina, que não sai para lugar nenhum", () => {
    expect(bancoEmRedeInterna("mysql://raiz@127.0.0.1:3306/rvd")).toBe(true);
  });

  it("não inventa resposta quando não sabe ler o endereço", () => {
    expect(bancoEmRedeInterna("")).toBeNull();
    expect(bancoEmRedeInterna("isto não é um endereço")).toBeNull();
  });
});

describe("segredo da sessão", () => {
  it("recusa o curto", () => {
    expect(segredoForte("segredo123")).toBe(false);
  });

  it("recusa o longo feito de repetição, que não é melhor do que a palavra", () => {
    expect(segredoForte("senhasenhasenhasenhasenhasenhasenha")).toBe(false);
  });

  it("aceita o longo e variado", () => {
    expect(segredoForte("7mK2p!zQ4rW9xB6tL0vN3sJ8hY1gD5fA")).toBe(true);
  });
});

describe("o painel inteiro", () => {
  const tudoCerto = {
    databaseUrl: "mysql://u:s@mysql.railway.internal:3306/railway",
    segredoDaSessao: "7mK2p!zQ4rW9xB6tL0vN3sJ8hY1gD5fA",
    appUrl: "https://agendamento.rvdsaude.com.br",
    contasDeTeste: { ligadas: false, motivo: "produção sem senha configurada" } as const,
    emailConfigurado: true,
    backupConfigurado: true,
  };

  it("fica todo verde quando não há nada aberto", () => {
    expect(montarEstadoDeSeguranca(tudoCerto).every(item => item.ok)).toBe(true);
  });

  it("diz o que fazer em cada item aberto, e nada quando está resolvido", () => {
    const aberto = montarEstadoDeSeguranca({ ...tudoCerto, databaseUrl: "mysql://u:s@maglev.proxy.rlwy.net:41234/railway", contasDeTeste: { ligadas: true, senha: "uma-senha-bem-longa" } as const });
    const banco = aberto.find(item => item.chave === "banco")!;
    expect(banco.ok).toBe(false);
    expect(banco.comoResolver).toContain("Public Networking");
    expect(aberto.find(item => item.chave === "email")!.comoResolver).toBe("");
  });

  it("nunca repete o valor das variáveis, que é o que não pode aparecer numa tela", () => {
    const texto = JSON.stringify(montarEstadoDeSeguranca({ ...tudoCerto, databaseUrl: "mysql://raiz:senha-secreta@maglev.proxy.rlwy.net:41234/railway" }));
    expect(texto).not.toContain("senha-secreta");
    expect(texto).not.toContain(tudoCerto.segredoDaSessao);
  });
});

describe("as contas de teste no painel", () => {
  const base = {
    databaseUrl: "mysql://u:s@mysql.railway.internal:3306/railway",
    segredoDaSessao: "7mK2p!zQ4rW9xB6tL0vN3sJ8hY1gD5fA",
    appUrl: "https://agendamento.rvdsaude.com.br",
    emailConfigurado: true,
    backupConfigurado: true,
  };
  const item = (contasDeTeste: Parameters<typeof montarEstadoDeSeguranca>[0]["contasDeTeste"]) =>
    montarEstadoDeSeguranca({ ...base, contasDeTeste }).find(linha => linha.chave === "contasDeTeste")!;

  it("diz quando a senha definida é curta demais", () => {
    // Quem acabou de definir a senha na Railway e continua sem entrar precisa
    // saber que ela foi recusada por ser curta — "Desligadas." não explica.
    const curta = item({ ligadas: false, motivo: "senha configurada é curta demais" });
    expect(curta.situacao).toContain("menos de 12 caracteres");
    expect(curta.comoResolver).toContain("SENHA_CONTAS_TESTE");
  });

  it("distingue isso de nunca ter configurado senha nenhuma", () => {
    const semSenha = item({ ligadas: false, motivo: "produção sem senha configurada" });
    expect(semSenha.situacao).toContain("nenhuma senha configurada");
    expect(semSenha.situacao).not.toContain("menos de");
  });

  it("ligadas continua sendo um alerta, e diz como desligar", () => {
    const ligadas = item({ ligadas: true, senha: "uma-senha-bem-longa" });
    expect(ligadas.ok).toBe(false);
    expect(ligadas.comoResolver).toContain("apague a variável");
  });

  it("nem o painel com senha configurada mostra a senha", () => {
    const texto = JSON.stringify(montarEstadoDeSeguranca({ ...base, contasDeTeste: { ligadas: true, senha: "senha-secreta-de-teste" } }));
    expect(texto).not.toContain("senha-secreta-de-teste");
  });
});
