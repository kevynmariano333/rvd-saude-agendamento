// As empresas atendidas pela operação — e o que cada uma usa do portal.
//
// Até aqui o portal era de uma empresa só, a Amil, e tudo que existia valia
// para todo mundo. Com a RVD Saúde e a LLT Saúde entrando, duas coisas mudam
// ao mesmo tempo: quem enxerga o quê, e o que existe para cada uma.
//
// Quem enxerga: a nota da RVD não é assunto de quem trabalha para a Amil. Não
// é preferência de tela — é informação comercial de um cliente na mão de
// quem trabalha para outro.
//
// O que existe: MIRO é número do SAP da Amil, e backlog é a mesa que trata
// divergência de nota da Amil. Para a RVD e a LLT isso não existe, e mostrar
// um campo vazio chamado MIRO só ensina a operação a ignorar campo.
//
// A lista é fechada e mora aqui. Uma empresa nova entra nesta lista, e não
// espalhada por quinze telas.

import { UNIDADES, apenasDigitos } from "./recipients";

export type CodigoDaEmpresa = "amil" | "rvd" | "llt";

export type Empresa = {
  codigo: CodigoDaEmpresa;
  /** O nome como a operação fala dela. */
  nome: string;
  /** O número do SAP da Amil. Quem não é da Amil não tem. */
  temMiro: boolean;
  /** A mesa de divergências, com tratativa e motivo. */
  temBacklog: boolean;
  /** O planejamento que propõe datas antes do operador confirmar. */
  temPlanejador: boolean;
  /** A nota de serviço: registrada à mão, sem XML, para o que não vem como produto. */
  temNotaDeServico: boolean;
};

export const EMPRESAS: Empresa[] = [
  { codigo: "amil", nome: "Amil", temMiro: true, temBacklog: true, temPlanejador: true, temNotaDeServico: true },
  { codigo: "rvd", nome: "RVD Saúde", temMiro: false, temBacklog: false, temPlanejador: false, temNotaDeServico: false },
  { codigo: "llt", nome: "LLT Saúde", temMiro: false, temBacklog: false, temPlanejador: false, temNotaDeServico: false },
];

export function empresaPorCodigo(codigo: string | null | undefined): Empresa | null {
  if (!codigo) return null;
  return EMPRESAS.find(empresa => empresa.codigo === codigo) ?? null;
}

export function nomeDaEmpresa(codigo: string | null | undefined): string {
  return empresaPorCodigo(codigo)?.nome ?? "Todas as empresas";
}

export function ehCodigoDeEmpresa(valor: string | null | undefined): valor is CodigoDaEmpresa {
  return empresaPorCodigo(valor) !== null;
}

/**
 * O que esta empresa tem — ou o mais restrito, quando não se sabe qual é.
 *
 * Nota de CNPJ desconhecido cai aqui. Negar o MIRO e o backlog nela é a
 * resposta certa: na dúvida sobre de quem é a nota, não oferecer o que é de
 * uma empresa específica.
 */
export type RecursosDaEmpresa = Pick<Empresa, "temMiro" | "temBacklog" | "temPlanejador" | "temNotaDeServico">;

export function recursosDaEmpresa(codigo: string | null | undefined): RecursosDaEmpresa {
  const empresa = empresaPorCodigo(codigo);
  if (empresa) return { temMiro: empresa.temMiro, temBacklog: empresa.temBacklog, temPlanejador: empresa.temPlanejador, temNotaDeServico: empresa.temNotaDeServico };
  return { temMiro: false, temBacklog: false, temPlanejador: false, temNotaDeServico: false };
}

/** Os CNPJs de destinatário que pertencem a esta empresa. */
export function cnpjsDaEmpresa(codigo: CodigoDaEmpresa): string[] {
  return UNIDADES.filter(unidade => unidade.empresa === codigo).map(unidade => unidade.cnpj);
}

/**
 * De qual empresa é uma nota, pelo CNPJ de quem a recebe.
 *
 * CNPJ que não é de unidade nenhuma — nota antiga, XML sem destinatário —
 * volta como "amil", e não como desconhecido. O portal nasceu só com a Amil, e
 * todo o acervo de antes das outras empresas é dela: tratar o que não se
 * reconhece como "de ninguém" faria sumir da mesa da Amil o que ela sempre viu.
 * O corte que protege RVD e LLT é o inverso e mais estrito: só entra o CNPJ
 * que é de fato delas.
 */
