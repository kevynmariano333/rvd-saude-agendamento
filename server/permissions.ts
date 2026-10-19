import type { AppointmentStatus, UserRole } from "../drizzle/schema";

/**
 * O perfil que só olha.
 *
 * Vê as mesmas telas do planejador e não mexe em nada: nem propõe data, nem
 * escreve na tratativa, nem manda mensagem. É para quem precisa acompanhar a
 * operação sem responder por ela.
 */
export function ehSomenteLeitura(role: UserRole) {
  return role === "planejador_leitura";
}

/**
 * O que ele ainda pode executar, pelo caminho da rota.
 *
 * A trava é por negação: toda ação é barrada, e esta lista abre as exceções.
 * O contrário — listar o que é proibido — deixaria passar sozinha cada rota
 * nova que alguém escrevesse depois, que é como um perfil de consulta vira um
 * perfil comum sem ninguém decidir isso.
 *
 * São as três coisas sobre a própria conta e as duas de dar por visto. Marcar
 * como lido não muda a operação: muda o que esta pessoa já olhou, e sem isso o
 * sino nunca apagaria.
 */
export const ACOES_DE_QUEM_SO_OLHA = new Set([
  "auth.definirSituacao",
  "auth.updateName",
  "auth.changePassword",
  "auth.logout",
  "messages.limparAvisos",
  "internalNotes.marcarLida",
]);

export function podeExecutar(role: UserRole, caminho: string) {
  return !ehSomenteLeitura(role) || ACOES_DE_QUEM_SO_OLHA.has(caminho);
}

export function isOperator(role: UserRole) {
  return role === "operator" || role === "admin";
}

export function canRequestAppointment(role: UserRole) {
  return role === "supplier";
}

/**
 * Quem trabalha a agenda por dentro: a operação de agendamentos e o
 * planejamento. É a régua de leitura — lista de notas, histórico, calendário,
 * relatórios e painel — e também das ações que acompanham a carga depois de
 * marcada.
 */
export function isSchedulingDesk(role: UserRole) {
  return isOperator(role) || role === "planejador" || ehSomenteLeitura(role);
}

/**
 * Marcar a data é o compromisso com o fornecedor, e ele continua sendo do
 * Operador. O planejador propõe; quem confirma responde pela doca.
 */
export function canConfirmSchedule(role: UserRole) {
  return isOperator(role);
}

/**
 * Propor uma data sem marcá-la: o fornecedor pede, o planejador planeja.
 *
 * O administrador entra porque responde pelo sistema inteiro, e porque em
 * equipe pequena é ele quem cobre o planejamento quando não há planejador na
 * mesa. Marcar ele já podia; propor, não — e faltar a metade mais branda da
 * ação era o recorte mais difícil de explicar do portal.
 */
export function canSuggestSchedule(role: UserRole) {
  return role === "supplier" || role === "planejador" || role === "admin";
}

/**
 * Andar com a nota — receber, concluir, recusar, mandar para o backlog.
 *
 * É do Operador, e só dele. Receber é dizer que a mercadoria entrou, e recusar
 * é dizer que ela não entra: as duas são declarações sobre o que aconteceu na
 * doca, e quem responde pela doca é quem opera. O planejamento acompanha a
 * mesma tela, propõe data e trata o backlog, mas não decide o que entrou.
 */
export function canMoveAppointmentStatus(role: UserRole) {
  return isOperator(role);
}

/**
 * Tratar um backlog: resolver a divergência no SAP e no HIS e fechar a nota.
 *
 * É trabalho do planejamento, não de quem opera a doca — quem mandou a nota
 * para o backlog foi justamente o Operador, ao constatar que o recebimento não
 * fechava. O administrador entra porque responde pelo sistema inteiro.
 */
export function canTreatBacklog(role: UserRole) {
  return role === "planejador" || role === "admin";
}

export function canApplySuggestion(status: AppointmentStatus) {
  return status === "pending" || status === "backlog" || status === "scheduled";
}

export function canScheduleAppointment(status: AppointmentStatus) {
  return status === "pending" || status === "backlog" || status === "scheduled";
}

export function canRescueAppointment(status: AppointmentStatus) {
  return status === "rejected";
}

export function canTransitionAppointment(
  current: AppointmentStatus,
  next: Exclude<AppointmentStatus, "pending">
) {
  const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
    pending: ["scheduled", "backlog", "rejected"],
    scheduled: ["received", "backlog", "rejected"],
    received: ["completed", "backlog", "rejected"],
    backlog: ["scheduled", "rejected"],
    completed: [],
    rejected: [],
  };
  return transitions[current].includes(next);
}
