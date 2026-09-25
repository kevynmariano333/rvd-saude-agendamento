import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ChatAppointment = { id: number; invoiceNumber: string | null; serviceType: string; supplierName?: string | null; invoiceSupplierName?: string | null };

export default function AppointmentChatDialog({ appointment, currentUserId, open, onOpenChange }: { appointment: ChatAppointment | null; currentUserId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
  const messages = trpc.messages.list.useQuery({ appointmentId: appointment?.id ?? 1 }, { enabled: open && Boolean(appointment), refetchInterval: open ? 12_000 : false });
  const send = trpc.messages.send.useMutation({
    onSuccess: () => {
      setBody("");
      utils.messages.list.invalidate({ appointmentId: appointment?.id ?? 1 });
      utils.messages.notifications.invalidate();
      utils.messages.porNota.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (messages.data) {
      // Abrir a conversa marca as mensagens como lidas no servidor; sem isto a
      // marca da nota continuaria acesa até a próxima atualização.
      utils.messages.notifications.invalidate();
      utils.messages.porNota.invalidate();
      lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.data, utils.messages.notifications, utils.messages.porNota]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!appointment || !body.trim()) return;
    send.mutate({ appointmentId: appointment.id, body: body.trim() });
  }

  const title = appointment?.invoiceNumber ? `Nota ${appointment.invoiceNumber}` : appointment?.serviceType || "Agendamento";
  const counterpart = appointment?.invoiceSupplierName || appointment?.supplierName || "Participante";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[min(760px,calc(100vh-3rem))] max-w-2xl flex-col overflow-hidden rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl"><DialogHeader className="border-b border-line bg-rvd-plum-pale px-6 py-5"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-rvd-plum shadow-sm"><MessageCircle className="size-5" /></span><div><DialogTitle className="font-display text-xl font-extrabold text-ink">Chat do agendamento</DialogTitle><DialogDescription className="mt-1 text-rvd-plum">{title} · {counterpart}</DialogDescription></div></div></DialogHeader><div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-sunken px-6 py-5">{messages.isLoading ? <div className="flex h-48 items-center justify-center text-rvd-plum"><Loader2 className="size-6 animate-spin" /></div> : messages.data?.length ? messages.data.map(message => { const mine = message.senderId === currentUserId; return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><article className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-line bg-surface text-rvd-plum"}`}><p className={`text-[11px] font-bold ${mine ? "text-white/75" : "text-rvd-plum"}`}>{mine ? "Você" : message.senderName || "Participante"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5">{message.body}</p><p className={`mt-2 text-[10px] ${mine ? "text-white/75" : "text-rvd-plum"}`}>{new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p></article></div> }) : <div className="flex h-48 flex-col items-center justify-center text-center"><MessageCircle className="size-8 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Inicie a conversa sobre esta nota</p><p className="mt-1 max-w-sm text-sm text-ink-soft">As mensagens ficam visíveis para o fornecedor e para o operador deste agendamento.</p></div>}<div ref={lastMessageRef} /></div><form onSubmit={submit} className="border-t border-line bg-surface p-4"><div className="flex items-end gap-3"><Textarea value={body} onChange={event => setBody(event.target.value)} maxLength={1000} placeholder="Escreva uma mensagem sobre a nota..." className="min-h-11 max-h-28 flex-1 resize-none border-line text-rvd-plum placeholder:text-ink-soft" /><Button type="submit" disabled={!body.trim() || send.isPending} className="h-11 rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand">{send.isPending ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4" />Enviar</>}</Button></div></form></DialogContent></Dialog>;
}