export function empresaDoCnpj(cnpj: string | null | undefined): CodigoDaEmpresa {
  const digitos = apenasDigitos(cnpj);
  const unidade = UNIDADES.find(item => item.cnpj === digitos);
  return unidade?.empresa ?? "amil";
}

/**
 * As empresas que uma conta atende. Quase sempre é uma; há quem opere duas — a
 * mesma pessoa cuida da RVD e da LLT — e a conta guarda a lista.
 *
 * `null` é "sem corte": quem enxerga tudo. Lista vazia nunca existe: é sempre
 * pelo menos uma, e `[]` é recusado onde a lista nasce.
 */
export type EscopoDeEmpresas = CodigoDaEmpresa[] | null;

/**
 * Lê o que a conta guarda — "rvd,llt" — como lista, na ordem do cadastro e sem
 * repetir. Código que não existe é descartado, e o que sobra vazio é Amil: o
 * portal nasceu só com ela, e um valor ilegível não pode abrir as outras duas.
 */
export function lerEmpresas(guardado: string | null | undefined): CodigoDaEmpresa[] {
  const pedidas = new Set((guardado ?? "").split(",").map(parte => parte.trim()));
  const validas = EMPRESAS.map(empresa => empresa.codigo).filter(codigo => pedidas.has(codigo));
  return validas.length ? validas : ["amil"];
}

/** O que gravar na conta: sempre na ordem do cadastro, para o mesmo conjunto dar o mesmo texto. */
export function gravarEmpresas(empresas: readonly string[]): string {
  const pedidas = new Set(empresas);
  const validas = EMPRESAS.map(empresa => empresa.codigo).filter(codigo => pedidas.has(codigo));
  return (validas.length ? validas : ["amil"]).join(",");
}

/**
 * A empresa dona da nota está dentro do que este corte permite?
 *
 * `escopo` null é "sem corte": quem enxerga tudo.
 */
export function notaNoEscopo(escopo: EscopoDeEmpresas, cnpjDoDestinatario: string | null | undefined): boolean {
  if (!escopo) return true;
  return escopo.includes(empresaDoCnpj(cnpjDoDestinatario));
}

/**
 * O que quem atende estas empresas tem: o que qualquer uma delas tem. É para o
 * menu e as abas — quem cuida da Amil e da RVD precisa do Backlog, mesmo que
 * as notas da RVD não passem por ele. A decisão de cada nota continua sendo da
 * empresa dela (`recursosDaNota`).
 */
export function recursosDasEmpresas(empresas: EscopoDeEmpresas): RecursosDaEmpresa {
  if (!empresas) return { temMiro: true, temBacklog: true, temPlanejador: true, temNotaDeServico: true };
  const cada = empresas.map(recursosDaEmpresa);
  return {
    temMiro: cada.some(item => item.temMiro),
    temBacklog: cada.some(item => item.temBacklog),
    temPlanejador: cada.some(item => item.temPlanejador),
    temNotaDeServico: cada.some(item => item.temNotaDeServico),
  };
}

/**
 * O que a nota dessa empresa tem. O MIRO e o backlog são da Amil; o resto das
 * empresas fecha a nota sem eles.
 */
export function recursosDaNota(cnpjDoDestinatario: string | null | undefined) {
  return recursosDaEmpresa(empresaDoCnpj(cnpjDoDestinatario));
}

/** Os cargos que trabalham dentro de uma empresa, e por isso têm uma. */
export const CARGOS_DE_MESA = ["operator", "planejador", "planejador_leitura"] as const;

export function ehCargoDeMesa(cargo: string): boolean {
  return (CARGOS_DE_MESA as readonly string[]).includes(cargo);
}

/**
 * O cargo existe nesta empresa?
 *
 * O planejador, e o perfil de consulta que o acompanha, são da Amil: é dela a
 * mesa que propõe datas e trata divergência. Para a RVD e a LLT só há operador
 * — por enquanto. Quando houver planejamento nelas, é virar `temPlanejador`
 * para verdadeiro na lista de empresas, e esta regra acompanha.
 */
export function cargoExisteNaEmpresa(cargo: string, empresa: string | null | undefined): boolean {
  if (cargo === "planejador" || cargo === "planejador_leitura") return recursosDaEmpresa(empresa).temPlanejador;
  return true;
}

/** O cargo existe em todas as empresas desta conta? Uma que não tem basta para recusar. */
export function cargoExisteNasEmpresas(cargo: string, empresas: readonly string[]): boolean {
  return empresas.every(empresa => cargoExisteNaEmpresa(cargo, empresa));
}
