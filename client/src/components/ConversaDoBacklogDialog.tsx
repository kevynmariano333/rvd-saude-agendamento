import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Lock, MessagesSquare, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const quando = (valor: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));

/**
 * A conversa da tratativa, na própria nota travada.
 *
 * O que destrava uma nota de backlog é conversa — "a cotação saiu?", "o pedido
 * foi memorizado com que número?", "falei com o fornecedor, ele reemite" —, e
 * isso ia por WhatsApp e por corredor. Meses depois ninguém sabe dizer como
 * aquela nota foi resolvida, e a mesma divergência volta do zero.
 *
 * É a mesma tabela das anotações internas da nota: o fornecedor nunca lê. Isso
 * é o que permite escrever aqui o que não se escreve na conversa com ele —
 * divergência de preço, documento do HIS, número de SAP.
 */
export default function ConversaDoBacklogDialog({
  appointmentId,
  invoiceNumber,
  open,
  onOpenChange,
}: {
  appointmentId: number | null;
  invoiceNumber: string | null;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const conversa = trpc.internalNotes.list.useQuery(
    { appointmentId: appointmentId ?? 0 },
    { enabled: open && Boolean(appointmentId) },
  );
  const falas = conversa.data ?? [];

  // Abrir a conversa é a leitura. O aviso daquela nota sai do sino assim que
  // ela aparece na tela — era isso que faltava para o número querer dizer
  // alguma coisa.
  const marcarLida = trpc.internalNotes.marcarLida.useMutation({
    onSuccess: () => { void utils.appointments.conversaDoBacklog.invalidate(); },
  });
  const marcar = marcarLida.mutate;
  useEffect(() => {
    if (!open || !appointmentId) return;
    marcar({ appointmentId });
  }, [open, appointmentId, marcar, falas.length]);

  // A conversa abre no fim: o que interessa é a última fala, não a primeira.
  useEffect(() => {
    if (!open) return;
    fim.current?.scrollIntoView({ block: "end" });
  }, [open, falas.length]);

  const escrever = trpc.internalNotes.create.useMutation({
    onSuccess: () => {
      setTexto("");
      void utils.internalNotes.list.invalidate({ appointmentId: appointmentId ?? 0 });
      void utils.appointments.conversaDoBacklog.invalidate();
    },
    onError: erro => toast.error(erro.message),
  });

  const enviar = () => {
    const corpo = texto.trim();
    if (!corpo || !appointmentId) return;
    escrever.mutate({ appointmentId, body: corpo });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] !max-w-2xl rounded-[1.75rem] !border !border-line !bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-line px-6 py-5">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-extrabold text-ink">
            <MessagesSquare className="size-5 text-rvd-plum" />
            Conversa da tratativa
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px] text-rvd-plum">
            NF {invoiceNumber || "sem número"}
          </DialogDescription>
          <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-rvd-plum-pale px-2.5 py-1 text-[11px] font-bold text-rvd-plum">
            <Lock className="size-3" />
            Interna — o fornecedor não vê esta conversa
          </p>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto px-6 py-5">
          {conversa.isLoading && <p className="text-sm font-bold text-rvd-plum">Carregando...</p>}
          {!conversa.isLoading && !falas.length && (
            <p className="py-8 text-center text-sm text-ink-soft">
              Nada escrito ainda. O que for combinado sobre esta nota fica aqui.
            </p>
          )}
          {falas.map(fala => (
            <div key={fala.id} className="rounded-2xl border border-line bg-canvas px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-extrabold text-ink">{fala.authorName || "Colaborador"}</p>
                <p className="text-[11px] text-ink-faint">{quando(fala.createdAt)}</p>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{fala.body}</p>
            </div>
          ))}
          <div ref={fim} />
        </div>

        <div className="border-t border-line px-6 py-4">
          <textarea
            value={texto}
            onChange={evento => setTexto(evento.target.value)}
            onKeyDown={evento => {
              // Enter envia, Shift+Enter quebra linha: é o que a mão já espera
              // de qualquer conversa.
              if (evento.key === "Enter" && !evento.shiftKey) {
                evento.preventDefault();
                enviar();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder="O que foi combinado sobre esta nota..."
            className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-rvd-plum"
          />
          <div className="mt-3 flex items-center justify-end gap-3">
            <span className="text-[11px] text-ink-faint">Enter envia · Shift+Enter quebra linha</span>
            <Button
              type="button"
              onClick={enviar}
              disabled={escrever.isPending || !texto.trim()}
              className="h-10 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand disabled:opacity-50"
            >
              <Send className="size-4" />
              {escrever.isPending ? "Enviando..." : "Escrever"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
