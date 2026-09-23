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
  /** Como o nome cabe na coluna da tabela, que é estreita. */
  curto: string;
  /** O cliente dono da unidade. As unidades de um grupo são filtradas juntas. */
  grupo: string;
};

export const UNIDADES: Unidade[] = [
  { cnpj: "06033403000113", sigla: "HSH", nome: "Hospital", curto: "HOSPITAL", grupo: "Amil" },
  { cnpj: "43293604002120", sigla: "MSH", nome: "Maternidade", curto: "MATERN.", grupo: "Amil" },
];

/** Os grupos na ordem em que apareceram, cada um com as suas unidades. */
export function gruposDeUnidades(): { grupo: string; unidades: Unidade[] }[] {
  const porGrupo: { grupo: string; unidades: Unidade[] }[] = [];
  for (const unidade of UNIDADES) {
    const existente = porGrupo.find(item => item.grupo === unidade.grupo);
    if (existente) existente.unidades.push(unidade);
    else porGrupo.push({ grupo: unidade.grupo, unidades: [unidade] });
  }
  return porGrupo;
}

/** O valor do seletor quando ninguém escolheu destinatário nenhum. */
export const DESTINATARIO_TODOS = "todos";

/**
 * O que o seletor de destinatário guarda.
 *
 * Um valor é "todos", "grupo:<nome>" ou "cnpj:<dígitos>". Guardar o grupo pelo
 * nome, e não pela lista de CNPJs, faz a escolha continuar valendo no dia em
 * que uma unidade nova entrar no grupo.
 */
export function valorDoGrupo(grupo: string): string {
  return `grupo:${grupo}`;
}

export function valorDaUnidade(cnpj: string): string {
  return `cnpj:${apenasDigitos(cnpj)}`;
}

/**
 * Os CNPJs que uma escolha do seletor representa.
 *
 * "todos" não vira lista nenhuma — vira ausência de filtro, que é diferente de
 * uma lista vazia (essa não casaria com nada).
 */
export function cnpjsDoDestinatario(valor: string | null | undefined): string[] | undefined {
  if (!valor || valor === DESTINATARIO_TODOS) return undefined;
  if (valor.startsWith("grupo:")) {
    const grupo = valor.slice("grupo:".length);
    const unidades = UNIDADES.filter(unidade => unidade.grupo === grupo);
    return unidades.length ? unidades.map(unidade => unidade.cnpj) : undefined;
  }
  if (valor.startsWith("cnpj:")) {
    const digitos = apenasDigitos(valor.slice("cnpj:".length));
    return digitos ? [digitos] : undefined;
  }
  // Um filtro antigo, digitado à mão, continua valendo como estava.
  const texto = filtroDeDestinatario(valor);
  return texto ? [texto] : undefined;
}

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

export type RotuloDestinatario = {
  /** Primeira linha da célula. */
  principal: string;
  /** Segunda linha. */
  secundaria: string;
  /** Falso quando é um CNPJ que não conhecemos: aí a célula não ganha destaque. */
  unidade: boolean;
  /** O CNPJ por extenso, que fica no tooltip. */
  tooltip: string;
};

/**
 * Como o destinatário aparece numa linha da tabela: a sigla e o tipo da unidade,
 * em duas linhas, com o peso de quem é lido de relance — é por ele que a
 * operação separa o que é do hospital do que é da maternidade.
 *
 * Um CNPJ que não é de unidade conhecida mostra o número formatado, sem
 * destaque e sem nome inventado.
 */
export function rotuloDoDestinatario(cnpj: string | null | undefined): RotuloDestinatario {
  const unidade = unidadePorCnpj(cnpj);
  if (unidade) {
    return { principal: `${unidade.sigla} -`, secundaria: unidade.curto, unidade: true, tooltip: `${unidade.nome} · ${formatarCnpj(unidade.cnpj)}` };
  }
  const digitos = apenasDigitos(cnpj);
  if (!digitos) return { principal: "—", secundaria: "Não informado", unidade: false, tooltip: "Destinatário não informado na nota" };
  return { principal: formatarCnpj(cnpj), secundaria: "Destinatário", unidade: false, tooltip: formatarCnpj(cnpj) };
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
