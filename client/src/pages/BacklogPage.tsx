import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { canTreatBacklogPortal, formatAppointmentDate, homePathFor, isPortalOperator, type PortalRole } from "@/lib/portal";
import { rotuloDoDestinatario } from "@shared/recipients";
import { pedidoEhUrgente, pedidosDaNota } from "@shared/purchaseOrders";
import UrgenciaBadge from "../components/UrgenciaBadge";
import { curtoDoMotivo } from "@shared/backlogReasons";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import type { AppointmentDetail } from "../components/AppointmentDetailsDialog";
import AppointmentDetailsDialog from "../components/AppointmentDetailsDialog";
import AppointmentDateHistoryDialog from "../components/AppointmentDateHistoryDialog";
import LoadingTruck from "../components/LoadingTruck";
import TratarPendenciaDialog from "../components/TratarPendenciaDialog";
import PortalLayout from "./PortalLayout";

/**
 * Fila de tratativa do backlog.
 *
 * Uma nota chega aqui quando o Operador constata, no recebimento, que ela não
 * fecha — divergência de volume, de valor, de item. Reagendar não resolveria:
 * a carga já chegou. O que falta é acertar o lançamento, e isso é trabalho do
 * planejamento, que é quem enxerga esta tela.
 */
export default function BacklogPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const backlog = trpc.appointments.list.useQuery({ status: "backlog" });
  const [tratando, setTratando] = useState<AppointmentDetail | null>(null);
  const [detalhes, setDetalhes] = useState<AppointmentDetail | null>(null);
  const [historico, setHistorico] = useState<AppointmentDetail | null>(null);
  // Reagendar é para a nota que travou por data — chegou fora da hora, não
  // chegou. Ela volta para a agenda com data nova em vez de esperar tratativa
  // de lançamento, que não é o que falta nela.
  const [reagendando, setReagendando] = useState<AppointmentDetail | null>(null);
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("09:00");
  const reagendar = trpc.appointments.schedule.useMutation({
    onSuccess: () => {
      toast.success("Nota reagendada. Ela saiu do backlog e voltou para a agenda.");
      setReagendando(null);
      utils.appointments.list.invalidate();
      utils.appointments.counts.invalidate();
    },
    onError: erro => toast.error(erro.message),
  });
  const abrirReagendamento = (item: AppointmentDetail) => {
    setReagendando(item);
    setNovaData("");
    setNovaHora("09:00");
  };
  const confirmarReagendamento = () => {
    if (!reagendando) return;
    if (!novaData || !novaHora) return toast.error("Informe a data e a hora do novo recebimento.");
    reagendar.mutate({ appointmentId: reagendando.id, scheduledFor: new Date(`${novaData}T${novaHora}:00`).toISOString() });
  };

  useEffect(() => {
    if (auth.data && !canTreatBacklogPortal(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole));
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Carregando o backlog" />;
  if (!auth.data || !canTreatBacklogPortal(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  const notas = backlog.data ?? [];
  // Quem crava data é o Operador; o planejador trata, mas não agenda.
  const podeAgendar = isPortalOperator(auth.data.role as PortalRole);

  return <PortalLayout user={auth.data} title="Backlog" subtitle="Notas que não fecharam no recebimento e esperam tratativa." onLogout={() => logout.mutate()}>
    <section className="panel p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-state-wait-bg p-2.5 text-state-wait"><AlertTriangle className="size-4" /></span>
          <div>
            <h2 className="font-display text-base font-extrabold text-ink">Backlog de notas</h2>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-soft">Trate as notas que não foram finalizadas com sucesso. Cada tratativa registra o lançamento no SAP e os documentos do HIS.</p>
          </div>
        </div>
        <span className="inline-flex h-fit shrink-0 items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1 text-[11px] font-bold text-rvd-plum">{notas.length} {notas.length === 1 ? "nota" : "notas"} em aberto</span>
      </div>

      {backlog.isLoading ? <div className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando backlog...</div>
        : notas.length ? <div className="mt-6 overflow-x-auto"><table className="w-full text-left">
            <thead className="bg-sunken">
              <tr className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Fornecedor</th>
                <th className="px-3 py-3">Destinatário</th>
                <th className="px-3 py-3">Nota / pedidos</th>
                <th className="px-3 py-3">Agendamento</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {notas.map(item => {
                const destinatario = rotuloDoDestinatario(item.recipientCnpj);
                const pedidos = pedidosDaNota(item.purchaseOrder);
                return <tr key={item.id} className="border-t border-line align-top text-sm">
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-state-wait-bg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-state-wait"><AlertTriangle className="size-3" />Backlog</span>
                    <UrgenciaBadge purchaseOrder={item.purchaseOrder} className="mt-1.5 flex w-fit" />
                    <p className="mt-1.5 inline-flex rounded bg-rvd-plum-pale px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{curtoDoMotivo(item.backlogReasonCode)}</p>
                    <p className="mt-1 line-clamp-3 max-w-44 text-[11px] leading-4 text-ink-soft">{item.backlogReason || "Sem descrição"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p title={item.invoiceSupplierName || item.supplierName || undefined} className="line-clamp-2 max-w-48 text-[13px] font-bold leading-4 text-rvd-plum">{item.invoiceSupplierName || item.supplierName || "Fornecedor"}</p>
                    <p className="mt-0.5 max-w-48 truncate text-[11px] text-ink-soft">{item.supplierEmail}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div title={destinatario.tooltip} className={destinatario.unidade ? "font-display text-[13px] font-extrabold leading-4 text-ink" : ""}>
                      <p className={destinatario.unidade ? "" : "font-bold text-rvd-plum"}>{destinatario.principal}</p>
                      <p className={destinatario.unidade ? "" : "mt-1 text-xs text-ink-soft"}>{destinatario.secundaria}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-display text-base font-extrabold leading-5 text-ink">NF {item.invoiceNumber || "—"}</p>
                    {pedidos.length ? <div className="mt-1.5 flex flex-col items-start gap-1">{pedidos.map(pedido => <span key={pedido} className={`rounded px-2 py-0.5 text-[11px] font-bold ${pedidoEhUrgente(pedido) ? "bg-state-stop-bg text-state-stop" : "bg-rvd-plum-pale text-rvd-plum"}`}>{pedido}</span>)}</div> : null}
                    {item.invoiceVolumeCount !== null && <p className="mt-1 text-[11px] text-ink-soft">{item.invoiceVolumeCount} {item.invoiceVolumeCount === 1 ? "volume" : "volumes"}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[13px] font-bold text-rvd-plum">{new Date(item.scheduledFor).toLocaleDateString("pt-BR")}</p>
                    <p className="text-[11px] text-ink-soft">{new Date(item.scheduledFor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetalhes(item)} title="Abrir detalhes da nota" className="rounded-lg p-1.5 text-rvd-plum hover:bg-rvd-plum-pale"><FileText className="size-4" /></button>
                      {podeAgendar && <Button onClick={() => abrirReagendamento(item)} variant="outline" className="h-8 shrink-0 rounded-xl border-line bg-surface px-3 text-[11px] font-bold text-rvd-plum hover:bg-rvd-plum-pale"><CalendarDays className="size-3.5" />Reagendar</Button>}
                      <Button onClick={() => setTratando(item)} className="h-8 shrink-0 rounded-xl bg-brand px-3.5 text-[11px] font-bold text-white hover:bg-brand"><ClipboardCheck className="size-3.5" />Tratar</Button>
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table></div>
        : <div className="mt-7 rounded-2xl bg-rvd-plum-pale px-6 py-16 text-center">
            <CheckCircle2 className="mx-auto size-8 text-rvd-plum" />
            <h3 className="mt-4 font-display text-lg font-extrabold text-ink">Nada em backlog</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">Todo recebimento fechou. Quando uma nota não fechar, ela aparece aqui para tratativa.</p>
          </div>}
    </section>

    <TratarPendenciaDialog
      appointment={tratando}
      open={Boolean(tratando)}
      onOpenChange={aberto => !aberto && setTratando(null)}
      onTreated={() => { setTratando(null); utils.appointments.list.invalidate(); }}
    />
    <AppointmentDetailsDialog appointment={detalhes} open={Boolean(detalhes)} onOpenChange={aberto => !aberto && setDetalhes(null)} onHistory={() => { setHistorico(detalhes); setDetalhes(null); }} />
    <AppointmentDateHistoryDialog appointment={historico} open={Boolean(historico)} onOpenChange={aberto => !aberto && setHistorico(null)} />

    <Dialog open={Boolean(reagendando)} onOpenChange={aberto => !aberto && setReagendando(null)}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:max-w-md">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><CalendarDays className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Reagendar nota</DialogTitle>
              <DialogDescription className="text-[13px] text-ink-soft">NF {reagendando?.invoiceNumber || "não identificada"} · sai do backlog e volta para a agenda.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="backlog-data" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Nova data *</Label>
            <Input id="backlog-data" type="date" value={novaData} onChange={evento => setNovaData(evento.target.value)} className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
          </div>
          <div>
            <Label htmlFor="backlog-hora" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Novo horário *</Label>
            <Input id="backlog-hora" type="time" value={novaHora} onChange={evento => setNovaHora(evento.target.value)} className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => setReagendando(null)} className="font-bold text-ink-soft hover:bg-sunken">Cancelar</Button>
          <Button type="button" onClick={confirmarReagendamento} disabled={reagendar.isPending} className="h-10 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand"><CalendarDays className="size-4" />{reagendar.isPending ? "Reagendando..." : "Reagendar"}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  </PortalLayout>;
}
