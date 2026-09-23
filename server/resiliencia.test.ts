import { describe, expect, it, vi } from "vitest";
import { corpoGrandeDemaisSemSessao, erroDeRede, LIMITE_SEM_SESSAO, limitarCorpoAnonimo, resumoDoErro, tratadorDeErros } from "./_core/resiliencia";

describe("erro de rede não é motivo para derrubar o servidor", () => {
  it("reconhece a conexão cortada pelo outro lado", () => {
    expect(erroDeRede(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }))).toBe(true);
    expect(erroDeRede(Object.assign(new Error("broken pipe"), { code: "EPIPE" }))).toBe(true);
  });

  it("não confunde um erro de verdade com queda de conexão", () => {
    expect(erroDeRede(new TypeError("x is not a function"))).toBe(false);
    expect(erroDeRede(null)).toBe(false);
    expect(erroDeRede(Object.assign(new Error("sem espaço"), { code: "ENOSPC" }))).toBe(false);
  });
});

describe("corpo grande de quem não fez login", () => {
  it("recusa o arquivo enorme sem sessão", () => {
    expect(corpoGrandeDemaisSemSessao({ temSessao: false, tamanho: LIMITE_SEM_SESSAO + 1 })).toBe(true);
  });

  it("deixa passar o mesmo tamanho para quem tem sessão", () => {
    // A importação de acervo é de administrador e manda dezenas de megabytes.
    expect(corpoGrandeDemaisSemSessao({ temSessao: true, tamanho: 40 * 1024 * 1024 })).toBe(false);
  });

  it("deixa passar o corpo pequeno de quem ainda vai entrar", () => {
    expect(corpoGrandeDemaisSemSessao({ temSessao: false, tamanho: 900 })).toBe(false);
  });

  it("não bloqueia quando não dá para saber o tamanho", () => {
    // Sem content-length, quem limita é o express.json. Chutar aqui recusaria
    // requisição legítima enviada em pedaços.
    expect(corpoGrandeDemaisSemSessao({ temSessao: false, tamanho: null })).toBe(false);
  });
});

/** Um par requisição/resposta suficiente para exercitar o middleware. */
function fingirTroca(cabecalhos: Record<string, string>) {
  const resposta = { codigo: 0, corpo: null as unknown };
  const res = {
    status(codigo: number) {
      resposta.codigo = codigo;
      return this;
    },
    json(corpo: unknown) {
      resposta.corpo = corpo;
      return this;
    },
    headersSent: false,
  };
  return { req: { headers: cabecalhos } as never, res: res as never, resposta };
}

describe("o middleware, no caminho da requisição", () => {
  it("responde 413 para o anônimo com corpo grande", () => {
    const { req, res, resposta } = fingirTroca({ "content-length": String(LIMITE_SEM_SESSAO + 1) });
    const seguir = vi.fn();
    limitarCorpoAnonimo(req, res, seguir);
    expect(seguir).not.toHaveBeenCalled();
    expect(resposta.codigo).toBe(413);
  });

  it("deixa seguir o mesmo corpo com o cookie de sessão", () => {
    const { req, res, resposta } = fingirTroca({
      "content-length": String(LIMITE_SEM_SESSAO + 1),
      cookie: "outro=1; rvd_saude_session=abc",
    });
    const seguir = vi.fn();
    limitarCorpoAnonimo(req, res, seguir);
    expect(seguir).toHaveBeenCalledOnce();
    expect(resposta.codigo).toBe(0);
  });

  it("não se engana com um cookie de nome parecido", () => {
    const { req, res } = fingirTroca({
      "content-length": String(LIMITE_SEM_SESSAO + 1),
      cookie: "nao_rvd_saude_session_falso=abc; xrvd_saude_session=abc",
    });
    const seguir = vi.fn();
    limitarCorpoAnonimo(req, res, seguir);
    expect(seguir).not.toHaveBeenCalled();
  });
});

describe("o tratador de erros das rotas", () => {
  it("responde 500 em JSON, com a pilha só no log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { req, res, resposta } = fingirTroca({});
    const seguir = vi.fn();
    tratadorDeErros(new Error("caminho interno /srv/app/server/db.ts"), req, res, seguir);
    expect(resposta.codigo).toBe(500);
    expect(resposta.corpo).toEqual({ error: "Erro interno do servidor." });
    expect(JSON.stringify(resposta.corpo)).not.toContain("/srv/app");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("devolve o erro adiante quando a resposta já começou", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { req, res } = fingirTroca({});
    (res as unknown as { headersSent: boolean }).headersSent = true;
    const seguir = vi.fn();
    const erro = new Error("tarde demais");
    tratadorDeErros(erro, req, res, seguir);
    expect(seguir).toHaveBeenCalledWith(erro);
    log.mockRestore();
  });
});

describe("o que vai para o log quando o corpo não é JSON válido", () => {
  it("não despeja o corpo recebido no log", () => {
    // O erro do express carrega o corpo inteiro; imprimi-lo entope o log e
    // grava numa linha o conteúdo de uma nota fiscal.
    const erro = Object.assign(new SyntaxError("Unexpected token a in JSON"), {
      status: 400,
      type: "entity.parse.failed",
      body: "a".repeat(5_000_000),
    });
    const resumo = resumoDoErro(erro);
    expect(resumo).toContain("Unexpected token");
    expect(resumo.length).toBeLessThan(5_000);
    expect(resumo).not.toContain("aaaaaaaaaa");
  });

  it("repassa o status que o express já classificou", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { req, res, resposta } = fingirTroca({});
    tratadorDeErros(Object.assign(new Error("too large"), { status: 413 }), req, res, vi.fn());
    expect(resposta.codigo).toBe(413);
    expect(resposta.corpo).toEqual({ error: "Arquivo grande demais." });
    log.mockRestore();
  });
});
