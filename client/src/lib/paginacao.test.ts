import { describe, expect, it } from "vitest";
import { numerosDasPaginas } from "./paginacao";

describe("números das páginas", () => {
  it("mostra todas quando cabem na barra", () => {
    expect(numerosDasPaginas(1, 1)).toEqual([1]);
    expect(numerosDasPaginas(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("esconde o meio com reticências quando são muitas", () => {
    expect(numerosDasPaginas(1, 20)).toEqual([1, 2, "vazio", 20]);
    expect(numerosDasPaginas(10, 20)).toEqual([1, "vazio", 9, 10, 11, "vazio", 20]);
    expect(numerosDasPaginas(20, 20)).toEqual([1, "vazio", 19, 20]);
  });

  it("não repete a primeira nem a última quando a atual é vizinha delas", () => {
    expect(numerosDasPaginas(2, 20)).toEqual([1, 2, 3, "vazio", 20]);
    expect(numerosDasPaginas(19, 20)).toEqual([1, "vazio", 18, 19, 20]);
  });

  it("a reticência só entra onde ficou página escondida", () => {
    // Entre 4 e 8 ficaram 5, 6 e 7: cabe reticência. Entre 1 e 2 não ficou
    // nada, e ali ela seria mentira.
    expect(numerosDasPaginas(3, 8)).toEqual([1, 2, 3, 4, "vazio", 8]);
    expect(numerosDasPaginas(4, 8)).toEqual([1, "vazio", 3, 4, 5, "vazio", 8]);
  });
});
