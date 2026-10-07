import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lerBytes = vi.fn();
vi.mock("./storage", () => ({ storageLerBytes: (...args: unknown[]) => lerBytes(...args), storagePut: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn(), registrarInicioDeBackup: vi.fn(), registrarFimDeBackup: vi.fn(), registrarFalhaDeBackup: vi.fn() }));

const { lerBackupGravado } = await import("./backup");

describe("ler o backup gravado", () => {
  beforeEach(() => lerBytes.mockReset());

  it("descompacta o arquivo e devolve o conteúdo", async () => {
    const backup = { geradoEm: "2026-10-07T06:00:00.000Z", dados: { appointments: [{ id: 1 }] } };
    lerBytes.mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(backup), "utf8")));
    await expect(lerBackupGravado("backups/rvd-saude-2026-10-07-0600.json.gz")).resolves.toEqual(backup);
  });

  it("arquivo que não é backup do sistema é recusado com nome", async () => {
    // A chave vem da lista de cópias, mas um arquivo trocado no bucket não
    // pode virar um erro de "undefined" três camadas adiante.
    lerBytes.mockResolvedValue(gzipSync(Buffer.from(JSON.stringify({ qualquer: "coisa" }), "utf8")));
    await expect(lerBackupGravado("backups/x.json.gz")).rejects.toThrow("formato de um backup");
  });
});
