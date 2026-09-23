/**
 * As contas de teste: quando existem e com que senha.
 *
 * Elas abrem qualquer perfil do portal — fornecedor, portaria, operação,
 * operador — sem cadastro. Em desenvolvimento isso poupa trabalho. No ar, com
 * a senha "admin", é uma porta que qualquer pessoa que ache o endereço abre na
 * primeira tentativa, com acesso a todo o acervo e aos dados dos fornecedores.
 *
 * O meio-termo: em produção elas só existem se alguém definir uma senha própria
 * em SENHA_CONTAS_TESTE, e nunca respondem a "admin". Uma senha curta não vale:
 * o ponto é que ela não seja adivinhável, e "1234" não é melhor que "admin".
 */

/** O mínimo para uma senha que fica ligada num sistema no ar. */
export const MINIMO_DA_SENHA_DE_TESTE = 12;

export type EstadoDasContasDeTeste =
  | { ligadas: true; senha: string }
  | { ligadas: false; motivo: "produção sem senha configurada" | "senha configurada é curta demais" };

export function estadoDasContasDeTeste(opcoes: { producao: boolean; senhaConfigurada: string; senhaDeDesenvolvimento: string }): EstadoDasContasDeTeste {
  if (!opcoes.producao) return { ligadas: true, senha: opcoes.senhaDeDesenvolvimento };
  const senha = opcoes.senhaConfigurada.trim();
  if (!senha) return { ligadas: false, motivo: "produção sem senha configurada" };
  if (senha.length < MINIMO_DA_SENHA_DE_TESTE) return { ligadas: false, motivo: "senha configurada é curta demais" };
  return { ligadas: true, senha };
}
