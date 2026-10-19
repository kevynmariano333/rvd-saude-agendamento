import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Check, Loader2, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ChatAppointment = { id: number; invoiceNumber: string | null; serviceType: string; supplierName?: string | null; invoiceSupplierName?: string | null };

/**
 * O "excluir" de uma mensagem.
 *
 * Fica fora do balão, do lado de fora da conversa, e só aparece quando o mouse
 * passa pela linha: dentro do balão ele disputaria espaço com o texto e seria
 * clicado sem querer. No celular, onde não há mouse, fica sempre visível —
 * esconder atrás de um gesto que não existe é esconder de vez.
 *
 * Pergunta antes. Apagar não tem volta: o texto sai do banco.
 */
/** O lápis: só de quem escreveu, e só enquanto a mensagem não foi apagada. */
function BotaoDeEditar({ aoEditar }: { aoEditar: () => void }) {
  return (
    <button type="button" title="Editar esta mensagem" onClick={aoEditar} className="shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-rvd-plum-pale hover:text-rvd-plum sm:opacity-0 sm:group-hover:opacity-100">
      <Pencil className="size-4" />
    </button>
  );
}

function BotaoDeApagar({ aoApagar, ocupado }: { aoApagar: () => void; ocupado: boolean }) {
  const [perguntando, setPerguntando] = useState(false);
  if (perguntando) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => { setPerguntando(false); aoApagar(); }} disabled={ocupado} className="rounded-lg bg-state-stop px-2 py-1 text-[10px] font-bold text-white disabled:opacity-60">Apagar</button>
        <button type="button" onClick={() => setPerguntando(false)} className="rounded-lg px-1.5 py-1 text-[10px] font-bold text-ink-soft hover:text-ink">Não</button>
      </span>
    );
  }
  return (
    <button type="button" title="Excluir esta mensagem" onClick={() => setPerguntando(true)} className="shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-state-stop-bg hover:text-state-stop sm:opacity-0 sm:group-hover:opacity-100">
      <Trash2 className="size-4" />
    </button>
  );
}

/**
 * A marca de que o texto mudou, e o que ele dizia antes.
 *
 * O "editada" sozinho avisa que houve troca e esconde qual — numa conversa que
 * serve de combinado entre a casa e o fornecedor, é justamente o "o que mudou"
 * que resolve a discussão. Fica atrás de um clique para não encher a conversa
 * de texto antigo.
 */
