/**
 * O motivo que o Agiliza deu, lido de volta do histórico da nota.
 *
 * Quando o acervo foi importado, cada ida ao backlog virou uma linha de
 * histórico escrita assim:
 *
 *     Importação do histórico do Agiliza: Nota enviada ao backlog no sistema
 *     Agiliza (motivo: divergencia_preco).
 *
 * O código do motivo também foi gravado na própria nota — mas esse campo é um
 * só, e vale para a ida ao backlog mais recente. Quem mandar a nota ao backlog
 * de novo escreve por cima, e aí o que o Agiliza disse só existe aqui.
 *
 * É por isso que vale ler o histórico: ele é a memória que não foi sobrescrita.
 */
const MOTIVO_NO_HISTORICO = /\(motivo:\s*([^)]+)\)/i;

export function codigoDoAgilizaNaLinha(eventNote: string | null | undefined): string | null {
  if (!eventNote) return null;
  const achado = MOTIVO_NO_HISTORICO.exec(eventNote);
  const codigo = achado?.[1]?.trim();
  return codigo ? codigo : null;
}

/**
 * O motivo da ida ao backlog mais recente que o Agiliza registrou.
 *
 * As linhas chegam da mais nova para a mais velha. Uma nota que travou, foi
 * resolvida e travou de novo tem dois motivos no histórico, e o que vale é o
 * último: é o problema que estava aberto quando o acervo foi importado.
 */
export function codigoDoAgilizaNoHistorico(eventNotes: (string | null)[]): string | null {
  for (const linha of eventNotes) {
    const codigo = codigoDoAgilizaNaLinha(linha);
    if (codigo) return codigo;
  }
  return null;
}
