// Tratativa de um backlog.
//
// Quando o recebimento não fecha — divergência de volume, valor, item — a nota
// não é concluída: vai para o backlog e passa a ser trabalho do planejamento,
// que resolve no SAP e no HIS e registra aqui o que fez. Reagendar não resolve
// nada: a carga já chegou, o que falta é acertar o lançamento.
//
// As regras ficam aqui para valerem iguais nos dois lados: a tela avisa na hora,
// e o servidor é quem decide.

import { MIRO_DIGITS, normalizeMiroNumber } from "./miro";

export type CamposDaTratativa = {
  /** Obrigatório: é o lançamento que fecha a nota no SAP. */
  miroNumber: string;
  quotationNumber?: string;
  memorizedOrder?: string;
  hisEntryDocument?: string;
  hisExitDocument?: string;
};

export type TratativaValidada = {
  miroNumber: string;
  quotationNumber: string | null;
  memorizedOrder: string | null;
  hisEntryDocument: string | null;
  hisExitDocument: string | null;
};

/** Limite das colunas dos documentos auxiliares. */
export const CAMPO_MAX = 60;

export const ERRO_MIRO = `Informe o número MIRO com exatamente ${MIRO_DIGITS} dígitos.`;

/** Um documento auxiliar: espaço colapsado, vazio vira ausente. */
export function normalizarDocumento(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const limpo = bruto.replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  return limpo.slice(0, CAMPO_MAX);
}

/**
 * Devolve os campos prontos para gravar, ou a mensagem do que impede.
 *
 * Só o MIRO é exigido. Os outros quatro documentos dependem do caminho que a
 * divergência tomou — nem toda tratativa gera cotação nova ou movimento no HIS —,
 * e exigir todos faria a pessoa inventar número para conseguir fechar a tela.
 */
export function validarTratativa(campos: CamposDaTratativa): { ok: true; dados: TratativaValidada } | { ok: false; erro: string } {
  const miroNumber = normalizeMiroNumber(campos.miroNumber);
  if (!miroNumber) return { ok: false, erro: ERRO_MIRO };
  return {
    ok: true,
    dados: {
      miroNumber,
      quotationNumber: normalizarDocumento(campos.quotationNumber),
      memorizedOrder: normalizarDocumento(campos.memorizedOrder),
      hisEntryDocument: normalizarDocumento(campos.hisEntryDocument),
      hisExitDocument: normalizarDocumento(campos.hisExitDocument),
    },
  };
}

/** O que fica no histórico da nota quando a tratativa fecha. */
export function resumoDaTratativa(dados: TratativaValidada): string {
  const partes = [`MIRO ${dados.miroNumber}`];
  if (dados.quotationNumber) partes.push(`cotação ${dados.quotationNumber}`);
  if (dados.memorizedOrder) partes.push(`pedido memorizado ${dados.memorizedOrder}`);
  if (dados.hisEntryDocument) partes.push(`entrada HIS ${dados.hisEntryDocument}`);
  if (dados.hisExitDocument) partes.push(`saída HIS ${dados.hisExitDocument}`);
  return `Backlog tratado: ${partes.join(", ")}.`;
}
