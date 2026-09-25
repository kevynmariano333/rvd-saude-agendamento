import { describe, expect, it } from "vitest";
import { isUnexpectedHtmlApiResponse, mensagemDeRespostaNaoJson } from "./apiResponse";

describe("isUnexpectedHtmlApiResponse", () => {
  it("identifica uma resposta HTML bem-sucedida onde a API deveria retornar JSON", () => {
    const response = new Response("<!doctype html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    expect(isUnexpectedHtmlApiResponse(response)).toBe(true);
  });

  it("não sinaliza respostas JSON ou respostas de erro HTTP", () => {
    const json = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    const error = new Response("<!doctype html><html></html>", { status: 503, headers: { "content-type": "text/html" } });

    expect(isUnexpectedHtmlApiResponse(json)).toBe(false);
    expect(isUnexpectedHtmlApiResponse(error)).toBe(false);
  });
});

describe("mensagemDeRespostaNaoJson", () => {
  it("deixa passar a resposta JSON da API", () => {
    const json = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    expect(mensagemDeRespostaNaoJson(json)).toBeNull();
  });

  it("explica o 'upstream error' do proxy em vez de deixar virar erro de JSON", () => {
    // É o que a hospedagem responde enquanto o servidor reinicia, e o que
    // aparecia na tela como "Unexpected token 'u'".
    const proxy = new Response("upstream error", { status: 502, headers: { "content-type": "text/plain" } });
    expect(mensagemDeRespostaNaoJson(proxy)).toContain("reiniciando");
  });

  it("avisa também quando vem outro formato com status normal", () => {
    const html = new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } });
    expect(mensagemDeRespostaNaoJson(html)).toContain("formato inesperado");
  });
});
