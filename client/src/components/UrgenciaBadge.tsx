import { notaEhUrgente } from "@shared/purchaseOrders";
import { AlertTriangle } from "lucide-react";

/**
 * Marca de urgência da nota, de qualquer uma das duas origens.
 *
 * A primeira está no próprio número do pedido: a faixa que o ERP reserva para
 * o que não pode esperar. Deduzir dali significa que nenhuma nota urgente passa
 * despercebida por esquecimento, e nenhuma nota comum é marcada por engano.
 *
 * A segunda é o planejamento marcando à mão, porque existe a entrega que o ERP
 * não sabe que virou urgente — o estoque acabou, a cirurgia foi antecipada. O
 * aviso é o mesmo; o que muda é o texto ao passar o mouse, que diz de onde a
 * urgência veio e, quando foi marcada à mão, por quê.
 */
export default function UrgenciaBadge({ purchaseOrder, marcadaEm = null, motivo = null, className = "" }: { purchaseOrder: string | null; marcadaEm?: Date | string | null; motivo?: string | null; className?: string }) {
  const peloPedido = notaEhUrgente(purchaseOrder);
  if (!peloPedido && !marcadaEm) return null;
  const titulo = marcadaEm
    ? `Marcada como urgente pelo planejamento${motivo ? `: ${motivo}` : ""}`
    : "Pedido de compra urgente";
  return (
    <span
      title={titulo}
      className={`rvd-piscando inline-flex items-center gap-1 rounded-md bg-state-stop px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${className}`}
    >
      <AlertTriangle className="size-3" />
      Urgente
    </span>
  );
}
