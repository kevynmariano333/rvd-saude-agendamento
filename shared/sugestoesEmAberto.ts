import { formatSaoPauloDateKey } from "./dateFilters";
import { empresaDoCnpj } from "./empresas";
import { horaEmSaoPaulo } from "./horariosDaAgenda";

/** Uma sugestão que ainda espera resposta, com o que é preciso para comparar. */
export type SugestaoEmAberto = {
  supplierId: number;
  suggestedFor: Date | string;
  recipientCnpj: string | null;
};

/**
 * Esse horário já foi sugerido, e ainda espera resposta, por outro fornecedor
 * para a mesma empresa?
 *
 * O primeiro que sugere fica com o horário. O outro fornecedor, na mesma
 * empresa, não pode sugerir a mesma data e hora, mas pode sugerir outra. Quem
 * sugeriu de novo ele mesmo não conta como outro.
 */
export function horarioSugeridoPorOutro(
  quando: Date,
  quem: { supplierId: number; recipientCnpj: string | null | undefined },
  emAberto: SugestaoEmAberto[],
): boolean {
  const dia = formatSaoPauloDateKey(quando);
  const hora = horaEmSaoPaulo(quando);
  const empresa = empresaDoCnpj(quem.recipientCnpj);
  return emAberto.some(
    sugestao =>
      sugestao.supplierId !== quem.supplierId &&
      empresaDoCnpj(sugestao.recipientCnpj) === empresa &&
      formatSaoPauloDateKey(new Date(sugestao.suggestedFor)) === dia &&
      horaEmSaoPaulo(sugestao.suggestedFor) === hora,
  );
}
