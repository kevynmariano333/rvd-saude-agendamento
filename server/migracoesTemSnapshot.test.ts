import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A última migração precisa ter o snapshot dela.
 *
 * O `drizzle-kit generate` descobre o que falta comparando o schema com o
 * último snapshot em `drizzle/meta`. Migração escrita à mão não gera snapshot
 * nenhum — então, para ele, nada daquela migração existe, e ele escreve outra
 * com o mesmo DDL. No deploy isso vira um `ALTER TABLE ... ADD` repetido e um
 * "coluna duplicada" que derruba a publicação inteira, com o build já pronto.
 *
 * Foi assim que uma publicação caiu: duas migrações à mão, sem snapshot, e o
 * pre-deploy gerou uma terceira igual.
 *
 * O teste olha só a última porque é ela que o gerador lê. Buracos no meio da
 * fila não atrapalham — e existe um, o 0037, de antes desta regra.
 */
const PASTA = resolve(import.meta.dirname, "..", "drizzle");

function indices(arquivos: string[], sufixo: string) {
  return arquivos
    .filter(nome => nome.endsWith(sufixo))
    .map(nome => nome.slice(0, 4))
    .filter(indice => /^\d{4}$/.test(indice))
    .sort();
}

describe("as migrações e os snapshots do drizzle", () => {
  const migracoes = indices(readdirSync(PASTA), ".sql");
  const snapshots = indices(readdirSync(resolve(PASTA, "meta")), "_snapshot.json");

  it("existe migração para conferir", () => {
    expect(migracoes.length).toBeGreaterThan(0);
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("a última migração tem snapshot — sem ele o deploy gera uma cópia dela", () => {
    const ultima = migracoes[migracoes.length - 1]!;
    expect(
      snapshots.includes(ultima),
      `A migração ${ultima} não tem drizzle/meta/${ultima}_snapshot.json. ` +
        "Gere a migração com `drizzle-kit generate` em vez de escrever o .sql à mão, " +
        "ou rode o generate depois para criar o snapshot que falta.",
    ).toBe(true);
  });

  it("nenhum snapshot sobra sem a migração correspondente", () => {
    // Snapshot sem .sql é sinal de migração apagada pela metade: o gerador
    // passa a comparar com um estado que o banco nunca viu.
    const orfaos = snapshots.filter(indice => !migracoes.includes(indice));
    expect(orfaos).toEqual([]);
  });
});
