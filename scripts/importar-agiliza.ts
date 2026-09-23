/**
 * Importação do acervo do Agiliza pela linha de comando.
 *
 * A lógica inteira mora em server/agilizaImport.ts, que é o mesmo código que a
 * tela de administração usa. Aqui só ficam as três coisas que são da linha de
 * comando: ler os argumentos, abrir os arquivos e imprimir o relatório.
 *
 *   pnpm exec tsx scripts/importar-agiliza.ts consolidado.csv \
 *     --itens=detalhado.csv --backlog=backlog.csv              # simulação
 *   pnpm exec tsx scripts/importar-agiliza.ts consolidado.csv \
 *     --itens=detalhado.csv --backlog=backlog.csv --confirmar  # grava
 *
 * A simulação é o padrão de propósito: é uma carga grande, feita uma vez, num
 * banco de produção que não tem tela nenhuma para desfazer o estrago. Sem
 * "--confirmar" o script só lê, valida e conta.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { importarAcervo, type RelatorioDaImportacao } from "../server/agilizaImport";

const ORIGEM = "Agiliza";

function lerArgumentos(argv: string[]) {
  const caminhos = argv.filter(argumento => !argumento.startsWith("--"));
  const confirmar = argv.includes("--confirmar");
  const loteBruto = argv.find(argumento => argumento.startsWith("--lote="))?.split("=")[1];
  const lote = loteBruto ? Number(loteBruto) : undefined;
  if (lote !== undefined && (!Number.isInteger(lote) || lote < 1)) throw new Error("--lote precisa ser um número inteiro maior que zero.");
  const valorDe = (nome: string) => argv.find(argumento => argumento.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") || null;
  return { csv: caminhos[0], confirmar, lote, itens: valorDe("itens"), backlog: valorDe("backlog") };
}

function imprimir(relatorio: RelatorioDaImportacao, csv: string) {
  const titulo = relatorio.gravou ? "IMPORTAÇÃO CONFIRMADA (dados gravados)" : "SIMULAÇÃO (nada foi gravado)";
  console.log(`\nImportação do acervo do ${ORIGEM} — ${titulo}`);
  console.log(`Arquivo: ${csv}`);
  if (relatorio.semBanco) console.log("DATABASE_URL não definida: as contagens de 'já existente' não puderam ser verificadas.");
  console.log("");
  console.log(`Linhas lidas no consolidado: ${relatorio.linhasConsolidado}`);
  if (relatorio.linhasDetalhado !== null) console.log(`Linhas lidas no detalhado:   ${relatorio.linhasDetalhado}`);
  if (relatorio.linhasBacklog !== null) console.log(`Linhas lidas no backlog:     ${relatorio.linhasBacklog}`);
  console.log(`${relatorio.gravou ? "Importadas:             " : "A importar:             "} ${relatorio.importadas}`);
  console.log(`Já existentes:           ${relatorio.jaExistentes}`);
  console.log(`Recusadas:               ${relatorio.recusas.length}`);
  console.log(`Fornecedores:            ${relatorio.fornecedores.total} (${relatorio.fornecedores.criados} criados, ${relatorio.fornecedores.reaproveitados} já cadastrados)`);
  if (relatorio.linhasDetalhado !== null) console.log(`Notas com itens:         ${relatorio.notasComItens}`);
  if (relatorio.linhasBacklog !== null) {
    console.log(`Notas com backlog:       ${relatorio.notasComBacklog} (${relatorio.backlogEmAberto} ainda abertas)`);
    console.log(`Comentários:             ${relatorio.comentarios}`);
    if (relatorio.episodiosSemNota > 0) console.log(`Episódios de backlog sem nota correspondente no consolidado: ${relatorio.episodiosSemNota}`);
    if (relatorio.motivosDesconhecidos.length) {
      console.log("\nMotivos de backlog sem correspondência na lista do portal (gravados só na descrição):");
      for (const { codigo, quantidade } of relatorio.motivosDesconhecidos) console.log(`  ${codigo}: ${quantidade}`);
    }
  }
  console.log(`Por status:              ${Object.entries(relatorio.porStatus).map(([status, quantidade]) => `${status} ${quantidade}`).join(", ")}`);

  if (relatorio.avisos.length) {
    console.log(`\nAvisos (${relatorio.avisos.length}):`);
    for (const aviso of relatorio.avisos) console.log(`  linha ${aviso.linha}: ${aviso.texto}`);
  }
  if (relatorio.recusas.length) {
    console.log(`\nRecusas (${relatorio.recusas.length}):`);
    for (const recusa of relatorio.recusas) console.log(`  linha ${recusa.linha}: ${recusa.motivo}`);
  }
  if (!relatorio.gravou) console.log("\nNada foi gravado. Para gravar, repita o comando com --confirmar.");
  console.log("");
}

async function principal() {
  const { csv, confirmar, lote, itens, backlog } = lerArgumentos(process.argv.slice(2));
  if (!csv) {
    console.error("Informe o caminho do CSV: pnpm exec tsx scripts/importar-agiliza.ts consolidado.csv [--itens=detalhado.csv] [--backlog=backlog.csv] [--confirmar]");
    process.exit(1);
  }
  const relatorio = await importarAcervo(
    {
      consolidado: readFileSync(csv, "utf8"),
      detalhado: itens ? readFileSync(itens, "utf8") : null,
      backlog: backlog ? readFileSync(backlog, "utf8") : null,
    },
    { confirmar, lote }
  );
  imprimir(relatorio, csv);
}

// Só roda quando é chamado pela linha de comando.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal()
    .then(() => process.exit(0))
    .catch(erro => {
      console.error(`\n[Importação ${ORIGEM}] ${erro instanceof Error ? erro.message : erro}`);
      process.exit(1);
    });
}
