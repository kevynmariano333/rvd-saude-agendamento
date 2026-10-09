// Os dias em que um estoque não recebe carga.
//
// Inventário é o caso que origina isto: o estoque fecha para contar o que tem,
// e caminhão que chega nesse dia volta carregado. A informação existia no
// WhatsApp de quem sabia, e o fornecedor descobria na portaria.
//
// A parada é de uma unidade, e não do portal: o Hospital parar não impede
// nada na Maternidade, e um aviso que mandasse todo mundo parar faria o
// fornecedor da Maternidade segurar carga à toa.
//
// Cada parada entra aqui com a data, e sai sozinha quando passa — a tela só
// mostra o que ainda está por vir.

import { formatSaoPauloDateKey } from "./dateFilters";
import { apenasDigitos, comArtigo, daUnidade, UNIDADES, unidadePorCnpj } from "./recipients";

export type ParadaDoEstoque = {
  /** A unidade que para, pelo CNPJ do destinatário da nota. Só dígitos. */
  cnpj: string;
  /** Os dias fechados, em AAAA-MM-DD no fuso de São Paulo. */
  dias: string[];
  /** Por que o estoque parou, em duas palavras. */
  motivo: string;
};

/**
 * As paradas programadas.
 *
 * O dia vem como texto, e não como `new Date("2026-11-11")`: essa forma é lida
 * como meia-noite em UTC, que no Brasil ainda é o dia 10 — o estoque fecharia
 * um dia antes do combinado.
 */
export const PARADAS_DO_ESTOQUE: ParadaDoEstoque[] = [
  {
    cnpj: "06033403000113",
    dias: ["2026-11-11", "2026-11-12", "2026-11-13"],
    motivo: "Inventário no estoque",
  },
];

/** O nome da unidade que parou, para a frase do aviso. */
export function unidadeDaParada(parada: ParadaDoEstoque): string {
  return unidadePorCnpj(parada.cnpj)?.nome ?? "unidade";
}

/** A parada ainda está por vir (ou é hoje)? */
export function paradaAindaVale(parada: ParadaDoEstoque, agora: Date = new Date()): boolean {
  const hoje = formatSaoPauloDateKey(agora);
  return parada.dias.some(dia => dia >= hoje);
}

/** As paradas que ainda interessam a alguém, da mais próxima para a mais longe. */
export function paradasQueVemAi(agora: Date = new Date()): ParadaDoEstoque[] {
  return PARADAS_DO_ESTOQUE.filter(parada => paradaAindaVale(parada, agora)).sort((a, b) => (a.dias[0] ?? "").localeCompare(b.dias[0] ?? ""));
}

/** A parada de uma unidade que ainda está por vir, se houver. */
export function paradaDaUnidade(cnpj: string | null | undefined, agora: Date = new Date()): ParadaDoEstoque | null {
  const digitos = apenasDigitos(cnpj ?? "");
  if (!digitos) return null;
  return paradasQueVemAi(agora).find(parada => parada.cnpj === digitos) ?? null;
}

/**
 * Este dia está fechado para esta unidade?
 *
 * Compara pelo dia em São Paulo, e não pelo instante: o fornecedor que pede
 * "dia 11 às 8h" e o que pede "dia 11 às 18h" esbarram no mesmo inventário.
 *
 * Sem CNPJ não há parada: a nota que não diz para onde vai não pode ser
 * barrada por causa de uma unidade que talvez nem seja a dela.
 */
export function paradaNoDia(cnpj: string | null | undefined, quando: Date | string | null | undefined): ParadaDoEstoque | null {
  const digitos = apenasDigitos(cnpj ?? "");
  if (!digitos || !quando) return null;
  const data = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(data.getTime())) return null;
  const dia = formatSaoPauloDateKey(data);
  return PARADAS_DO_ESTOQUE.find(parada => parada.cnpj === digitos && parada.dias.includes(dia)) ?? null;
}

/** "11, 12 e 13 de novembro" — como a data é dita em voz alta. */
export function diasPorExtenso(parada: ParadaDoEstoque): string {
  const numeros = parada.dias.map(dia => String(Number(dia.slice(8, 10))));
  const mes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(
    new Date(`${parada.dias[0]}T12:00:00.000-03:00`),
  );
  const lista = numeros.length > 1 ? `${numeros.slice(0, -1).join(", ")} e ${numeros[numeros.length - 1]}` : numeros[0];
  return `${lista} de ${mes}`;
}

/**
 * O recado que o fornecedor lê, pronto.
 *
 * Diz a unidade, os dias e o que fazer — "o estoque está fechado" sem a frase
 * seguinte só gera uma ligação para o balcão perguntando o que fazer com a
 * carga.
 */
export function avisoDaParada(parada: ParadaDoEstoque): string {
  const unidade = unidadePorCnpj(parada.cnpj);
  const dela = unidade ? daUnidade(unidade) : "da unidade";
  // Quem continua recebendo sai da lista de unidades, e não escrito à mão: no
  // dia em que entrar uma terceira unidade, o aviso já a inclui.
  const seguem = UNIDADES.filter(outra => outra.cnpj !== parada.cnpj);
  const quemRecebe = seguem.length
    ? ` ${seguem.map(comArtigo).join(" e ")} recebe${seguem.length > 1 ? "m" : ""} normalmente.`
    : "";
  const frase = `${parada.motivo} ${dela} em ${diasPorExtenso(parada)}: nesses dias o estoque não recebe carga. Agende a entrega ${dela} para antes ou depois.${quemRecebe}`;
  // "A Maternidade recebe", e não "a Maternidade recebe": a unidade abre uma
  // oração nova, e o artigo entra na frase em minúscula.
  return frase.replace(/\. (o|a) /g, (_todo, artigo: string) => `. ${artigo.toUpperCase()} `);
}

/** A recusa que o servidor devolve, na mesma frase que a tela já mostrou. */
export function motivoDaRecusa(parada: ParadaDoEstoque, quando: Date): string {
  const unidade = unidadePorCnpj(parada.cnpj);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(quando);
  const nomeada = unidade ? comArtigo(unidade) : "a unidade";
  // O motivo entra no meio da frase, e por isso em minúscula: dizê-lo duas
  // vezes, uma como título e outra como explicação, só dobra o tamanho do erro.
  const motivo = parada.motivo.charAt(0).toLowerCase() + parada.motivo.slice(1);
  const frase = `${nomeada} não recebe carga em ${dia}: ${motivo} nos dias ${diasPorExtenso(parada)}. Escolha uma data antes ou depois.`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}
