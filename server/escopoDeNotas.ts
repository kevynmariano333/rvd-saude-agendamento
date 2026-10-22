// Quem pode ver qual nota — e, por tabela, qual arquivo de nota.
//
// A regra já existia dentro das rotas do tRPC. O download dos anexos não
// passava por ela: bastava estar logado e conhecer o nome do arquivo. O nome
// tem um sufixo sorteado, mas isso é obstáculo, não permissão — quem já está
// dentro do portal não devia depender da sorte para não ler o XML de outro
// fornecedor.
//
// Por isso a regra mora aqui, num lugar só, e as duas portas usam a mesma.

import type { UserRole } from "../drizzle/schema";
import { listApprovedCompanyUserIds, listarIdsDaEmpresa, notaPelaChaveDoArquivo } from "./db";
import { usuarioAtendeANota } from "./escopoDeEmpresa";
import { isSchedulingDesk } from "./permissions";
import { buildScopeIds, companyKey, isWithinScope } from "./supplierScope";

export type UsuarioComEscopo = { id: number; role: UserRole; companyCnpj?: string | null; companyId?: number | null; empresaOperada?: string | null };

/**
 * Os logins de fornecedor cujas notas este usuário pode ler.
 *
 * Contas que dividem o CNPJ enxergam as notas da empresa; só as aprovadas
 * contam, então o login que ainda espera o operador não vê a empresa nem é
 * visto por ela.
 */
export async function idsNoEscopo(user: UsuarioComEscopo): Promise<number[]> {
  // Conta agrupada numa empresa enxerga os CNPJs todos dela — é para isso que a
  // empresa existe. Sem grupo, continua valendo o CNPJ da própria conta.
  if (user.companyId) return buildScopeIds(user.id, await listarIdsDaEmpresa(user.companyId));
  const chave = companyKey(user.companyCnpj);
  if (!chave) return [user.id];
  return buildScopeIds(user.id, await listApprovedCompanyUserIds(chave));
}

/**
 * A mesa lê a agenda da empresa que atende; o fornecedor, só o que é dele.
 *
 * `recipientCnpj` é o destinatário da nota, que diz de qual empresa ela é. Sem
 * ele a mesa passa — quem chama sem a nota na mão confere a empresa por fora.
 */
export async function podeVerNota(
  user: UsuarioComEscopo,
  supplierId: number | null | undefined,
  recipientCnpj?: string | null,
): Promise<boolean> {
  if (isSchedulingDesk(user.role)) return recipientCnpj === undefined ? true : usuarioAtendeANota(user, recipientCnpj);
  return isWithinScope(await idsNoEscopo(user), supplierId);
}

/**
 * Este usuário pode baixar o arquivo guardado nesta chave?
 *
 * Chave que não pertence a nota nenhuma não é liberada: o bucket guarda outras
 * coisas, e uma chave órfã não tem dono para comparar. Negar é a resposta certa
 * quando não se sabe de quem é.
 */
export async function podeBaixarArquivo(user: UsuarioComEscopo, chave: string): Promise<boolean> {
  const nota = await notaPelaChaveDoArquivo(chave);
  if (!nota) return false;
  return podeVerNota(user, nota.supplierId, nota.recipientCnpj ?? null);
}
