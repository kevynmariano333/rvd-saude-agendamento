/**
 * Aplica as migrações pendentes quando o servidor sobe.
 *
 * Antes disto, o banco só mudava se alguém abrisse o console do Railway e
 * rodasse `pnpm db:push` à mão. Não rodava: o código subia com colunas que o
 * banco não tinha, e a tela que lia a coluna nova quebrava — o sistema parecia
 * "não ter atualizado nada", quando na verdade tinha subido pela metade.
 *
 * Aqui é a mesma coisa que o `drizzle-kit migrate` faz, mas pela biblioteca que
 * já vai junto no servidor (drizzle-orm é dependência de produção; drizzle-kit
 * é de desenvolvimento e pode não existir no container).
 */

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { sql } from "drizzle-orm";
import { ENV } from "./env";

/** A pasta com os .sql e o meta/_journal.json, como o repositório a entrega. */
const PASTA_PADRAO = "drizzle";

function pastaDasMigracoes() {
  const escolhida = (process.env.MIGRATIONS_DIR || PASTA_PADRAO).trim();
  return resolve(process.cwd(), escolhida);
}

/** Quantas migrações o banco já registrou. Serve para dizer quantas entraram. */
async function jaAplicadas(db: { execute: (consulta: ReturnType<typeof sql>) => Promise<unknown> }): Promise<number | null> {
  try {
    const resultado = (await db.execute(sql`SELECT COUNT(*) AS total FROM \`__drizzle_migrations\``)) as unknown[];
    const linhas = resultado[0] as { total: number | string }[];
    return Number(linhas?.[0]?.total ?? 0);
  } catch {
    // Primeira subida: a tabela de controle ainda não existe.
    return null;
  }
}

export type ResultadoDaMigracao =
  | { estado: "sem-banco" }
  | { estado: "sem-pasta"; pasta: string }
  | { estado: "aplicada"; aplicadas: number; total: number }
  | { estado: "falhou"; erro: Error };

/**
 * Roda as migrações e conta o que entrou.
 *
 * A conexão é própria e fecha no fim: a do app é um pool que fica de pé pelo
 * resto da vida do processo, e uma migração pendurada nele seguraria uma
 * conexão do pool à toa.
 */
/** O banco pode demorar a aceitar conexão logo depois de um deploy. */
async function esperar(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

const TENTATIVAS = 3;
const TRAVA = "rvd_migracoes";

export async function aplicarMigracoesPendentes(): Promise<ResultadoDaMigracao> {
  if (!ENV.databaseUrl) return { estado: "sem-banco" };

  const pasta = pastaDasMigracoes();
  try {
    const arquivos = readdirSync(pasta).filter(nome => nome.endsWith(".sql"));
    if (!arquivos.length) return { estado: "sem-pasta", pasta };
  } catch {
    return { estado: "sem-pasta", pasta };
  }

  // Um pool de uma conexão só: é o formato que o migrador do drizzle espera, e
  // fechá-lo no fim devolve a conexão em vez de deixá-la presa até o processo cair.
  let ultimoErro: Error | null = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    const conexao = mysql.createPool({ uri: ENV.databaseUrl, connectionLimit: 1 });
    try {
      const db = drizzle(conexao);
      // Uma trava no próprio MySQL: num deploy com duas instâncias subindo
      // juntas, as duas tentariam criar a mesma coluna e uma morreria. Com a
      // trava, a segunda espera, vê o trabalho feito e não faz nada.
      await db.execute(sql`SELECT GET_LOCK(${TRAVA}, 60)`);
      try {
        const antes = await jaAplicadas(db);
        await migrate(db, { migrationsFolder: pasta });
        const depois = await jaAplicadas(db);
        return { estado: "aplicada", aplicadas: Math.max(0, (depois ?? 0) - (antes ?? 0)), total: depois ?? 0 };
      } finally {
        await db.execute(sql`SELECT RELEASE_LOCK(${TRAVA})`).catch(() => undefined);
      }
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro : new Error(String(erro));
      // Banco que ainda não aceita conexão logo depois do deploy é comum e
      // passa sozinho; erro de SQL na migração não passa, mas repetir três
      // vezes custa segundos e não estraga nada, porque cada passo já
      // aplicado fica registrado.
      if (tentativa < TENTATIVAS) await esperar(tentativa * 2000);
    } finally {
      await conexao.end().catch(() => undefined);
    }
  }
  return { estado: "falhou", erro: ultimoErro ?? new Error("Falha desconhecida ao migrar.") };
}

/**
 * Conta o que aconteceu e diz se o servidor pode continuar subindo.
 *
 * Em produção, migração que falha derruba a subida de propósito: o Railway
 * mantém no ar a versão anterior, que funciona, em vez de publicar uma nova que
 * lê colunas inexistentes. Em desenvolvimento, só avisa — quem está com o banco
 * local desatualizado não precisa do processo morrendo na cara.
 */
export async function migrarNaSubida(): Promise<void> {
  const resultado = await aplicarMigracoesPendentes();

  if (resultado.estado === "sem-banco") {
    console.warn("[Migrações] DATABASE_URL não definida — o banco não foi tocado.");
    return;
  }
  if (resultado.estado === "sem-pasta") {
    console.warn(`[Migrações] Nenhum arquivo .sql em ${resultado.pasta} — nada para aplicar.`);
    return;
  }
  if (resultado.estado === "aplicada") {
    if (resultado.aplicadas > 0) console.log(`[Migrações] ${resultado.aplicadas} migração(ões) aplicada(s). Total no banco: ${resultado.total}.`);
    else console.log(`[Migrações] Banco já estava em dia (${resultado.total} aplicadas).`);
    return;
  }

  console.error(`[Migrações] FALHOU ao aplicar: ${resultado.erro.message}`);
  console.error("[Migrações] O banco pode estar a meio caminho. Confira o erro acima antes de subir de novo.");
  if (ENV.isProduction) throw resultado.erro;
}
