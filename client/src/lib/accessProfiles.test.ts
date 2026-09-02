import { describe, expect, it } from "vitest";
import { accessProfilePath, accessProfiles, parseAccessProfile } from "./accessProfiles";

describe("acessos da home", () => {
  it("abre o login no acesso escolhido na home", () => {
    expect(parseAccessProfile("fornecedor")).toBe("supplier");
    expect(parseAccessProfile("operador")).toBe("operator");
    expect(parseAccessProfile("portaria")).toBe("portaria");
  });

  // Um endereço digitado errado não pode escolher acesso no lugar da pessoa:
  // sem perfil reconhecido, a tela devolve para a home.
  it("não adivinha o acesso quando o endereço não corresponde a nenhum", () => {
    expect(parseAccessProfile("admin")).toBeNull();
    expect(parseAccessProfile("supplier")).toBeNull();
    expect(parseAccessProfile("")).toBeNull();
    expect(parseAccessProfile(undefined)).toBeNull();
  });

  it("liga cada cartão da home ao seu próprio endereço de login", () => {
    for (const profile of accessProfiles) {
      const path = accessProfilePath(profile.value);
      expect(path).toBe(`/entrar/${profile.slug}`);
      expect(parseAccessProfile(path.split("/").pop())).toBe(profile.value);
    }
  });
});
