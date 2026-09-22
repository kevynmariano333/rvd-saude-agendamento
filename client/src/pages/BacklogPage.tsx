import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { canTreatBacklogPortal, formatAppointmentDate, homePathFor, type PortalRole } from "@/lib/portal";
import { rotuloDoDestinatario } from "@shared/recipients";
import { pedidosDaNota } from "@shared/purchaseOrders";
import { curtoDoMotivo } from "@shared/backlogReasons";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText } from "lucide-react";
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

  useEffect(() => {
    if (auth.data && !canTreatBacklogPortal(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole));
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Carregando o backlog" />;
  if (!auth.data || !canTreatBacklogPortal(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  const notas = backlog.data ?? [];

  return <PortalLayout user={auth.data} title="Backlog" subtitle="Notas que não fecharam no recebimento e esperam tratativa." onLogout={() => logout.mutate()}>
    <section className="panel p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-state-wait-bg p-3 text-state-wait"><AlertTriangle className="size-5" /></span>
          <div>
            <h2 className="font-display text-xl font-extrabold text-ink">Backlog de notas</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-ink-soft">Trate as notas que não foram finalizadas com sucesso. Cada tratativa registra o lançamento no SAP e os documentos do HIS.</p>
          </div>
        </div>
        <span className="inline-flex h-fit shrink-0 items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1.5 text-xs font-bold text-rvd-plum">{notas.length} {notas.length === 1 ? "nota" : "notas"} em aberto</span>
      </div>

      {backlog.isLoading ? <div className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando backlog...</div>
        : notas.length ? <div className="mt-6 overflow-x-auto"><table className="w-full text-left">
            <thead className="bg-sunken">
              <tr className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                <th className="px-3 py-4">Status</th>
                <th className="px-3 py-4">Fornecedor</th>
                <th className="px-3 py-4">Destinatário</th>
                <th className="px-3 py-4">Nota / pedidos</th>
                <th className="px-3 py-4">Agendamento</th>
                <th className="px-3 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {notas.map(item => {
                const destinatario = rotuloDoDestinatario(item.recipientCnpj);
                const pedidos = pedidosDaNota(item.purchaseOrder);
                return <tr key={item.id} className="border-t border-line align-top">
                  <td className="px-3 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-state-wait-bg px-3 py-1 text-xs font-bold uppercase tracking-wide text-state-wait"><AlertTriangle className="size-3.5" />Backlog</span>
                    <p className="mt-2 inline-flex rounded-md bg-rvd-plum-pale px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{curtoDoMotivo(item.backlogReasonCode)}</p>
                    <p className="mt-1.5 line-clamp-3 max-w-44 text-xs leading-5 text-ink-soft">{item.backlogReason || "Sem descrição"}</p>
                  </td>
                  <td className="px-3 py-4">
                    <p title={item.invoiceSupplierName || item.supplierName || undefined} className="line-clamp-2 max-w-48 font-bold leading-5 text-rvd-plum">{item.invoiceSupplierName || item.supplierName || "Fornecedor"}</p>
                    <p className="mt-1 max-w-48 truncate text-xs text-ink-soft">{item.supplierEmail}</p>
                  </td>
                  <td className="px-3 py-4">
                    <div title={destinatario.tooltip} className={destinatario.unidade ? "font-display text-base font-extrabold leading-snug text-ink" : ""}>
                      <p className={destinatario.unidade ? "" : "font-bold text-rvd-plum"}>{destinatario.principal}</p>
                      <p className={destinatario.unidade ? "" : "mt-1 text-xs text-ink-soft"}>{destinatario.secundaria}</p>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <p className="font-display text-lg font-extrabold text-ink">NF {item.invoiceNumber || "—"}</p>
                    {pedidos.length ? <div className="mt-1.5 flex flex-col items-start gap-1">{pedidos.map(pedido => <span key={pedido} className="rounded-md bg-rvd-plum-pale px-2.5 py-1 text-xs font-bold text-rvd-plum">{pedido}</span>)}</div> : null}
                    {item.invoiceVolumeCount !== null && <p className="mt-1.5 text-xs text-ink-soft">{item.invoiceVolumeCount} {item.invoiceVolumeCount === 1 ? "volume" : "volumes"}</p>}
                  </td>
                  <td className="px-3 py-4">
                    <p className="font-bold text-rvd-plum">{new Date(item.scheduledFor).toLocaleDateString("pt-BR")}</p>
                    <p className="text-sm text-ink-soft">{new Date(item.scheduledFor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetalhes(item)} title="Abrir detalhes da nota" className="rounded-lg p-1.5 text-rvd-plum hover:bg-rvd-plum-pale"><FileText className="size-4" /></button>
                      <Button onClick={() => setTratando(item)} className="h-9 shrink-0 rounded-xl bg-brand px-4 text-xs font-bold text-white hover:bg-brand"><ClipboardCheck className="size-3.5" />Tratar</Button>
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
  </PortalLayout>;
}
