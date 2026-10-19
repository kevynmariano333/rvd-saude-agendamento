// As unidades da RVD Saúde que recebem carga.
//
// A nota traz o CNPJ do destinatário, e é ele que identifica a unidade sem
// ambiguidade — mas ninguém na operação reconhece uma unidade por catorze
// dígitos. Na tela vale a sigla que o pessoal usa; o CNPJ continua sendo o que
// o sistema guarda, filtra e exporta.
//
// Unidade nova entra pela tela de cadastro, e o servidor manda a lista para cá
// na subida. A lista escrita abaixo é o ponto de partida — o que o banco tinha
// no dia em que o cadastro passou a existir — e vale enquanto o banco não
// responder. Enquanto uma unidade não estiver na lista, o CNPJ dela aparece
// formatado, que é pior de ler mas nunca é mentira.

export type Unidade = {
  /** Só dígitos, como o XML e o banco guardam. */
  cnpj: string;
  sigla: string;
  nome: string;
  /** Como o nome cabe na coluna da tabela, que é estreita. */
  curto: string;
  /**
   * O artigo do nome: "o" Hospital, "a" Maternidade.
   *
   * Sem ele, toda frase que cita a unidade precisa ser escrita de um jeito que
   * fuja do artigo — e a que não fugiu sai "entrega do Maternidade".
   */
  artigo: "o" | "a";
  /** O cliente dono da unidade. As unidades de um grupo são filtradas juntas. */
  grupo: string;
  /** A razão social, que é o nome que aparece na nota. */
  razaoSocial: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
};

const SANTA_HELENA = "SANTA HELENA ASSISTÊNCIA MÉDICA S/A";

