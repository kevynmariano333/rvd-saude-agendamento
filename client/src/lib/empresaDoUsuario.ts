import { trpc } from "@/lib/trpc";
import { ehCargoDeMesa, ehCodigoDeEmpresa, recursosDaEmpresa, type CodigoDaEmpresa } from "@shared/empresas";
import { UNIDADES } from "@shared/recipients";

/**
 * Para qual empresa quem está logado trabalha — e o que ela usa do portal.
 *
 * O servidor é quem recusa o que não é da empresa; aqui a tela só deixa de
 * oferecer. Um menu "Backlog" que o servidor responderia com erro é pior do que
 * um menu sem Backlog.
 *
 * Sem empresa (administrador, fornecedor, portaria): sem corte e com todos os
 * recursos. Cargo de mesa sem empresa marcada é Amil, como o servidor lê.
 */
export function useEmpresaDoUsuario() {
  const auth = trpc.auth.me.useQuery();
  const usuario = auth.data;
  const empresa: CodigoDaEmpresa | null = usuario && ehCargoDeMesa(usuario.role)
    ? (ehCodigoDeEmpresa(usuario.empresaOperada) ? usuario.empresaOperada : "amil")
    : null;
  return {
    empresa,
    recursos: empresa ? recursosDaEmpresa(empresa) : { temMiro: true, temBacklog: true, temPlanejador: true },
    /** As unidades que esta pessoa pode escolher: as da empresa, ou todas. */
    unidades: UNIDADES.filter(unidade => !empresa || unidade.empresa === empresa),
  };
}
