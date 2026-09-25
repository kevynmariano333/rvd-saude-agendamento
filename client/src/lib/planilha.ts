import * as XLSX from "xlsx";

/**
 * Monta a planilha e entrega o arquivo ao navegador.
 *
 * Duas telas exportam Excel — o relatório e a fila do backlog — e as duas
 * precisam do mesmo arquivo: colunas com a mesma largura, aba com nome, data
 * no nome do arquivo. Montado em cada tela, isso ia divergindo com o tempo.
 */
export function baixarPlanilha(input: { linhas: Record<string, string>[]; colunas: readonly string[]; aba: string; arquivo: string }) {
  const worksheet = XLSX.utils.json_to_sheet(input.linhas);
  // Sem largura, toda coluna sai no padrão do Excel e a data fica "#####".
  worksheet["!cols"] = input.colunas.map(coluna => ({ wch: Math.max(16, coluna.length + 6) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, input.aba);
  XLSX.writeFile(workbook, input.arquivo);
}

/** O nome do arquivo com a data de hoje, como o resto do sistema já escreve. */
export function nomeDaPlanilha(prefixo: string) {
  return `${prefixo}-rvd-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
