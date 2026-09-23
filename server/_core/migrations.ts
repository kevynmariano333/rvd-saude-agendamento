/**
 * Aplica as migrações pendentes quando o servidor sobe.
 *
 * Antes disto, o banco só mudava se alguém abrisse o console do provedor e
 * rodasse `pnpm db:push` à mão. Não rodava: o código subia com colunas que o
 * banco não tinha, e a tela que lia a coluna nova quebrava — o sistema parecia
 * "não ter atualizado nada", quando na verdade tinha subido pela metade.
 *
 * A aplicação é escrita aqui, e não delegada ao migrador do drizzle, por um
 * motivo concreto: um banco que já tem as tabelas mas nunca registrou uma
 * migração — porque o schema foi criado à mão, ou por uma ferramenta que não
 * anota nada — faz aquele migrador tentar criar tudo de novo e morrer no
 * primeiro "table already exists". Numa subida, morrer significa deploy
 * falhado e a versão antiga no ar: de novo, "não atualizou nada".
 *
 * Então cada comando é executado um a um, e os erros que significam "isso já
 * existe" são contados e seguidos adiante. Qualquer outro erro continua
 * interrompendo tudo — tolerar o que já existe não é o mesmo que ignorar o que
 * quebrou. O registro fica na mesma tabela e no mesmo formato que o drizzle
 * usa, para o `drizzle-kit migrate` continuar enxergando o que já entrou.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import mysql from "mysql2/promise";
import { ENV } from "./env";

/** A pasta com os .sql e o meta/_journal.json, como o repositório a entrega. */
const PASTA_PADRAO = "drizzle";
const TABELA = "__drizzle_migrations";
const TRAVA = "rvd_migracoes";
const TENTATIVAS = 3;

/**
 * Erros do MySQL que dizem "isso já está aplicado".
 *
 * 1050 tabela já existe · 1060 coluna já existe · 1061 índice já existe ·
 * 1091 o que ia sumir já sumiu · 1826/1022/1005 nome de chave repetido.
 * É a rede de segurança: antes de chegar aqui, cada comando é conferido no
 * information_schema, que é uma pergunta direta em vez de um erro interpretado.
 */
const JA_APLICADO = new Set([1050, 1060, 1061, 1091, 1826, 1022, 1005]);

/**
 * O objeto que este comando criaria já existe no banco?
 *
 * Perguntar antes é mais honesto do que executar e perdoar o erro: o erro do
 * MySQL para "tabela já existe" e para "tabela com defeito" às vezes é o mesmo
 * número, e perdoar os dois esconderia o segundo. As quatro formas cobertas são
 * as que as migrações deste projeto usam — o resto é UPDATE, INSERT IGNORE,
 * DROP ... IF EXISTS e MODIFY COLUMN, que já podem rodar duas vezes.
 */
type Migracao = { tag: string; quando: number; hash: string; comandos: string[] };

function pastaDasMigracoes() {
  return resolve(process.cwd(), (process.env.MIGRATIONS_DIR || PASTA_PADRAO).trim());
}

/**
 * Lê o diário e os arquivos na ordem em que precisam entrar.
 *
 * O hash é o mesmo que o drizzle calcula (sha256 do arquivo inteiro), e o
 * carimbo é o do diário: são esses dois valores que fazem as duas ferramentas
 * concordarem sobre o que já foi aplicado.
 */
