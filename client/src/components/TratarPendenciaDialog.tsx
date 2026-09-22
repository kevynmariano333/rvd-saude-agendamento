import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatAppointmentDate } from "@/lib/portal";
import { rotuloDoDestinatario } from "@shared/recipients";
import { pedidoEhUrgente, pedidosDaNota } from "@shared/purchaseOrders";
import UrgenciaBadge from "./UrgenciaBadge";
import { ERRO_MIRO, validarTratativa } from "@shared/tratativa";
import { rotuloDoMotivo } from "@shared/backlogReasons";
import { AlertTriangle, ClipboardCheck, MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AppointmentDetail } from "./AppointmentDetailsDialog";

const campoClasse = "mt-2 h-11 border-line bg-surface text-rvd-plum";
const rotuloClasse = "text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint";

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div><p className={rotuloClasse}>{rotulo}</p><div className="mt-1 font-bold text-rvd-plum">{children}</div></div>;
}

/**
 * Tratativa de uma nota em backlog.
 *
 * Mostra a nota inteira antes do formulário de propósito: quem trata precisa
 * ver o que travou, o que já foi comentado internamente e só então lançar o que
 * resolveu. Um formulário solto, sem o contexto ao lado, obriga a abrir outra
 * tela para saber do que se trata.
 */
