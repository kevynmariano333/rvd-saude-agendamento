import { describe, expect, it } from "vitest";
import { estadoDasContasDeTeste, MINIMO_DA_SENHA_DE_TESTE } from "./contasDeTeste";

const cenario = (producao: boolean, senhaConfigurada = "") =>
  estadoDasContasDeTeste({ producao, senhaConfigurada, senhaDeDesenvolvimento: "admin" });

describe("contas de teste", () => {
  it("em desenvolvimento valem com a senha simples de sempre", () => {
    expect(cenario(false)).toEqual({ ligadas: true, senha: "admin" });
  });

  it("em produção, sem senha configurada, não existem", () => {
    expect(cenario(true)).toEqual({ ligadas: false, motivo: "produção sem senha configurada" });
  });

  it("em produção, com senha longa, voltam a valer — com ela, não com \"admin\"", () => {
    const senha = "s3nha-de-teste-rvd";
    expect(senha.length).toBeGreaterThanOrEqual(MINIMO_DA_SENHA_DE_TESTE);
    expect(cenario(true, senha)).toEqual({ ligadas: true, senha });
  });

  it("uma senha curta não liga nada: trocar \"admin\" por \"1234\" não é proteger", () => {
    expect(cenario(true, "1234")).toEqual({ ligadas: false, motivo: "senha configurada é curta demais" });
  });

  it("espaço em branco não conta como senha", () => {
    expect(cenario(true, "            ")).toEqual({ ligadas: false, motivo: "produção sem senha configurada" });
  });
});
