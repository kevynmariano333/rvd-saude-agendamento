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

import { gunzipSync, gzipSync } from "node:zlib";
import { eq, inArray, sql } from "drizzle-orm";
import { appointments, systemAlerts } from "../drizzle/schema";
import { getDb, registrarFalhaDeBackup, registrarFimDeBackup, registrarInicioDeBackup } from "./db";
import { acharNotaPeloId, acharNotasNoBackup, insertDaLinha, TABELA_DAS_NOTAS, type ConteudoDoBackup } from "./notaNoBackup";
import { storageLerBytes, storagePut } from "./storage";

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

/**
 * O backup com o registro da tentativa em volta.
 *
 * É por aqui que passam os dois caminhos — o botão do administrador e o
 * agendamento da madrugada —, para que os dois apareçam na mesma lista. Sem
 * isso, o backup automático seria invisível: rodaria (ou deixaria de rodar) sem
 * ninguém ter como saber.
 */
export async function executarBackup(origem: "automatico" | "manual", agora: Date = new Date()): Promise<ResumoBackup> {
  const id = await registrarInicioDeBackup(origem);
  try {
    const resumo = await gerarBackup(agora);
    await registrarFimDeBackup(id, { chave: resumo.chave, linhas: resumo.totalLinhas, bytes: resumo.tamanhoBytes });
    return resumo;
  } catch (erro) {
    // A falha é gravada e relançada: quem clicou precisa ver o erro na tela, e
    // quem for olhar amanhã precisa achar o registro.
    await registrarFalhaDeBackup(id, erro).catch(() => {});
    throw erro;
  }
}

/**
 * O backup lido de volta, descomprimido e aberto.
 *
 * O arquivo passa pelo processo do app, o que o download evita de propósito —
 * mas aqui não tem jeito: para recolocar uma nota no banco é preciso ler o que
 * estava escrito nela, e o navegador de quem administra não fala com o MySQL.
 */
export async function lerBackupGravado(chave: string): Promise<ConteudoDoBackup> {
  const bytes = await storageLerBytes(chave);
  const texto = chave.endsWith(".gz") ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
  const conteudo = JSON.parse(texto) as ConteudoDoBackup;
  if (!conteudo?.dados) throw new Error("Este arquivo não tem o formato de um backup do sistema.");
  return conteudo;
}

export type NotaDisponivelParaRestaurar = {
  id: number;
  numeroDaNota: string;
  fornecedor: string;
  status: string;
  mensagens: number;
  historico: number;
  /** Já existe no banco hoje — então não é isto que foi apagado. */
  jaExiste: boolean;
};

/**
 * O que havia com aquele número quando o backup foi tirado.
 *
 * A busca vem antes da restauração, e separada dela, porque quem apagou sem
 * querer precisa primeiro reconhecer a nota: o número sozinho não distingue a
 * nota certa da homônima de outro fornecedor, e recolocar a errada é mais um
 * estrago, não menos.
 */
export async function procurarNotaEmBackup(input: { chave: string; numeroDaNota: string }): Promise<{ geradoEm: string | null; notas: NotaDisponivelParaRestaurar[] }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const conteudo = await lerBackupGravado(input.chave);
  const achadas = acharNotasNoBackup(conteudo, input.numeroDaNota);

  const existentes = new Set<number>();
  if (achadas.length) {
    const linhas = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(inArray(appointments.id, achadas.map(nota => nota.id)));
    for (const linha of linhas) existentes.add(linha.id);
  }

  return {
    geradoEm: conteudo.geradoEm ?? null,
    notas: achadas.map(nota => ({
      id: nota.id,
      numeroDaNota: nota.numeroDaNota,
      fornecedor: nota.fornecedor,
      status: nota.status,
      mensagens: nota.mensagens,
      historico: nota.historico,
      jaExiste: existentes.has(nota.id),
    })),
  };
}

/**
 * O código do erro do MySQL, por baixo das camadas que o embrulham.
 *
 * O driver diz `ER_NO_REFERENCED_ROW_2`; o ORM embrulha isso num erro próprio
 * e põe o original em `cause`. Procurar só na superfície faz todo erro virar
 * "erro desconhecido" — que é o que impede de explicar o único caso que
 * acontece de verdade.
 */
