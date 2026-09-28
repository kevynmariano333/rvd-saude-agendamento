#!/usr/bin/env node
/**
 * Devolve um backup para dentro de um banco.
 *
 * O backup diário existia sem caminho de volta: ninguém nunca tinha restaurado
 * um, e um backup que nunca foi restaurado é esperança, não cópia — pode estar
 * gravando arquivo vazio há semanas com o painel verde. Pior: o dia de
 * precisar é o pior dia possível para inventar o procedimento.
 *
 * Uso:
 *   node scripts/restaurar-backup.mjs --listar                     (quais backups existem)
 *   node scripts/restaurar-backup.mjs <backup>                     (só mostra o que faria)
 *   node scripts/restaurar-backup.mjs <backup> --confirmar
 *
 * O <backup> pode ser um arquivo aqui do lado ou a chave dele no bucket
 * (`backups/rvd-saude-....json.gz`) — dentro do container do Railway, que é de
 * onde isto roda no dia ruim, só a segunda forma existe: o banco só é alcançável
 * pela rede interna e ninguém tem cliente MySQL na máquina.
 *
 * O destino é o DATABASE_URL do ambiente. Por padrão o script não grava nada:
 * ele lê, confere e conta. Gravar exige --confirmar escrito à mão, porque
 * restaurar no banco errado apaga o que estava lá.
 */

import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import mysql from "mysql2/promise";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

/** O mesmo bucket em que o backup diário escreve, lido das mesmas variáveis. */
function abrirBucket() {
  const bucket = (process.env.S3_BUCKET ?? "").trim();
  const chave = (process.env.S3_ACCESS_KEY_ID ?? "").trim();
  const segredo = (process.env.S3_SECRET_ACCESS_KEY ?? "").trim();
  if (!bucket || !chave || !segredo) {
    console.error("Sem as variáveis do bucket (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).");
    console.error("Rode isto no Console do serviço do app no Railway, que já as tem.");
    process.exit(1);
  }
  const endpoint = (process.env.S3_ENDPOINT ?? "").trim();
  const cliente = new S3Client({
    region: (process.env.S3_REGION ?? "auto").trim(),
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "").trim() === "true",
    credentials: { accessKeyId: chave, secretAccessKey: segredo },
  });
  return { cliente, bucket };
}

/** Os backups mais recentes primeiro — o nome já carrega a data, então ordenar por nome basta. */
async function listarBackups() {
  const { cliente, bucket } = abrirBucket();
  const resposta = await cliente.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/" }));
  const arquivos = (resposta.Contents ?? []).sort((a, b) => (a.Key < b.Key ? 1 : -1));
  if (!arquivos.length) {
    console.log("Nenhum backup no bucket ainda.");
    return;
  }
  console.log(`${arquivos.length} backup(s) em ${bucket}, do mais novo para o mais velho:\n`);
  for (const arquivo of arquivos.slice(0, 20)) {
    console.log(`  ${arquivo.Key}  (${Math.round((arquivo.Size ?? 0) / 1024)} KB)`);
  }
}

async function baixarDoBucket(chaveDoArquivo) {
  const { cliente, bucket } = abrirBucket();
  const resposta = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: chaveDoArquivo }));
  const pedacos = [];
  for await (const pedaco of resposta.Body) pedacos.push(pedaco);
  return Buffer.concat(pedacos);
}

/** A ordem de gravação não importa: as travas de chave estrangeira saem antes. */
async function restaurar(conexao, dados, tabelas) {
  const contagem = [];
  await conexao.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const tabela of tabelas) {
      const linhas = dados[tabela] ?? [];
      const escapada = `\`${tabela.replace(/`/g, "``")}\``;
      await conexao.query(`DELETE FROM ${escapada}`);
      if (linhas.length) {
        // Em blocos: um INSERT com 4.000 linhas estoura o limite do pacote.
        const colunas = Object.keys(linhas[0]);
        const lista = colunas.map(coluna => `\`${coluna.replace(/`/g, "``")}\``).join(", ");
        for (let i = 0; i < linhas.length; i += 200) {
          const bloco = linhas.slice(i, i + 200);
          const valores = bloco.map(linha => colunas.map(coluna => linha[coluna] ?? null));
          await conexao.query(`INSERT INTO ${escapada} (${lista}) VALUES ?`, [valores]);
        }
      }
      contagem.push({ tabela, linhas: linhas.length });
    }
  } finally {
    await conexao.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  return contagem;
}

async function main() {
  if (process.argv.includes("--listar")) {
    await listarBackups();
    return;
  }

  const origem = process.argv[2];
  const confirmar = process.argv.includes("--confirmar");
  if (!origem) {
    console.error("Informe o backup: node scripts/restaurar-backup.mjs <arquivo-ou-chave.json.gz> [--confirmar]");
    console.error("Para ver o que existe no bucket: node scripts/restaurar-backup.mjs --listar");
    process.exit(1);
  }
  const destino = (process.env.DATABASE_URL ?? "").trim();
  if (!destino) {
    console.error("DATABASE_URL não definida — sem destino para restaurar.");
    process.exit(1);
  }

  // Arquivo aqui do lado, se existir; senão é chave no bucket. Nessa ordem
  // porque o arquivo local é o caso do teste, e o bucket é o do dia ruim.
  const bruto = existsSync(origem) ? readFileSync(origem) : await baixarDoBucket(origem);
  const conteudo = JSON.parse(gunzipSync(bruto).toString("utf8"));
  const tabelas = conteudo.tabelas ?? Object.keys(conteudo.dados ?? {});
  const total = tabelas.reduce((soma, tabela) => soma + (conteudo.dados?.[tabela]?.length ?? 0), 0);

  console.log(`Backup de ${conteudo.geradoEm} · ${tabelas.length} tabelas · ${total} linhas`);
  for (const tabela of tabelas) {
    console.log(`  ${tabela}: ${conteudo.dados?.[tabela]?.length ?? 0}`);
  }

  // O host aparece para quem roda conferir que é o banco que pretendia. A
  // senha nunca: ela está na mesma URL.
  const host = new URL(destino).host;
  if (!confirmar) {
    console.log(`\nNada foi gravado. Para restaurar em ${host}, repita o comando com --confirmar.`);
    console.log("Atenção: a restauração APAGA o conteúdo atual das tabelas acima.");
    process.exit(0);
  }

  console.log(`\nRestaurando em ${host}...`);
  const conexao = await mysql.createConnection({ uri: destino, multipleStatements: false });
  try {
    const contagem = await restaurar(conexao, conteudo.dados ?? {}, tabelas);
    const gravadas = contagem.reduce((soma, t) => soma + t.linhas, 0);
    console.log(`\nRestaurado: ${gravadas} linhas em ${contagem.length} tabelas.`);

    // Conferência: conta de volta no banco, porque "o insert não deu erro" não
    // é o mesmo que "os dados estão lá".
    let conferidas = 0;
    for (const { tabela } of contagem) {
      const [linhas] = await conexao.query(`SELECT COUNT(*) AS total FROM \`${tabela.replace(/`/g, "``")}\``);
      conferidas += Number(linhas[0].total);
    }
    console.log(`Conferido no banco: ${conferidas} linhas.`);
    if (conferidas !== gravadas) {
      console.error("As contagens não batem — confira antes de considerar a restauração boa.");
      process.exit(2);
    }
  } finally {
    await conexao.end();
  }
}

main().catch(erro => {
  console.error("Falhou:", erro.message);
  process.exit(1);
});
