/**
 * Backup do banco para o Cloudflare R2.
 *
 * Roda de dentro do container do Railway (aba Console do serviço do app), onde
 * o banco já é alcançável pela rede interna e as credenciais do R2 já estão nas
 * variáveis de ambiente. Assim o backup não depende de ninguém ter cliente
 * MySQL instalado nem acesso de administrador ao painel.
 *
 * O destino é o R2 de propósito: um backup guardado no mesmo provedor do banco
 * não protege contra o caso que mais importa, que é perder o provedor.
 *
 *   node scripts/backup-banco.mjs
 *
 * Escrito em JavaScript puro, sem TypeScript, porque as dependências de
 * desenvolvimento (entre elas o tsx) podem não existir no container de produção.
 * Usa apenas mysql2 e o cliente S3, que são dependências de execução.
 */

import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import mysql from "mysql2/promise";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
const S3_BUCKET = (process.env.S3_BUCKET ?? "").trim();
const S3_REGION = (process.env.S3_REGION ?? "auto").trim();
const S3_ENDPOINT = (process.env.S3_ENDPOINT ?? "").trim();
const S3_ACCESS_KEY_ID = (process.env.S3_ACCESS_KEY_ID ?? "").trim();
const S3_SECRET_ACCESS_KEY = (process.env.S3_SECRET_ACCESS_KEY ?? "").trim();
const S3_FORCE_PATH_STYLE = (process.env.S3_FORCE_PATH_STYLE ?? "").trim() === "true";

function exigir(nome, valor) {
  if (!valor) {
    console.error(`[Backup] Falta a variável ${nome}. Rode este script no serviço do app, que já a tem.`);
    process.exit(1);
  }
  return valor;
}

exigir("DATABASE_URL", DATABASE_URL);
exigir("S3_BUCKET", S3_BUCKET);
exigir("S3_ACCESS_KEY_ID", S3_ACCESS_KEY_ID);
exigir("S3_SECRET_ACCESS_KEY", S3_SECRET_ACCESS_KEY);

/** Nome do arquivo com a data em UTC, para os backups ordenarem sozinhos na listagem. */
function nomeDoArquivo(agora) {
  const p = n => String(n).padStart(2, "0");
  const carimbo =
    `${agora.getUTCFullYear()}-${p(agora.getUTCMonth() + 1)}-${p(agora.getUTCDate())}` +
    `-${p(agora.getUTCHours())}${p(agora.getUTCMinutes())}`;
  return `backups/rvd-saude-${carimbo}.json.gz`;
}

async function lerBanco() {
  const conexao = await mysql.createConnection(DATABASE_URL);
  try {
    const [tabelas] = await conexao.query("SHOW TABLES");
    const nomes = tabelas.map(linha => Object.values(linha)[0]);

    const dados = {};
    const contagem = {};
    for (const tabela of nomes) {
      // Nome de tabela não pode ir como parâmetro; vem do próprio SHOW TABLES,
      // mas ainda assim é escapado com crase para não depender disso.
      const [linhas] = await conexao.query(`SELECT * FROM \`${tabela.replace(/`/g, "``")}\``);
      dados[tabela] = linhas;
      contagem[tabela] = linhas.length;
      console.log(`[Backup] ${tabela}: ${linhas.length} linha(s)`);
    }
    return { dados, contagem, nomes };
  } finally {
    await conexao.end();
  }
}

async function comprimir(texto) {
  const partes = [];
  await pipeline(
    Readable.from([texto]),
    createGzip(),
    async function* (fonte) {
      for await (const parte of fonte) partes.push(parte);
    },
  );
  return Buffer.concat(partes);
}

async function enviarParaR2(chave, corpo) {
  const cliente = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  await cliente.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: chave,
      Body: corpo,
      ContentType: "application/gzip",
    }),
  );
}

async function main() {
  const agora = new Date();
  console.log(`[Backup] Iniciando em ${agora.toISOString()}`);

  const { dados, contagem, nomes } = await lerBanco();

  const conteudo = JSON.stringify({
    geradoEm: agora.toISOString(),
    origem: "railway-mysql",
    tabelas: nomes,
    contagem,
    dados,
  });

  const comprimido = await comprimir(conteudo);
  const chave = nomeDoArquivo(agora);

  await enviarParaR2(chave, comprimido);

  const total = Object.values(contagem).reduce((soma, n) => soma + n, 0);
  const mb = (comprimido.length / 1024 / 1024).toFixed(2);
  console.log(`\n[Backup] Pronto: ${total} linhas em ${nomes.length} tabelas, ${mb} MB comprimidos.`);
  console.log(`[Backup] Salvo no bucket "${S3_BUCKET}" em: ${chave}`);
}

main().catch(erro => {
  // Sai com código de erro para que uma execução agendada não pareça bem-sucedida.
  console.error("\n[Backup] FALHOU:", erro?.message ?? erro);
  process.exit(1);
});