function codigoDoErroDoBanco(erro: unknown): string | null {
  let atual: unknown = erro;
  for (let camada = 0; camada < 5 && atual; camada += 1) {
    const codigo = (atual as { code?: unknown }).code;
    if (typeof codigo === "string") return codigo;
    atual = (atual as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Recoloca no banco uma nota apagada, com tudo o que estava pendurado nela.
 *
 * A nota volta com o mesmo id que tinha. Não é detalhe: é o id que a conversa,
 * o histórico e as sugestões citam, e dar um número novo a ela seria recolocar
 * uma casca vazia com as mensagens penduradas em lugar nenhum.
 *
 * Tudo numa transação só. Meia nota restaurada — a linha sem a conversa, ou a
 * conversa sem a nota — seria pior do que a nota apagada: pelo menos a apagada
 * é visivelmente ausente.
 *
 * O que não volta é o que mudou depois do backup: se a nota foi apagada hoje à
 * tarde e o backup é da madrugada, o que aconteceu com ela entre uma coisa e
 * outra se perdeu junto. Por isso a tela diz de quando é a cópia.
 */
export async function restaurarNotaDoBackup(input: { chave: string; appointmentId: number; adminId: number }): Promise<{ id: number; linhas: { tabela: string; linhas: number }[]; geradoEm: string | null }> {
  return restaurarNotaDoConteudo(await lerBackupGravado(input.chave), input);
}

/**
 * A escrita em si, separada do download.
 *
 * Em partes porque são dois riscos diferentes: buscar o arquivo no bucket, e
 * recolocar as linhas no banco. O segundo é o que pode deixar o banco pela
 * metade, e é o que dá para conferir contra um MySQL de verdade sem depender
 * do armazenamento.
 */
export async function restaurarNotaDoConteudo(
  conteudo: ConteudoDoBackup,
  input: { appointmentId: number; adminId: number },
): Promise<{ id: number; linhas: { tabela: string; linhas: number }[]; geradoEm: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const alvo = acharNotaPeloId(conteudo, input.appointmentId);
  if (!alvo) throw new Error("Esta nota não está neste backup.");

  const jaExiste = await db.select({ id: appointments.id }).from(appointments).where(eq(appointments.id, alvo.id)).limit(1);
  if (jaExiste.length) throw new Error("Esta nota já está no sistema — não há o que restaurar.");

  const escritas: { tabela: string; linhas: number }[] = [];
  const escrever = async () => await db.transaction(async tx => {
    const gravar = async (tabela: string, linhas: Record<string, unknown>[]) => {
      for (const linha of linhas) {
        const { inicio, valores } = insertDaLinha(tabela, linha);
        const partes = [sql.raw(`${inicio} (`)];
        valores.forEach((valor, indice) => {
          if (indice) partes.push(sql.raw(", "));
          partes.push(sql`${valor}`);
        });
        partes.push(sql.raw(")"));
        await tx.execute(sql.join(partes));
      }
      escritas.push({ tabela, linhas: linhas.length });
    };

    // A nota primeiro: as outras tabelas apontam para ela.
    await gravar(TABELA_DAS_NOTAS, [alvo.nota]);
    for (const filha of alvo.filhas) await gravar(filha.tabela, filha.linhas);
  });

  try {
    await escrever();
  } catch (erro) {
    // O erro do driver nunca chega à tela. Ele vem com a consulta e com todos
    // os valores dela — que aqui são a conversa com o fornecedor e as notas
    // internas. Mostrar isso num aviso de erro seria vazar o conteúdo da nota
    // na tentativa de explicar por que ela não voltou.
    console.error("[Restauração] falhou ao recolocar a nota:", erro);
    const codigo = codigoDoErroDoBanco(erro);
    if (codigo === "ER_NO_REFERENCED_ROW_2" || codigo === "ER_NO_REFERENCED_ROW") {
      throw new Error("Esta nota cita um usuário ou uma empresa que não existe mais no sistema. Recrie o cadastro antes de restaurar a nota.");
    }
    if (codigo === "ER_DUP_ENTRY") {
      throw new Error("Parte desta nota já está no banco. Confira se ela não foi restaurada antes.");
    }
    throw new Error("Não consegui recolocar esta nota no banco. Nada foi gravado — o erro está no log do servidor.");
  }

  const resumo = [
    `NF ${alvo.numeroDaNota || "sem número"}`,
    `id ${alvo.id}`,
    `status ${alvo.status}`,
    `${alvo.mensagens} mensagem(ns)`,
    `${alvo.historico} linha(s) de histórico`,
    `do backup de ${conteudo.geradoEm ?? "data desconhecida"}`,
    `restaurada pelo usuário ${input.adminId}`,
  ].join(" · ");
  await db.insert(systemAlerts).values({ kind: "nota-restaurada", sentAt: new Date(), detail: resumo.slice(0, 500) });
  console.warn(`[Restauração] ${resumo}`);

  return { id: alvo.id, linhas: escritas, geradoEm: conteudo.geradoEm ?? null };
}
