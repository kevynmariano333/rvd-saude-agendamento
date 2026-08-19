import { describe, expect, it } from "vitest";
import { isUnexpectedHtmlApiResponse } from "./apiResponse";

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
