// Achar uma nota apagada dentro de um backup, com tudo o que estava pendurado
// nela.
//
// Apagar uma nota é definitivo: o banco leva junto, em cascata, o histórico, a
// conversa com o fornecedor, as notas internas e as sugestões. Não existe
// lixeira. O que existe é a cópia da madrugada, e ela guarda tudo — só que até
// hoje só servia para baixar, não para desfazer um clique.
//
// Este arquivo é só a leitura: dado o conteúdo de um backup e um número de
// nota, diz o que havia ali. Quem escreve no banco é outro lugar, e é por isso
// que esta parte pode ser testada sem banco nenhum.

export type LinhaDoBackup = Record<string, unknown>;

export type ConteudoDoBackup = {
  geradoEm?: string;
  dados?: Record<string, unknown>;
};

export type NotaEncontrada = {
  id: number;
  numeroDaNota: string;
  fornecedor: string;
  status: string;
  nota: LinhaDoBackup;
  /** Cada tabela que apontava para esta nota, com as linhas que eram dela. */
  filhas: { tabela: string; linhas: LinhaDoBackup[] }[];
  mensagens: number;
  historico: number;
};

export const TABELA_DAS_NOTAS = "appointments";
export const TABELA_DA_CONVERSA = "appointmentMessages";
export const TABELA_DO_HISTORICO = "appointmentStatusHistory";

/** A coluna por onde as tabelas filhas se penduram na nota. */
export const COLUNA_DA_NOTA = "appointmentId";

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

/**
 * Dois números de nota são o mesmo?
 *
 * Comparar string com string não basta: a mesma nota aparece como "8507" na
 * boca de quem pede e como "00008507" no XML que a gerou. Quando os dois lados
 * são só dígitos, o que vale é o número, e não quantos zeros vieram na frente.
 */
export function mesmaNota(a: unknown, b: unknown): boolean {
  const x = texto(a);
  const y = texto(b);
  if (!x || !y) return false;
  if (x.toLowerCase() === y.toLowerCase()) return true;
  const soDigitos = /^\d+$/;
  if (!soDigitos.test(x) || !soDigitos.test(y)) return false;
  return x.replace(/^0+(?=\d)/, "") === y.replace(/^0+(?=\d)/, "");
}

function linhasDa(dados: Record<string, unknown>, tabela: string): LinhaDoBackup[] {
  const valor = dados[tabela];
  if (!Array.isArray(valor)) return [];
  return valor.filter((linha): linha is LinhaDoBackup => typeof linha === "object" && linha !== null);
}

/**
 * Quais tabelas do backup se penduram numa nota.
 *
 * Descoberto pelos dados, e não por uma lista escrita aqui: a lista
 * envelheceria no dia em que o sistema ganhasse mais uma tabela ligada à nota,
 * e a restauração passaria a deixar um pedaço para trás sem avisar ninguém.
 */
export function tabelasPenduradasNaNota(backup: ConteudoDoBackup): string[] {
  const dados = backup?.dados ?? {};
  return Object.keys(dados)
    .filter(tabela => tabela !== TABELA_DAS_NOTAS)
    .filter(tabela => linhasDa(dados, tabela).some(linha => COLUNA_DA_NOTA in linha));
}

/**
 * As notas com aquele número que existiam quando o backup foi tirado.
 *
 * Devolve uma lista, e não uma nota: o mesmo número chega repetido quando o
 * fornecedor emite a nota em linhas separadas, uma por pedido de compra. Quem
 * restaura escolhe qual — e por isso cada uma vem com fornecedor e situação,
 * que é o que distingue uma da outra na tela.
 */
export function acharNotasNoBackup(backup: ConteudoDoBackup, numeroDaNota: string): NotaEncontrada[] {
  const dados = backup?.dados ?? {};
  const candidatas = linhasDa(dados, TABELA_DAS_NOTAS).filter(linha => mesmaNota(linha.invoiceNumber, numeroDaNota));
  const tabelas = tabelasPenduradasNaNota(backup);

  return candidatas.map(nota => {
    const id = Number(nota.id);
    const filhas = tabelas
      .map(tabela => ({ tabela, linhas: linhasDa(dados, tabela).filter(linha => Number(linha[COLUNA_DA_NOTA]) === id) }))
      .filter(filha => filha.linhas.length > 0);
    const conta = (tabela: string) => filhas.find(filha => filha.tabela === tabela)?.linhas.length ?? 0;
    return {
      id,
      numeroDaNota: texto(nota.invoiceNumber),
      fornecedor: texto(nota.invoiceSupplierName) || texto(nota.supplierName) || "Fornecedor não informado",
      status: texto(nota.status),
      nota,
      filhas,
      mensagens: conta(TABELA_DA_CONVERSA),
      historico: conta(TABELA_DO_HISTORICO),
    };
  });
}

/**
 * A nota de um id, com o que estava pendurado nela.
 *
 * Quem restaura escolhe pelo id, e não pelo número: o número pode repetir, e a
 * tela de restauração já mostrou qual é qual.
 */
export function acharNotaPeloId(backup: ConteudoDoBackup, id: number): NotaEncontrada | null {
  const nota = linhasDa(backup?.dados ?? {}, TABELA_DAS_NOTAS).find(linha => Number(linha.id) === id);
  if (!nota) return null;
  return acharNotasNoBackup(backup, texto(nota.invoiceNumber)).find(achada => achada.id === id) ?? null;
}

/**
 * O valor do JSON de volta no formato que o driver do MySQL entende.
 *
 * O backup é JSON: a data virou texto ISO e a coluna JSON virou objeto. Devolver
 * o texto como está gravaria a letra "T" dentro de um DATETIME; devolver o
 * objeto gravaria "[object Object]". A data volta a ser Date para ser escrita
 * pelo mesmo caminho por onde foi lida, que é o que garante que a hora que sai
 * é a hora que entrou.
 */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function valorParaOBanco(valor: unknown): unknown {
  if (typeof valor === "string") return DATA_ISO.test(valor) ? new Date(valor) : valor;
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "object") {
    const comoBuffer = valor as { type?: string; data?: number[] };
    if (comoBuffer.type === "Buffer" && Array.isArray(comoBuffer.data)) return Buffer.from(comoBuffer.data);
    return JSON.stringify(valor);
  }
  return valor;
}

/**
 * O começo do INSERT de uma linha do backup, e os valores que vão nele.
 *
 * Volta partido em dois porque os valores não podem ir no texto: eles carregam
 * a conversa com o fornecedor, com aspas e quebras de linha de quem digitou. O
 * texto leva só os nomes, escapados; os valores vão amarrados pelo driver.
 */
export function insertDaLinha(tabela: string, linha: LinhaDoBackup): { inicio: string; valores: unknown[] } {
  const colunas = Object.keys(linha);
  if (!colunas.length) throw new Error(`Linha vazia para a tabela ${tabela}.`);
  const nome = (texto: string) => `\`${texto.replace(/`/g, "``")}\``;
  return {
    inicio: `INSERT INTO ${nome(tabela)} (${colunas.map(nome).join(", ")}) VALUES`,
    valores: colunas.map(coluna => valorParaOBanco(linha[coluna])),
  };
}
