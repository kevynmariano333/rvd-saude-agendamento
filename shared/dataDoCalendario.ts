/**
 * Em que dia o calendário espera cada nota.
 *
 * A lista de agendamentos mostra, na nota pendente, a data proposta — a do
 * planejamento na frente da do fornecedor. O calendário mostrava o
 * `scheduledFor`, que na pendente é a data que o fornecedor pediu quando
 * mandou a nota. A mesma nota caía em dois dias diferentes conforme a tela, e
 * sumia do mês para o qual foi proposta.
 *
 * A regra vive aqui, sozinha, porque é ela que o servidor usa para filtrar o
 * mês e para escolher a célula: escrita duas vezes, divergiria de novo.
 */

export type NotaComData = { id: number; status: string; scheduledFor: Date };
export type PropostaEmAberto = { appointmentId: number; suggestedFor: Date };

/**
 * A data que vale para a nota.
 *
 * Só a pendente se desloca: uma vez cravada a data, proposta nenhuma muda o
 * que já foi combinado com o fornecedor.
 */
export function dataQueValeNoCalendario(nota: NotaComData, proposta?: Date): Date {
  return nota.status === "pending" && proposta ? proposta : nota.scheduledFor;
}

/** As notas do período, cada uma com a data em que o quadro deve mostrá-la. */
export function notasDoCalendario<T extends NotaComData>(
  notas: T[],
  propostas: PropostaEmAberto[],
  inicio: Date,
  fim: Date,
): (T & { dataDoCalendario: Date })[] {
  const propostaPorNota = new Map(propostas.map(linha => [linha.appointmentId, new Date(linha.suggestedFor)]));
  const porId = new Map<number, T>();
  for (const nota of notas) porId.set(nota.id, nota);
  return Array.from(porId.values())
    .map(nota => ({ ...nota, dataDoCalendario: dataQueValeNoCalendario(nota, propostaPorNota.get(nota.id)) }))
    .filter(nota => nota.dataDoCalendario >= inicio && nota.dataDoCalendario <= fim)
    .sort((a, b) => a.dataDoCalendario.getTime() - b.dataDoCalendario.getTime());
}

/** Os ids cuja data proposta cai no período — o que a busca por data não traz. */
export function propostasNoPeriodo(propostas: PropostaEmAberto[], inicio: Date, fim: Date): number[] {
  return propostas
    .filter(linha => {
      const quando = new Date(linha.suggestedFor);
      return quando >= inicio && quando <= fim;
    })
    .map(linha => linha.appointmentId);
}
