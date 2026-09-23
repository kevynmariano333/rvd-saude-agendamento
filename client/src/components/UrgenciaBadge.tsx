import { notaEhUrgente } from "@shared/purchaseOrders";
import { AlertTriangle } from "lucide-react";

/**
 * Marca de urgência da nota.
 *
 * Não existe campo de "urgente" para alguém preencher: a urgência está no
 * próprio número do pedido de compra, na faixa que o ERP reserva para isso.
 * Deduzir dali significa que nenhuma nota urgente passa despercebida por
 * esquecimento, e nenhuma nota comum é marcada por engano.
 */
export default function UrgenciaBadge({ purchaseOrder, className = "" }: { purchaseOrder: string | null; className?: string }) {
  if (!notaEhUrgente(purchaseOrder)) return null;
  return (
    <span
      title="Pedido de compra urgente"
      className={`rvd-piscando inline-flex items-center gap-1 rounded-md bg-state-stop px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ${className}`}
    >
      <AlertTriangle className="size-3" />
      Urgente
    </span>
  );
}