const UNIDADES_PADRAO: Unidade[] = [
  { cnpj: "06033403000113", sigla: "HSH", nome: "Hospital", curto: "HOSPITAL", artigo: "o", grupo: "Amil", razaoSocial: "HOSPITAL SANTA HELENA S.A", endereco: "Rua Manoel Vaz, 59", bairro: "Vila Alzira", cidade: "Santo André", cep: "09015-410" },
  { cnpj: "43293604002120", sigla: "MSH", nome: "Maternidade", curto: "MATERN.", artigo: "a", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Av. Armando Ítalo Setti, 331", bairro: "Baeta Neves", cidade: "São Bernardo do Campo", cep: "09760-280" },
  { cnpj: "43293604000186", sigla: "CM 19", nome: "Centro Médico 19 de São Bernardo do Campo", curto: "S. BERNARDO", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua Bering, 114", bairro: "Jardim do Mar", cidade: "São Bernardo do Campo", cep: "09750-510" },
  { cnpj: "43293604000429", sigla: "CM 13", nome: "Centro Médico 13 de São Bernardo do Campo", curto: "S. BERNARDO", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Avenida Lucas Nogueira Garcez, 505", bairro: "Jardim do Mar", cidade: "São Bernardo do Campo", cep: "09750-660" },
  { cnpj: "43293604002200", sigla: "CM 29", nome: "Centro Médico 29 de São Bernardo do Campo", curto: "S. BERNARDO", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua João de Azevedo Marques, 190/202", bairro: "Jardim Três Marias", cidade: "São Bernardo do Campo", cep: "09750-030" },
  { cnpj: "43293604002634", sigla: "CM 34", nome: "Centro Médico 34 de São Bernardo do Campo", curto: "S. BERNARDO", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua Luiz Ferreira da Silva, 163", bairro: "Anchieta", cidade: "São Bernardo do Campo", cep: "09732-610" },
  { cnpj: "43293604002715", sigla: "CM 38", nome: "Centro Médico 38 de São Bernardo do Campo", curto: "S. BERNARDO", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua João Azevedo Marques, 237", bairro: "Jardim Três Marias", cidade: "São Bernardo do Campo", cep: "09750-030" },
  { cnpj: "43293604003282", sigla: "NACNE", nome: "Nacne de São Bernardo do Campo", curto: "NACNE SBC", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua Thales dos Santos Freire, 277", bairro: "Baeta Neves", cidade: "São Bernardo do Campo", cep: "09751-020" },
  { cnpj: "43293604001310", sigla: "CM 12", nome: "Centro Médico 12 de Santo André", curto: "SANTO ANDRÉ", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Av. Dom Pedro II, 1330", bairro: "Jardim", cidade: "Santo André", cep: "09090-401" },
  { cnpj: "43293604002391", sigla: "CM 31", nome: "Centro Médico 31 de Santo André", curto: "SANTO ANDRÉ", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua Carijós, 916/920", bairro: "Vila Alzira", cidade: "Santo André", cep: "09180-000" },
  { cnpj: "43293604000933", sigla: "CM 10", nome: "Centro Médico 10 de Mauá", curto: "MAUÁ", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua Luis Mariani, 86", bairro: "Centro", cidade: "Mauá", cep: "09390-050" },
  { cnpj: "43293604002553", sigla: "CM 37", nome: "Centro Médico 37 de Mauá", curto: "GUAPITUBA", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Av. Capitão João, 2569", bairro: "Jardim Guapituba", cidade: "Mauá", cep: "09360-120" },
  { cnpj: "43293604000348", sigla: "CM 03", nome: "Centro Médico 03 de Diadema", curto: "DIADEMA", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua Manoel da Nóbrega, 605", bairro: "Centro", cidade: "Diadema", cep: "09910-720" },
  { cnpj: "43293604001077", sigla: "CM 11", nome: "Centro Médico 11 de Ribeirão Pires", curto: "RIB. PIRES", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Av. Francisco Monteiro, 239", bairro: "Centro", cidade: "Ribeirão Pires", cep: "09400-310" },
  { cnpj: "43293604001158", sigla: "CM 08", nome: "Centro Médico 08 de São Caetano do Sul", curto: "S. CAETANO", artigo: "o", grupo: "Amil", razaoSocial: SANTA_HELENA, endereco: "Rua Peri, 317", bairro: "Osvaldo Cruz", cidade: "São Caetano do Sul", cep: "09540-290" },
];

/**
 * As unidades em uso agora.
 *
 * É a mesma array do começo ao fim da vida do processo: trocar o conteúdo no
 * lugar, e não a variável, é o que faz quem importou `UNIDADES` enxergar o
 * cadastro novo sem ter que importar de outro jeito. Em compensação, nada que
 * derive dela pode ser calculado uma vez só na carga do arquivo — quem precisa
 * da lista a lê na hora.
 */
export const UNIDADES: Unidade[] = [...UNIDADES_PADRAO];

/** Troca a lista em uso pela que veio do banco. */
export function definirUnidades(unidades: Unidade[]): void {
  UNIDADES.splice(0, UNIDADES.length, ...unidades);
}

/** A lista de fábrica, para semear o banco na primeira subida. */
export function unidadesPadrao(): Unidade[] {
  return UNIDADES_PADRAO.map(unidade => ({ ...unidade }));
}

/** A nota que veio sem destinatário reconhecido. É um resto, não uma unidade. */
export const OUTROS = "Outros";

/** As unidades que não são o hospital nem a maternidade, somadas. */
export const CENTROS_MEDICOS = "Centros Médicos";

/**
 * As séries em que as unidades se juntam num gráfico.
 *
 * Uma série por unidade daria quinze faixas numa barra de vinte e seis pixels,
 * que não se lê nem com o mouse em cima. O gráfico separa o que a operação
 * separa — hospital, maternidade e os centros médicos juntos — e o número de
 * cada unidade continua aparecendo fora do gráfico, que é onde cabe.
 */
export const SERIES_DO_GRAFICO = ["HSH", "MSH", CENTROS_MEDICOS, OUTROS];

export function serieDaSigla(sigla: string): string {
  return SERIES_DO_GRAFICO.includes(sigla) ? sigla : CENTROS_MEDICOS;
}

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

/** "o Hospital", "a Maternidade" — a unidade dentro de uma frase. */
export function comArtigo(unidade: Unidade): string {
  return `${unidade.artigo} ${unidade.nome}`;
}

/** "do Hospital", "da Maternidade" — a unidade depois de "de". */
export function daUnidade(unidade: Unidade): string {
  return `${unidade.artigo === "o" ? "do" : "da"} ${unidade.nome}`;
}

/** "no Hospital", "na Maternidade" — a unidade depois de "em". */
export function naUnidade(unidade: Unidade): string {
  return `${unidade.artigo === "o" ? "no" : "na"} ${unidade.nome}`;
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
