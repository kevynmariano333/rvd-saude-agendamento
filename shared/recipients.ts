// As unidades da RVD Saúde que recebem carga.
//
// A nota traz o CNPJ do destinatário, e é ele que identifica a unidade sem
// ambiguidade — mas ninguém na operação reconhece uma unidade por catorze
// dígitos. Na tela vale a sigla que o pessoal usa; o CNPJ continua sendo o que
// o sistema guarda, filtra e exporta.
//
// Uma unidade nova entra aqui. Enquanto não entrar, o CNPJ aparece formatado,
// que é pior de ler mas nunca é mentira.

export type Unidade = {
  /** Só dígitos, como o XML e o banco guardam. */
  cnpj: string;
  sigla: string;
  nome: string;
};

export const UNIDADES: Unidade[] = [
  { cnpj: "06033403000113", sigla: "HSH", nome: "Hospital" },
  { cnpj: "43293604002120", sigla: "MSH", nome: "Maternidade" },
];

export function apenasDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

export function formatarCnpj(valor: string | null | undefined): string {
  const digitos = apenasDigitos(valor);
  if (digitos.length !== 14) return valor?.trim() || "—";
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function unidadePorCnpj(cnpj: string | null | undefined): Unidade | null {
  const digitos = apenasDigitos(cnpj);
  if (digitos.length !== 14) return null;
  return UNIDADES.find(unidade => unidade.cnpj === digitos) ?? null;
}

/**
 * Como o destinatário aparece numa linha da tabela: a sigla em cima e o que ela
 * significa embaixo. Um CNPJ que não é de unidade conhecida mostra o número
 * formatado, e não um nome inventado.
 */
export function rotuloDoDestinatario(cnpj: string | null | undefined): { titulo: string; detalhe: string } {
  const unidade = unidadePorCnpj(cnpj);
  if (unidade) return { titulo: unidade.sigla, detalhe: unidade.nome };
  const digitos = apenasDigitos(cnpj);
  if (!digitos) return { titulo: "—", detalhe: "Não informado" };
  return { titulo: formatarCnpj(cnpj), detalhe: "Destinatário" };
}

/**
 * O que mandar ao servidor quando alguém digita no filtro de destinatário.
 *
 * A tela mostra a sigla, então é a sigla que a pessoa digita — e o banco só
 * guarda o CNPJ. Um texto que não é sigla de unidade segue como veio, para
 * continuar valendo a busca por parte do número.
 */
export function filtroDeDestinatario(texto: string): string {
  const busca = texto.trim().toLowerCase();
  if (!busca) return "";
  const unidade = UNIDADES.find(
    item => item.sigla.toLowerCase() === busca || item.nome.toLowerCase() === busca,
  );
  return unidade ? unidade.cnpj : texto;
}