export default function TratarPendenciaDialog({ appointment, open, onOpenChange, onTreated }: { appointment: AppointmentDetail | null; open: boolean; onOpenChange: (open: boolean) => void; onTreated: () => void }) {
  const [miro, setMiro] = useState("");
  const [cotacao, setCotacao] = useState("");
  const [pedidoMemorizado, setPedidoMemorizado] = useState("");
  const [entradaHis, setEntradaHis] = useState("");
  const [saidaHis, setSaidaHis] = useState("");
  const [observacao, setObservacao] = useState("");
  const utils = trpc.useUtils();

  const appointmentId = appointment?.id ?? 0;
  const notas = trpc.internalNotes.list.useQuery({ appointmentId }, { enabled: open && appointmentId > 0 });
  const comentar = trpc.internalNotes.create.useMutation({
    onSuccess: () => { setObservacao(""); utils.internalNotes.list.invalidate(); },
    onError: erro => toast.error(erro.message),
  });
  const tratar = trpc.appointments.tratarBacklog.useMutation({
    onSuccess: () => {
      toast.success("Tratativa registrada. A nota foi concluída.");
      setMiro(""); setCotacao(""); setPedidoMemorizado(""); setEntradaHis(""); setSaidaHis("");
      onTreated();
    },
    onError: erro => toast.error(erro.message),
  });

  if (!appointment) return null;
  const destinatario = rotuloDoDestinatario(appointment.recipientCnpj);
  const pedidos = pedidosDaNota(appointment.purchaseOrder);

  const finalizar = () => {
    // A mesma regra do servidor, aqui só para responder na hora.
    const validacao = validarTratativa({ miroNumber: miro, quotationNumber: cotacao, memorizedOrder: pedidoMemorizado, hisEntryDocument: entradaHis, hisExitDocument: saidaHis });
    if (!validacao.ok) return toast.error(validacao.erro ?? ERRO_MIRO);
    tratar.mutate({ appointmentId: appointment.id, miroNumber: miro, quotationNumber: cotacao || undefined, memorizedOrder: pedidoMemorizado || undefined, hisEntryDocument: entradaHis || undefined, hisExitDocument: saidaHis || undefined });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-1rem)] !max-w-4xl overflow-y-auto rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl sm:!max-w-4xl">
    <DialogHeader className="border-b border-line px-6 py-6 sm:px-9">
      <div className="flex items-start gap-4 pr-8">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-state-wait-bg text-state-wait"><AlertTriangle className="size-6" /></span>
        <div>
          <DialogTitle className="font-display text-2xl font-extrabold text-ink">Tratar pendência</DialogTitle>
          <DialogDescription className="mt-1 text-rvd-plum">NF {appointment.invoiceNumber || "não identificada"} · {appointment.invoiceSupplierName || appointment.supplierName || "Fornecedor"}</DialogDescription>
        </div>
      </div>
    </DialogHeader>

    <div className="px-6 py-7 sm:px-9">
      <section className="rounded-3xl border border-line bg-canvas p-5 sm:p-6">
        <p className={rotuloClasse}>Por que voltou</p>
        <p className="mt-2 font-display text-lg font-extrabold text-ink">{rotuloDoMotivo(appointment.backlogReasonCode)}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{appointment.backlogReason || "Sem descrição registrada."}</p>
      </section>

      <section className="mt-6 grid gap-5 sm:grid-cols-3">
        <Dado rotulo="Destinatário">{destinatario.principal} {destinatario.secundaria}</Dado>
        <Dado rotulo="Agendamento">{formatAppointmentDate(appointment.scheduledFor)}</Dado>
        <Dado rotulo="Recebimento">{appointment.receivedAt ? formatAppointmentDate(appointment.receivedAt) : "Não registrado"}</Dado>
        <Dado rotulo="Volumes">{appointment.invoiceVolumeCount === null ? "Não informado" : `${appointment.invoiceVolumeCount}`}</Dado>
        <Dado rotulo="Pedidos">{pedidos.length ? <span className="flex flex-wrap items-center gap-1.5">{pedidos.map(pedido => <span key={pedido} className={`rounded-md px-2 py-0.5 text-xs ${pedidoEhUrgente(pedido) ? "bg-state-stop-bg text-state-stop" : "bg-rvd-plum-pale"}`}>{pedido}</span>)}<UrgenciaBadge purchaseOrder={appointment.purchaseOrder} /></span> : "—"}</Dado>
        <Dado rotulo="Chave de acesso"><span className="break-all font-mono text-xs font-normal text-ink-soft">{appointment.invoiceAccessKey || "Não disponível"}</span></Dado>
      </section>

      <section className="mt-8">
        <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-ink"><MessageSquare className="size-5 text-rvd-plum" />Observações internas<span className="rounded-full bg-sunken px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Apenas colaboradores</span></h3>
        <p className="mt-1 text-xs text-ink-soft">O fornecedor não vê nada escrito aqui.</p>
        <div className="mt-4 space-y-3">
          {notas.isLoading ? <p className="text-sm text-ink-soft">Carregando observações...</p>
            : notas.data?.length ? notas.data.map(nota => <article key={nota.id} className="rounded-2xl bg-sunken px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-rvd-plum">{nota.authorName || nota.authorEmail || "Colaborador"}</p>
                  <p className="text-xs text-ink-faint">{formatAppointmentDate(nota.createdAt)}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{nota.body}</p>
              </article>)
            : <p className="rounded-2xl bg-sunken px-4 py-5 text-sm text-ink-soft">Nenhuma observação ainda.</p>}
        </div>
        <div className="mt-4 flex items-end gap-3">
          <Textarea value={observacao} onChange={event => setObservacao(event.target.value)} placeholder="Adicionar uma observação interna..." className="min-h-20 flex-1 border-line bg-surface text-rvd-plum" />
          <Button onClick={() => comentar.mutate({ appointmentId: appointment.id, body: observacao })} disabled={!observacao.trim() || comentar.isPending} className="h-11 shrink-0 rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand"><Send className="size-4" /></Button>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-line bg-canvas p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rvd-plum-pale text-rvd-plum"><ClipboardCheck className="size-5" /></span>
          <div>
            <h3 className="font-display text-lg font-extrabold text-ink">Tratar pendência</h3>
            <p className="mt-1 text-sm text-ink-soft">Preencha o que foi feito para finalizar o backlog. Só o MIRO é obrigatório.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="tratativa-miro" className={rotuloClasse}>MIRO (10 dígitos) *</Label>
            <Input id="tratativa-miro" value={miro} onChange={event => setMiro(event.target.value)} inputMode="numeric" maxLength={14} placeholder="0000000000" className={`${campoClasse} font-mono`} />
          </div>
          <div>
            <Label htmlFor="tratativa-cotacao" className={rotuloClasse}>Nova cotação</Label>
            <Input id="tratativa-cotacao" value={cotacao} onChange={event => setCotacao(event.target.value)} maxLength={60} placeholder="Nº cotação" className={campoClasse} />
          </div>
          <div>
            <Label htmlFor="tratativa-pedido" className={rotuloClasse}>Pedido criado memorizado</Label>
            <Input id="tratativa-pedido" value={pedidoMemorizado} onChange={event => setPedidoMemorizado(event.target.value)} maxLength={60} placeholder="Nº pedido" className={campoClasse} />
          </div>
          <div>
            <Label htmlFor="tratativa-entrada" className={rotuloClasse}>Documento entrada HIS</Label>
            <Input id="tratativa-entrada" value={entradaHis} onChange={event => setEntradaHis(event.target.value)} maxLength={60} placeholder="Nº documento" className={campoClasse} />
          </div>
          <div>
            <Label htmlFor="tratativa-saida" className={rotuloClasse}>Documento saída HIS</Label>
            <Input id="tratativa-saida" value={saidaHis} onChange={event => setSaidaHis(event.target.value)} maxLength={60} placeholder="Nº documento" className={campoClasse} />
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Fechar</Button>
          <Button onClick={finalizar} disabled={tratar.isPending} className="h-12 rounded-xl bg-brand px-6 font-bold text-white hover:bg-brand"><ClipboardCheck className="size-4" />{tratar.isPending ? "Finalizando..." : "Finalizar tratamento"}</Button>
        </div>
      </section>
    </div>
  </DialogContent></Dialog>;
}
