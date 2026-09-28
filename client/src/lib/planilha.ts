/**
 * Monta a planilha e entrega o arquivo ao navegador.
 *
 * Quatro telas exportam Excel — relatório, fila do backlog, fornecedores e
 * histórico da portaria — e todas precisam do mesmo arquivo: colunas com
 * largura que caiba o conteúdo, aba com nome, data no nome do arquivo. Montado
 * em cada tela, isso ia divergindo com o tempo, e divergiu: três delas
 * repetiam as mesmas seis linhas com detalhes diferentes.
 *
 * A biblioteca do Excel chega aqui dentro, na hora do clique. Ela pesa quase um
 * megabyte e quase ninguém exporta planilha — carregada na abertura, o portal
 * inteiro paga por ela; carregada aqui, paga quem clica, uma vez só.
 */
export async function baixarPlanilha(input: {
  /** Número vai como número: a planilha da portaria soma minutos de espera. */
  linhas: Record<string, string | number>[];
  colunas: readonly string[];
  /** Largura por coluna, quando a tela já sabe a dela. Sem isso, cabe o título. */
  larguras?: readonly number[];
  /** Para planilha longa: o cabeçalho fica parado enquanto o resto rola. */
  congelarCabecalho?: boolean;
  aba: string;
  arquivo: string;
}) {
  const XLSX = await import("xlsx");
  // O cabeçalho explícito fixa a ordem das colunas: sem ele, a ordem sai do
  // primeiro objeto da lista, e uma linha com campo a menos bagunça o arquivo.
  const worksheet = XLSX.utils.json_to_sheet(input.linhas, { header: [...input.colunas] });
  // Sem largura, toda coluna sai no padrão do Excel e a data fica "#####".
  worksheet["!cols"] = input.colunas.map((coluna, i) => ({ wch: input.larguras?.[i] ?? Math.max(16, coluna.length + 6) }));
  if (input.congelarCabecalho) worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, input.aba);
  XLSX.writeFile(workbook, input.arquivo);
}

/** O nome do arquivo com a data de hoje, como o resto do sistema já escreve. */
export function nomeDaPlanilha(prefixo: string) {
  return `${prefixo}-rvd-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
