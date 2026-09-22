/**
 * Preenche o CNPJ do remetente nas notas antigas, relendo os XMLs guardados.
 *
 * A coluna `invoiceSupplierCnpj` é nova: as notas enviadas antes dela ficaram
 * sem o CNPJ de quem emitiu, mesmo tendo o XML no armazenamento. Este script
 * abre cada XML pelo caminho que a nota já guarda, lê o CNPJ do emitente e
 * grava. Nada além dessa coluna é tocado.
 *
 * Roda de dentro do container do Railway (aba Console do serviço do app), onde
 * o banco e as credenciais do R2 já estão no ambiente:
 *
 *   node scripts/preencher-cnpj-remetente.mjs              (simula, não grava)
 *   node scripts/preencher-cnpj-remetente.mjs --confirmar   (grava)
 *
 * Sem --confirmar ele só mostra o que faria. É seguro rodar quantas vezes
 * quiser: só mexe em nota cuja coluna está vazia.
 *
 * JavaScript puro, sem TypeScript, porque as dependências de desenvolvimento
 * podem não existir no container de produção.
 */

import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const CONFIRMAR = process.argv.includes("--confirmar");

const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
const S3_BUCKET = (process.env.S3_BUCKET ?? "").trim();
const S3_REGION = (process.env.S3_REGION ?? "auto").trim();
const S3_ENDPOINT = (process.env.S3_ENDPOINT ?? "").trim();
const S3_ACCESS_KEY_ID = (process.env.S3_ACCESS_KEY_ID ?? "").trim();
const S3_SECRET_ACCESS_KEY = (process.env.S3_SECRET_ACCESS_KEY ?? "").trim();
const S3_FORCE_PATH_STYLE = (process.env.S3_FORCE_PATH_STYLE ?? "").trim() === "true";

function exigirVariaveis() {
  for (const [nome, valor] of [
    ["DATABASE_URL", DATABASE_URL],
    ["S3_BUCKET", S3_BUCKET],
    ["S3_ACCESS_KEY_ID", S3_ACCESS_KEY_ID],
    ["S3_SECRET_ACCESS_KEY", S3_SECRET_ACCESS_KEY],
  ]) {
    if (!valor) {
      console.error(`[CNPJ] Falta a variável ${nome}. Rode este script no serviço do app, que já a tem.`);
      process.exit(1);
    }
  }
}

/**
 * O CNPJ (ou CPF) de quem emitiu a nota.
 *
 * Mesma leitura do servidor: recorta o bloco <emit> antes de procurar o número,
 * senão o primeiro CNPJ do arquivo seria o do destinatário.
 */
export function cnpjDoEmitente(xml) {
  const emitente = xml.match(/<(?:\w+:)?emit\b[^>]*>([\s\S]*?)<\/(?:\w+:)?emit>/i);
  if (!emitente) return null;
  const numero = emitente[1].match(/<(?:\w+:)?(?:CNPJ|CPF)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:CNPJ|CPF)>/i);
  if (!numero) return null;
  const digitos = numero[1].replace(/\D/g, "").slice(0, 20);
  return digitos.length >= 11 ? digitos : null;
}

async function baixar(cliente, chave) {
  const resposta = await cliente.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: chave }));
  return resposta.Body.transformToString("utf8");
}

async function main() {
  exigirVariaveis();
  console.log(CONFIRMAR ? "[CNPJ] Gravando." : "[CNPJ] Simulação — nada será gravado. Use --confirmar para valer.");

  const conexao = await mysql.createConnection(DATABASE_URL);
  const cliente = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });

  try {
    const [notas] = await conexao.query(
      "SELECT id, invoiceNumber, xmlStorageKey FROM appointments WHERE (invoiceSupplierCnpj IS NULL OR invoiceSupplierCnpj = '') AND xmlStorageKey IS NOT NULL AND xmlStorageKey <> ''",
    );
    console.log(`[CNPJ] ${notas.length} nota(s) sem CNPJ do remetente e com XML guardado.`);

    let preenchidas = 0;
    let semEmitente = 0;
    let semArquivo = 0;

    for (const nota of notas) {
      let xml;
      try {
        xml = await baixar(cliente, nota.xmlStorageKey);
      } catch (erro) {
        semArquivo += 1;
        console.warn(`[CNPJ] NF ${nota.invoiceNumber ?? nota.id}: XML não pôde ser lido (${erro?.name ?? "erro"}).`);
        continue;
      }

      const cnpj = cnpjDoEmitente(xml);
      if (!cnpj) {
        semEmitente += 1;
        console.warn(`[CNPJ] NF ${nota.invoiceNumber ?? nota.id}: o XML não traz o emitente identificado.`);
        continue;
      }

      if (CONFIRMAR) {
        await conexao.execute("UPDATE appointments SET invoiceSupplierCnpj = ? WHERE id = ?", [cnpj, nota.id]);
      }
      preenchidas += 1;
      console.log(`[CNPJ] NF ${nota.invoiceNumber ?? nota.id}: ${cnpj}${CONFIRMAR ? "" : " (simulado)"}`);
    }

    console.log(`\n[CNPJ] ${preenchidas} nota(s) ${CONFIRMAR ? "preenchidas" : "seriam preenchidas"}.`);
    if (semEmitente) console.log(`[CNPJ] ${semEmitente} sem emitente no XML — continuam usando o CNPJ do cadastro.`);
    if (semArquivo) console.log(`[CNPJ] ${semArquivo} com XML ilegível ou ausente no armazenamento.`);
    if (!CONFIRMAR && preenchidas) console.log("[CNPJ] Rode de novo com --confirmar para gravar.");
  } finally {
    await conexao.end();
  }
}

// Só roda quando é chamado pela linha de comando: assim o teste pode importar
// a leitura do XML sem disparar a gravação.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(erro => {
    // Sai com erro para uma execução automatizada não passar por bem-sucedida.
    console.error("\n[CNPJ] FALHOU:", erro?.message ?? erro);
    process.exit(1);
  });
}
