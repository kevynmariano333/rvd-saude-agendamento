import { describe, expect, it } from "vitest";
import { copiaQueFica, copiasQueSaem } from "./copiaQueFica";

const nota = (extra: Partial<Parameters<typeof copiaQueFica>[0][number]> & { id: number }) => ({
  status: "pending",
  miroNumber: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  ...extra,
});

describe("qual cópia fica", () => {
  it("fica a que andou mais no fluxo", () => {
    const copias = [nota({ id: 1, status: "pending" }), nota({ id: 2, status: "received" })];
    expect(copiaQueFica(copias)?.id).toBe(2);
  });

  it("a recusada perde para a recebida: ela diz que a entrega não aconteceu", () => {
    const copias = [nota({ id: 1, status: "rejected" }), nota({ id: 2, status: "received" })];
    expect(copiaQueFica(copias)?.id).toBe(2);
  });

  it("empatado o fluxo, fica a que tem MIRO", () => {
    // Apagar a do MIRO deixaria o SAP apontando para nota que não existe mais.
    const copias = [nota({ id: 1, status: "completed" }), nota({ id: 2, status: "completed", miroNumber: "5105101642" })];
    expect(copiaQueFica(copias)?.id).toBe(2);
  });

  it("empatado tudo, fica a mais antiga — é a que as outras telas já citam", () => {
    const copias = [
      nota({ id: 9, status: "scheduled", createdAt: "2026-09-05T10:00:00.000Z" }),
      nota({ id: 3, status: "scheduled", createdAt: "2026-09-01T10:00:00.000Z" }),
    ];
    expect(copiaQueFica(copias)?.id).toBe(3);
  });

  it("sem nota nenhuma não há o que ficar", () => {
    expect(copiaQueFica([])).toBeNull();
  });
});

describe("quais cópias saem", () => {
  it("saem todas menos a que fica", () => {
    const copias = [nota({ id: 1, status: "pending" }), nota({ id: 2, status: "received" }), nota({ id: 3, status: "pending" })];
    expect(copiasQueSaem(copias).map(copia => copia.id)).toEqual([1, 3]);
  });

  it("uma cópia só nunca sai: apagar deixaria a entrega sem registro", () => {
    expect(copiasQueSaem([nota({ id: 1 })])).toEqual([]);
  });

  it("nunca devolve o grupo inteiro", () => {
    const copias = [nota({ id: 1 }), nota({ id: 2 }), nota({ id: 3 })];
    expect(copiasQueSaem(copias).length).toBe(copias.length - 1);
  });
});