function lerMigracoes(pasta: string): Migracao[] {
  const diario = JSON.parse(readFileSync(join(pasta, "meta", "_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  return [...diario.entries]
    .sort((a, b) => a.idx - b.idx)
    .map(entrada => {
      const sql = readFileSync(join(pasta, `${entrada.tag}.sql`), "utf8");
      return {
        tag: entrada.tag,
        quando: entrada.when,
        hash: createHash("sha256").update(sql).digest("hex"),
        // O drizzle separa os comandos com esta marca; sem ela o arquivo inteiro
        // iria como um comando só e o MySQL recusaria.
        comandos: sql
          .split("--> statement-breakpoint")
          .map(comando => comando.trim())
          .filter(comando => comando.length > 0),
      };
    });
}

type Sonda = { consulta: string; valores: string[] };

/** A pergunta que confirma se o que este comando criaria já está no banco. */
function sondaDoComando(comando: string): Sonda | null {
  const nome = "`?([A-Za-z0-9_]+)`?";

  const tabela = new RegExp(`^CREATE TABLE(?: IF NOT EXISTS)? ${nome}`, "i").exec(comando);
  if (tabela) {
    return { consulta: "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1", valores: [tabela[1]] };
  }

  const restricao = new RegExp(`^ALTER TABLE ${nome} ADD CONSTRAINT ${nome}`, "i").exec(comando);
  if (restricao) {
    return {
      consulta: "SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ? LIMIT 1",
      valores: [restricao[1], restricao[2]],
    };
  }

  const coluna = new RegExp(`^ALTER TABLE ${nome} ADD (?:COLUMN )?${nome}`, "i").exec(comando);
  if (coluna) {
    return {
      consulta: "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1",
      valores: [coluna[1], coluna[2]],
    };
  }

  const indice = new RegExp(`^CREATE (?:UNIQUE )?INDEX ${nome} ON ${nome}`, "i").exec(comando);
  if (indice) {
    return {
      consulta: "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
      valores: [indice[2], indice[1]],
    };
  }

  return null;
}

async function jaExisteNoBanco(conexao: mysql.Connection, comando: string): Promise<boolean> {
  const sonda = sondaDoComando(comando);
  if (!sonda) return false;
  const [linhas] = await conexao.query(sonda.consulta, sonda.valores);
  return (linhas as unknown[]).length > 0;
}

/**
 * Até onde o banco já está, quando não há registro nenhum de migração.
 *
 * Um banco criado antes de existir controle de migração — ou por outra
 * ferramenta — tem as tabelas mas não tem o diário. Repetir a história desde o
 * zero nesse banco não é só redundante: é impossível, porque um passo antigo
 * mexe em coluna que um passo posterior apagou, e o replay morre no meio.
 *
 * A conta é feita de trás para frente, e não do começo: a migração mais nova
 * cujo efeito está no banco diz a que altura ele chegou. De frente para trás a
 * resposta seria errada, porque migração antiga cria coisa que migração nova
 * derruba — a tabela não estar lá não significa que ela nunca existiu.
 *
 * Migração que não dá para sondar (um UPDATE, uma troca de tipo) não decide
 * nada sozinha: a busca continua para trás até achar uma que dê.
 */
async function medirBaseline(conexao: mysql.Connection, migracoes: Migracao[]): Promise<number> {
  for (let indice = migracoes.length - 1; indice >= 0; indice -= 1) {
    const sondaveis = migracoes[indice].comandos.filter(comando => sondaDoComando(comando) !== null);
    if (!sondaveis.length) continue;
    let todasPresentes = true;
    for (const comando of sondaveis) {
      if (!(await jaExisteNoBanco(conexao, comando))) {
        todasPresentes = false;
        break;
      }
    }
    if (todasPresentes) return indice + 1;
  }
  return 0;
}

export type ResultadoDaMigracao =
  | { estado: "sem-banco" }
  | { estado: "sem-pasta"; pasta: string }
  | { estado: "aplicada"; aplicadas: number; total: number; toleradas: number; reconhecidas: number }
  | { estado: "falhou"; erro: Error };

function codigoDoErro(erro: unknown): number | null {
  const numero = (erro as { errno?: number })?.errno;
  return typeof numero === "number" ? numero : null;
}

async function migrarComConexao(conexao: mysql.Connection, migracoes: Migracao[]) {
  await conexao.query(
    `CREATE TABLE IF NOT EXISTS \`${TABELA}\` (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`
  );
  const [registradas] = await conexao.query(`SELECT hash, created_at FROM \`${TABELA}\``);
  const jaRegistradas = new Set((registradas as { hash: string }[]).map(linha => linha.hash));

  // Sem registro nenhum, o banco pode estar vazio (baseline 0, roda tudo) ou
  // ser antigo e já ter o schema (baseline alto, registra sem rodar).
  const baseline = jaRegistradas.size === 0 ? await medirBaseline(conexao, migracoes) : 0;
  let reconhecidas = 0;

  let aplicadas = 0;
  let toleradas = 0;
  for (let indice = 0; indice < migracoes.length; indice += 1) {
    const migracao = migracoes[indice];
    if (jaRegistradas.has(migracao.hash)) continue;
    if (indice < baseline) {
      await conexao.query(`INSERT INTO \`${TABELA}\` (hash, created_at) VALUES (?, ?)`, [migracao.hash, migracao.quando]);
      reconhecidas += 1;
      continue;
    }
    for (const comando of migracao.comandos) {
      try {
        if (await jaExisteNoBanco(conexao, comando)) {
          toleradas += 1;
          continue;
        }
        await conexao.query(comando);
      } catch (erro) {
        const codigo = codigoDoErro(erro);
        if (codigo !== null && JA_APLICADO.has(codigo)) {
          toleradas += 1;
          continue;
        }
        throw new Error(`${migracao.tag}: ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
    await conexao.query(`INSERT INTO \`${TABELA}\` (hash, created_at) VALUES (?, ?)`, [migracao.hash, migracao.quando]);
    aplicadas += 1;
  }
  return { aplicadas, toleradas, reconhecidas, total: migracoes.length };
}

async function esperar(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function aplicarMigracoesPendentes(): Promise<ResultadoDaMigracao> {
  if (!ENV.databaseUrl) return { estado: "sem-banco" };

  const pasta = pastaDasMigracoes();
  let migracoes: Migracao[];
  try {
    if (!readdirSync(pasta).some(nome => nome.endsWith(".sql"))) return { estado: "sem-pasta", pasta };
    migracoes = lerMigracoes(pasta);
  } catch {
    return { estado: "sem-pasta", pasta };
  }

  let ultimoErro: Error | null = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    let conexao: mysql.Connection | null = null;
    try {
      conexao = await mysql.createConnection(ENV.databaseUrl);
      // Uma trava no próprio MySQL: num deploy com duas instâncias subindo
      // juntas, as duas tentariam criar a mesma coluna e uma morreria. Com a
      // trava, a segunda espera, vê o trabalho feito e não faz nada.
      await conexao.query("SELECT GET_LOCK(?, 60)", [TRAVA]);
      try {
        const contas = await migrarComConexao(conexao, migracoes);
        return { estado: "aplicada", ...contas };
      } finally {
        await conexao.query("SELECT RELEASE_LOCK(?)", [TRAVA]).catch(() => undefined);
      }
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro : new Error(String(erro));
      // Banco que ainda não aceita conexão logo depois do deploy é comum e
      // passa sozinho. Repetir custa segundos, e cada migração já registrada
      // não entra de novo.
      if (tentativa < TENTATIVAS) await esperar(tentativa * 2000);
    } finally {
      await conexao?.end().catch(() => undefined);
    }
  }
  return { estado: "falhou", erro: ultimoErro ?? new Error("Falha desconhecida ao migrar.") };
}

/**
 * Conta o que aconteceu e diz se o servidor pode continuar subindo.
 *
 * Em produção, migração que falha derruba a subida de propósito: o provedor
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
    if (resultado.aplicadas > 0) console.log(`[Migrações] ${resultado.aplicadas} de ${resultado.total} aplicada(s).`);
    else console.log(`[Migrações] Banco já estava em dia (${resultado.total} migrações).`);
    if (resultado.reconhecidas > 0) {
      console.log(`[Migrações] ${resultado.reconhecidas} já estavam no banco de antes do controle de versão e foram registradas sem rodar.`);
    }
    if (resultado.toleradas > 0) {
      console.log(`[Migrações] ${resultado.toleradas} comando(s) já estavam aplicados no banco e foram registrados sem repetir.`);
    }
    return;
  }

  console.error(`[Migrações] FALHOU ao aplicar: ${resultado.erro.message}`);
  console.error("[Migrações] O banco pode estar a meio caminho. Confira o erro acima antes de subir de novo.");
  if (ENV.isProduction) throw resultado.erro;
}

/** Quantas migrações o banco registrou e quantas o código traz. */
export async function situacaoDasMigracoes(): Promise<{ registradas: number | null; esperadas: number | null }> {
  const pasta = pastaDasMigracoes();
  let esperadas: number | null = null;
  try {
    esperadas = lerMigracoes(pasta).length;
  } catch {
    esperadas = null;
  }
  if (!ENV.databaseUrl) return { registradas: null, esperadas };
  let conexao: mysql.Connection | null = null;
  try {
    conexao = await mysql.createConnection(ENV.databaseUrl);
    const [linhas] = await conexao.query(`SELECT COUNT(*) AS total FROM \`${TABELA}\``);
    const total = (linhas as { total: number | string }[])[0]?.total;
    return { registradas: Number(total ?? 0), esperadas };
  } catch {
    return { registradas: null, esperadas };
  } finally {
    await conexao?.end().catch(() => undefined);
  }
}
