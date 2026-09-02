/**
 * Quando o fornecedor entra na chegada, e quando ele não faz sentido.
 *
 * No recebimento alguém entrega, e esse nome é o que responde depois "de quem
 * era essa carga". Na coleta é a RVD que vai buscar, e a classificação com a
 * categoria já dizem de onde — Maternidade, Hospital, a transportadora da RVD —
 * então o campo sai da tela em vez de pedir ao porteiro o que já está nela.
 *
 * Vive em shared/ porque a tela e o servidor precisam concordar: um campo
 * escondido de um lado e obrigatório do outro trava a Portaria no portão.
 */
export type SupplierNameRule = "obrigatorio" | "oculto";

export function supplierNameRule(serviceType: "coleta" | "recebimento"): SupplierNameRule {
  return serviceType === "recebimento" ? "obrigatorio" : "oculto";
}
