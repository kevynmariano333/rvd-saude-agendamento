import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type NotaComPedido = { id: number; invoiceNumber?: string | null; purchaseOrder?: string | null };

/**
 * Corrigir o pedido de compra de uma nota que ainda não foi agendada.
 *
 * Digitar o pedido errado no envio é o erro mais comum do portal, e até aqui
 * tinha um conserto só: ligar para a doca e pedir para alguém de dentro
 * arrumar — com a nota parada no meio disso.
 *
 * Só enquanto a nota está pendente. Depois que o operador agenda, o pedido é o
 * que a doca vai conferir contra a carga, e trocá-lo sem a mesa saber mudaria
 * a conferência debaixo de quem recebe.
 */
export default function CorrigirPedidoDialog({
  nota,
  aberto,
  onFechar,
  onCorrigido,
}: {
  nota: NotaComPedido | null;
  aberto: boolean;
  onFechar: () => void;
  onCorrigido?: () => void;
}) {
  const [pedidos, setPedidos] = useState<string[]>([""]);

  useEffect(() => {
    if (!aberto) return;
    const atuais = (nota?.purchaseOrder ?? "").split(",").map(pedido => pedido.trim()).filter(Boolean);
    setPedidos(atuais.length ? atuais : [""]);
  }, [aberto, nota]);

  const corrigir = trpc.appointments.definirPedido.useMutation({
    onSuccess: () => {
      toast.success("Pedido corrigido. O operador vai ver o número novo.");
      onFechar();
      onCorrigido?.();
    },
    onError: erro => toast.error(erro.message),
  });

  const limpos = pedidos.map(pedido => pedido.replace(/\D/g, "")).filter(Boolean);
  const todosCompletos = limpos.length > 0 && limpos.every(pedido => pedido.length === 10);

  return (
    <Dialog open={aberto} onOpenChange={valor => !valor && onFechar()}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:!max-w-lg">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><ClipboardList className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Corrigir o pedido de compra</DialogTitle>
              <DialogDescription className="mt-0.5 text-[13px] font-bold text-rvd-plum">
                {nota ? `Nota ${nota.invoiceNumber || "sem número"}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">
          <p className="text-[13px] leading-5 text-ink-soft">
            Dá para corrigir enquanto o operador não marcou a data. Depois disso o pedido é o que a doca confere contra a
            carga — se precisar mudar mais tarde, fale pela conversa da nota.
          </p>
          {nota?.purchaseOrder && (
            <p className="mt-3 rounded-xl bg-canvas px-3.5 py-2.5 text-[12px] text-ink-soft">
              Hoje está como <strong className="text-ink">{nota.purchaseOrder}</strong>.
            </p>
          )}
          <div className="mt-4 space-y-2">
            {pedidos.map((pedido, indice) => (
              <div key={indice} className="flex items-center gap-2">
                <Input
                  value={pedido}
                  onChange={evento => setPedidos(atual => atual.map((valor, posicao) => (posicao === indice ? evento.target.value : valor)))}
                  maxLength={20}
                  inputMode="numeric"
                  placeholder="Ex.: 4504748409"
                  className="h-11 border-line bg-surface text-sm text-ink"
                />
                {pedidos.length > 1 && (
                  <button
                    type="button"
                    title="Remover este pedido"
                    onClick={() => setPedidos(atual => atual.filter((_, posicao) => posicao !== indice))}
                    className="rounded-lg p-2 text-ink-faint transition hover:bg-canvas hover:text-ink"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPedidos(atual => [...atual, ""])}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-canvas px-3 py-1.5 text-xs font-bold text-rvd-plum transition hover:bg-rvd-plum-pale"
          >
            <Plus className="size-3.5" />
            Outro pedido
          </button>
          <p className="mt-3 text-[11px] text-ink-faint">
            Dez dígitos cada um, como no SAP. Se a nota cobre mais de um pedido, use o "Outro pedido".
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onFechar} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button>
          <Button
            onClick={() => nota && corrigir.mutate({ appointmentId: nota.id, purchaseOrders: limpos })}
            disabled={corrigir.isPending || !todosCompletos}
            title={todosCompletos ? undefined : "Cada pedido tem dez dígitos"}
            className="h-11 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {corrigir.isPending ? "Corrigindo..." : "Corrigir o pedido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
