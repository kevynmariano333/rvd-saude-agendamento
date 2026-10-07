import type { EstadoDaPresenca } from "@shared/presenca";

/**
 * A cor da bolinha de cada situação.
 *
 * Verde, âmbar e cinza, que é o que todo mundo já lê sem legenda — e as mesmas
 * cores de estado que o resto do portal usa para "pode seguir", "espera" e
 * "fora". A cor nunca vai sozinha: o rótulo escrito está sempre do lado, para
 * quem não distingue verde de âmbar não ficar sem a informação.
 */
export const CORES_DA_SITUACAO: Record<EstadoDaPresenca, string> = {
  disponivel: "bg-state-go",
  ocupado: "bg-state-stop",
  ausente: "bg-state-wait",
  desconectado: "bg-ink-faint",
};
