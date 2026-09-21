// Cópia do banco para o armazenamento de arquivos.
//
// Fica dentro do app porque é o único lugar que já alcança o banco e o bucket
// ao mesmo tempo: quem administra o sistema não tem acesso de administrador no
// provedor nem cliente MySQL instalado, e um backup que depende de ferramenta
// que ninguém tem nunca é feito.
//
// O destino é o bucket, e não o próprio provedor do banco, porque uma cópia
// guardada ao lado do original não protege contra o caso que mais importa, que
// é perder o provedor.

import { gzipSync } from "node:zlib";
import { getDb } from "./db";
import { storagePut } from "./storage";

export type ResumoBackup = {
  chave: string;
  geradoEm: string;
  tabelas: { tabela: string; linhas: number }[];
  totalLinhas: number;
  tamanhoBytes: number;
};

/** Nome com a data em UTC para os backups ordenarem sozinhos na listagem. */
export function nomeDoBackup(agora: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const carimbo =
    `${agora.getUTCFullYear()}-${p(agora.getUTCMonth() + 1)}-${p(agora.getUTCDate())}` +
    `-${p(agora.getUTCHours())}${p(agora.getUTCMinutes())}`;
  return `backups/rvd-saude-${carimbo}.json.gz`;
}

export async function gerarBackup(agora: Date = new Date()): Promise<ResumoBackup> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const [tabelas] = await db.execute<Record<string, string>[]>("SHOW TABLES");
  const nomes = (tabelas as unknown as Record<string, string>[]).map(
    linha => Object.values(linha)[0] as string,
  );

  const dados: Record<string, unknown[]> = {};
  const resumoTabelas: { tabela: string; linhas: number }[] = [];

  for (const tabela of nomes) {
    // O nome não vem de entrada do usuário — veio do próprio SHOW TABLES — mas
    // vai escapado de qualquer forma, para que isso continue verdade se alguém
    // passar a chamar esta função com uma lista vinda de outro lugar.
    const [linhas] = await db.execute<unknown[]>(
      `SELECT * FROM \`${tabela.replace(/`/g, "``")}\``,
    );
    const registros = linhas as unknown as unknown[];
    dados[tabela] = registros;
    resumoTabelas.push({ tabela, linhas: registros.length });
  }

  const conteudo = JSON.stringify({
    geradoEm: agora.toISOString(),
    origem: "railway-mysql",
    tabelas: nomes,
    dados,
  });

  const comprimido = gzipSync(Buffer.from(conteudo, "utf8"));
  // storagePut acrescenta um sufixo aleatório ao nome, o que aqui é desejável:
  // o caminho deixa de ser adivinhável a partir da data.
  const { key } = await storagePut(nomeDoBackup(agora), comprimido, "application/gzip");

  return {
    chave: key,
    geradoEm: agora.toISOString(),
    tabelas: resumoTabelas,
    totalLinhas: resumoTabelas.reduce((soma, t) => soma + t.linhas, 0),
    tamanhoBytes: comprimido.length,
  };
}
