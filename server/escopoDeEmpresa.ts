// De qual empresa é quem está operando — e, portanto, quais notas ele enxerga.
//
// O escopo por fornecedor (escopoDeNotas.ts) responde "esta nota é do meu
// CNPJ?". Este responde outra pergunta, para quem trabalha na mesa: "esta nota
// é de um cliente que eu atendo?". O operador da RVD não lê o que vai para o
// Hospital, e o planejador da Amil não lê o que vai para a LLT. Não é
// preferência de tela: é informação comercial de um cliente na mão de quem
// trabalha para outro.
//
// A regra mora aqui, num lugar só, e não nas rotas: uma rota nova que esquecer
// dela já nasce coberta pelo middleware que chama estas funções.

import type { UserRole } from "../drizzle/schema";
import { ehCodigoDeEmpresa, notaNoEscopo, type CodigoDaEmpresa } from "../shared/empresas";

export type UsuarioDeEmpresa = { role: UserRole; empresaOperada?: string | null };

/** Os cargos de mesa: quem opera as notas de uma empresa. */
const CARGOS_DA_MESA: UserRole[] = ["operator", "planejador", "planejador_leitura"];

/**
 * A empresa que este usuário atende, ou null quando não há corte.
 *
 * Sem corte: o administrador, que é quem cuida das três; e quem não trabalha
 * na mesa — fornecedor, portaria, operação —, que tem outros limites.
 *
 * Cargo de mesa sem empresa marcada vale Amil. O portal nasceu só com ela, e
 * trancar para fora uma conta que sempre operou seria pior do que o contrário.
 * Mas é "Amil", nunca "todas": faltar o cadastro não pode abrir as outras duas.
 */
export function empresaDoUsuario(user: UsuarioDeEmpresa): CodigoDaEmpresa | null {
  if (!CARGOS_DA_MESA.includes(user.role)) return null;
  return ehCodigoDeEmpresa(user.empresaOperada) ? user.empresaOperada : "amil";
}

/** Esta nota, pelo CNPJ de quem a recebe, está dentro do que o usuário atende? */
export function usuarioAtendeANota(user: UsuarioDeEmpresa, recipientCnpj: string | null | undefined): boolean {
  return notaNoEscopo(empresaDoUsuario(user), recipientCnpj);
}