function MarcaDeEditada({ messageId, claro }: { messageId: number; claro: boolean }) {
  const [aberto, setAberto] = useState(false);
  const versoes = trpc.messages.versoes.useQuery({ messageId }, { enabled: aberto });
  return (
    <>
      <button type="button" onClick={() => setAberto(valor => !valor)} className={`underline decoration-dotted underline-offset-2 ${claro ? "text-white/75 hover:text-white" : "text-ink-faint hover:text-ink-soft"}`}>
        editada
      </button>
      {aberto && (
        <span className={`mt-1 block rounded-lg px-2 py-1.5 text-left text-[10px] leading-4 ${claro ? "bg-white/15 text-white/90" : "bg-sunken text-ink-soft"}`}>
          {versoes.isLoading ? (
            "Carregando o que dizia antes..."
          ) : versoes.data?.length ? (
            versoes.data.map(versao => (
              <span key={versao.id} className="mb-1 block last:mb-0">
                <span className="block font-bold">Antes de {new Date(versao.trocadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}:</span>
                <span className="block whitespace-pre-wrap italic">{versao.body}</span>
              </span>
            ))
          ) : (
            "Sem versão anterior guardada."
          )}
        </span>
      )}
    </>
  );
}

export default function AppointmentChatDialog({ appointment, currentUserId, podeApagarDeTodos = false, somenteLeitura = false, open, onOpenChange }: { appointment: ChatAppointment | null; currentUserId: number; /** O administrador apaga qualquer mensagem; os demais, só as próprias. */ podeApagarDeTodos?: boolean; /** O acesso de consulta lê a conversa e não escreve nela. */ somenteLeitura?: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
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

  // Qual mensagem está sendo editada, e o texto em andamento. Uma de cada vez:
  // duas caixas abertas é jeito de salvar a errada.
  const [editando, setEditando] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState("");
  const editar = trpc.messages.editar.useMutation({
    onSuccess: () => {
      setEditando(null);
      utils.messages.list.invalidate({ appointmentId: appointment?.id ?? 1 });
      utils.messages.versoes.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const apagar = trpc.messages.apagar.useMutation({
    onSuccess: () => {
      utils.messages.list.invalidate({ appointmentId: appointment?.id ?? 1 });
      utils.messages.notifications.invalidate();
      utils.messages.porNota.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!appointment || !body.trim()) return;
    send.mutate({ appointmentId: appointment.id, body: body.trim() });
  }

  const title = appointment?.invoiceNumber ? `Nota ${appointment.invoiceNumber}` : appointment?.serviceType || "Agendamento";
  const counterpart = appointment?.invoiceSupplierName || appointment?.supplierName || "Participante";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[min(760px,calc(100vh-3rem))] max-w-2xl flex-col overflow-hidden rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl"><DialogHeader className="border-b border-line bg-rvd-plum-pale px-6 py-5"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-rvd-plum shadow-sm"><MessageCircle className="size-5" /></span><div><DialogTitle className="font-display text-xl font-extrabold text-ink">Chat do agendamento</DialogTitle><DialogDescription className="mt-1 text-rvd-plum">{title} · {counterpart}</DialogDescription></div></div></DialogHeader><div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-sunken px-6 py-5">{messages.isLoading ? <div className="flex h-48 items-center justify-center text-rvd-plum"><Loader2 className="size-6 animate-spin" /></div> : messages.data?.length ? messages.data.map(message => { const mine = message.senderId === currentUserId; const apagada = Boolean(message.apagadaEm);
            // Apagar é de quem escreveu; o administrador alcança todas porque
            // responde pelo sistema. Some depois de apagada: não há o que apagar duas vezes.
            const podeApagar = !apagada && !somenteLeitura && (mine || podeApagarDeTodos);
            return <div key={message.id} className={`group flex items-center gap-2 ${mine ? "justify-end" : "justify-start"}`}>{mine && podeApagar && editando !== message.id && <>{mine && <BotaoDeEditar aoEditar={() => { setEditando(message.id); setRascunho(message.body); }} />}<BotaoDeApagar aoApagar={() => apagar.mutate({ messageId: message.id })} ocupado={apagar.isPending} /></>}<article className={`max-w-[82%] rounded-2xl px-4 py-3 ${apagada ? "rounded-2xl border border-dashed border-line bg-surface text-ink-faint" : mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-line bg-surface text-rvd-plum"}`}><p className={`text-[11px] font-bold ${apagada ? "text-ink-faint" : mine ? "text-white/75" : "text-rvd-plum"}`}>{mine ? "Você" : message.senderName || "Participante"}</p>{apagada ? <p className="mt-1 text-sm italic leading-5">Mensagem apagada</p> : editando === message.id ? <form onSubmit={evento => { evento.preventDefault(); if (rascunho.trim()) editar.mutate({ messageId: message.id, body: rascunho.trim() }); }} className="mt-1"><Textarea value={rascunho} onChange={evento => setRascunho(evento.target.value)} maxLength={1000} autoFocus className="min-h-16 w-full resize-none border-line bg-surface text-sm text-rvd-plum" /><span className="mt-2 flex justify-end gap-1.5"><button type="button" onClick={() => setEditando(null)} className={`rounded-lg px-2 py-1 text-[10px] font-bold ${mine ? "bg-white/20 text-white" : "bg-sunken text-ink-soft"}`}><X className="mr-0.5 inline size-3" />Cancelar</button><button type="submit" disabled={!rascunho.trim() || editar.isPending} className="rounded-lg bg-state-go px-2 py-1 text-[10px] font-bold text-white disabled:opacity-60"><Check className="mr-0.5 inline size-3" />Salvar</button></span></form> : <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{message.body}</p>}<p className={`mt-2 text-[10px] ${apagada ? "text-ink-faint" : mine ? "text-white/75" : "text-rvd-plum"}`}>{new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{!apagada && message.editadaEm ? <> · <MarcaDeEditada messageId={message.id} claro={mine} /></> : null}</p></article>{!mine && podeApagar && editando !== message.id && <BotaoDeApagar aoApagar={() => apagar.mutate({ messageId: message.id })} ocupado={apagar.isPending} />}</div> }) : <div className="flex h-48 flex-col items-center justify-center text-center"><MessageCircle className="size-8 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Inicie a conversa sobre esta nota</p><p className="mt-1 max-w-sm text-sm text-ink-soft">As mensagens ficam visíveis para o fornecedor e para o operador deste agendamento.</p></div>}<div ref={lastMessageRef} /></div>{somenteLeitura ? <p className="border-t border-line bg-surface p-4 text-center text-xs font-bold text-ink-faint">Este acesso é só de consulta: dá para ler a conversa, não para escrever nela.</p> : <form onSubmit={submit} className="border-t border-line bg-surface p-4"><div className="flex items-end gap-3"><Textarea value={body} onChange={event => setBody(event.target.value)} maxLength={1000} placeholder="Escreva uma mensagem sobre a nota..." className="min-h-11 max-h-28 flex-1 resize-none border-line text-rvd-plum placeholder:text-ink-soft" /><Button type="submit" disabled={!body.trim() || send.isPending} className="h-11 rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand">{send.isPending ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4" />Enviar</>}</Button></div></form>}</DialogContent></Dialog>;
}
