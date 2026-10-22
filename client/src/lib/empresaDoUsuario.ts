import { trpc } from "@/lib/trpc";
import { ehCargoDeMesa, lerEmpresas, recursosDasEmpresas, type EscopoDeEmpresas } from "@shared/empresas";
import { UNIDADES } from "@shared/recipients";

/**
 * Para quais empresas quem está logado trabalha — e o que elas usam do portal.
 *
 * O servidor é quem recusa o que não é da empresa; aqui a tela só deixa de
 * oferecer. Um menu "Backlog" que o servidor responderia com erro é pior do que
 * um menu sem Backlog.
 *
 * Sem corte (administrador, fornecedor, portaria): todas, com todos os
 * recursos. Cargo de mesa sem empresa marcada é Amil, como o servidor lê. Quem
 * atende mais de uma — a RVD e a LLT — tem o que qualquer uma das duas tem.
 */
export function useEmpresaDoUsuario() {
  const auth = trpc.auth.me.useQuery();
  const usuario = auth.data;
  const empresas: EscopoDeEmpresas = usuario && ehCargoDeMesa(usuario.role) ? lerEmpresas(usuario.empresasOperadas) : null;
  return {
    empresas,
    recursos: recursosDasEmpresas(empresas),
    /** As unidades que esta pessoa pode escolher: as das empresas dela, ou todas. */
    unidades: UNIDADES.filter(unidade => !empresas || empresas.includes(unidade.empresa)),
  };
}
