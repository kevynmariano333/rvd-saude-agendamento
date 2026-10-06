/**
 * A que data o período do relatório se aplica.
 *
 * O relatório sempre filtrou pela data de agendamento, e os campos dizem isso
 * — "Agendamento: início / fim". Mas quem fecha o mês lê aquilo como "período
 * do relatório", puxa setembro, e estranha ver outubro na coluna do último
 * status: a nota agendada no dia 30 foi concluída no dia 1º, e as duas coisas
 * são verdade.
 *
 * Nenhuma das três datas é a certa sozinha. Depende da pergunta:
 *
 * - "o que estava marcado para setembro" é agendamento;
 * - "o que de fato entrou na doca em setembro" é recebimento;
 * - "o que chegou ao sistema em setembro" é criação.
 *
 * Então a tela pergunta, em vez de escolher por quem lê.
 */
export const BASES_DA_DATA = ["agendamento", "recebimento", "criacao"] as const;

export type BaseDaData = (typeof BASES_DA_DATA)[number];

/** A que o relatório se refere quando ninguém escolheu: como sempre foi. */
export const BASE_DA_DATA_PADRAO: BaseDaData = "agendamento";

export function ehBaseDaData(valor: string | null | undefined): valor is BaseDaData {
  return BASES_DA_DATA.includes(valor as BaseDaData);
}

/** O rótulo do seletor, e o que os campos de data passam a dizer. */
export const ROTULOS_DA_BASE: Record<BaseDaData, { nome: string; inicio: string; fim: string; explica: string }> = {
  agendamento: {
    nome: "Data de agendamento",
    inicio: "Agendamento: início",
    fim: "Agendamento: fim",
    explica: "O que estava marcado para o período — mesmo que tenha sido recebido ou concluído depois.",
  },
  recebimento: {
    nome: "Data de recebimento",
    inicio: "Recebimento: início",
    fim: "Recebimento: fim",
    explica: "O que de fato entrou na doca no período. Nota ainda não recebida não aparece.",
  },
  criacao: {
    nome: "Data de criação",
    inicio: "Criação: início",
    fim: "Criação: fim",
    explica: "O que chegou ao sistema no período, tenha sido agendado para quando for.",
  },
};
