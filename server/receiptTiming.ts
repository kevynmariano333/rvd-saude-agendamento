/**
 * O recebimento avulso é datado pelo instante de registro do XML no sistema,
 * preservando a emissão da NF apenas como informação fiscal.
 */
export function getUnscheduledReceiptRegisteredAt(now: Date = new Date()) {
  return new Date(now.getTime());
}
