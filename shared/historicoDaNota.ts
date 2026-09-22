// O histórico de uma nota em português.
//
// O banco guarda a transição — de qual status para qual —, que é o dado certo
// para guardar e o errado para mostrar. Quem abre a nota semanas depois quer
// ler o que aconteceu, não decifrar "backlog → completed".

export type StatusDaNota = "pending" | "scheduled" | "received" | "completed" | "backlog" | "rejected";

export type EventoDaNota = {
  previousStatus: StatusDaNota | null;
  nextStatus: StatusDaNota;
};

/**
 * A frase de um evento do histórico.
 *
 * Algumas transições merecem frase própria porque contam outra história: sair
 * do backlog para concluída não é "concluída", é "o backlog foi tratado"; voltar
 * de rejeitada para pendente é um resgate, não um começo.
 */
export function descricaoDoEvento(evento: EventoDaNota): string {
  const { previousStatus, nextStatus } = evento;

  if (previousStatus === null && nextStatus === "pending") return "Nota enviada ao portal";
  if (previousStatus === "backlog" && nextStatus === "completed") return "Backlog tratado e nota concluída";
  if (previousStatus === "backlog" && nextStatus === "scheduled") return "Devolvida do backlog para a agenda";
  if (previousStatus === "rejected" && nextStatus === "pending") return "Resgatada da recusa";
  if (previousStatus === "scheduled" && nextStatus === "scheduled") return "Reagendada";

  switch (nextStatus) {
    case "pending":
      return "Voltou a aguardar agendamento";
    case "scheduled":
      return "Agendada";
    case "received":
      return "Recebida na doca";
    case "completed":
      return "Concluída";
    case "backlog":
      return "Enviada para o backlog";
    case "rejected":
      return "Rejeitada";
    default:
      return "Status alterado";
  }
}

/** A cor do ponto na linha do tempo, pelo que o evento significa. */
export function tomDoEvento(nextStatus: StatusDaNota): "bom" | "atencao" | "ruim" | "neutro" {
  if (nextStatus === "completed") return "bom";
  if (nextStatus === "backlog") return "atencao";
  if (nextStatus === "rejected") return "ruim";
  return "neutro";
}
