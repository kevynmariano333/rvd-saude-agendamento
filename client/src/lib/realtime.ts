/**
 * De quanto em quanto tempo o portal pergunta de novo ao servidor.
 *
 * Este é o padrão de TODA consulta do sistema, e ele estava em cinco segundos,
 * em segundo plano. Uma aba de Agendamentos esquecida aberta repetia a lista de
 * notas 17.280 vezes por dia — de madrugada, no fim de semana, com a pessoa
 * almoçando —, e cada repetição é uma consulta no banco e uma resposta saindo
 * pela rede. Foi isso que pôs 38 GB de saída em nove dias numa operação de
 * algumas dezenas de notas por dia.
 *
 * Agora o padrão é um minuto, e só com a aba à vista. Quem não está olhando não
 * precisa de dado novo; quando a pessoa volta para a aba, a consulta é refeita
 * na hora pelo `refetchOnWindowFocus`, então ninguém encontra tela velha.
 *
 * As telas que precisam de tempo real de verdade — o portão e o pátio, onde tem
 * caminhão parado esperando decisão — continuam pedindo o seu próprio intervalo,
 * e ele vale acima deste.
 */
export const REALTIME_REFRESH_INTERVAL_MS = 60_000;

/**
 * Quanto tempo um dado recém-chegado ainda vale sem ir buscar de novo.
 *
 * Sem isto, trocar de tela e voltar refazia toda consulta na hora, mesmo que a
 * resposta tivesse chegado um segundo antes.
 */
export const REALTIME_STALE_TIME_MS = 30_000;

export const realtimeQueryDefaults = {
  staleTime: REALTIME_STALE_TIME_MS,
  refetchInterval: REALTIME_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;
