import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { type PortalStatus, statusCopy } from "@/lib/portal";
import { CalendarClock, Loader2 } from "lucide-react";
import type { AppointmentDetail } from "./AppointmentDetailsDialog";

type TimelineEntry = { id: string; profile: string; status: string; name: string; date: Date; detail?: string };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function AppointmentDateHistoryDialog({ appointment, open, onOpenChange }: { appointment: AppointmentDetail | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const appointmentId = appointment?.id ?? 0;
  const history = trpc.appointments.history.useQuery({ appointmentId }, { enabled: open && appointmentId > 0 });
  const suggestions = trpc.suggestions.list.useQuery({ appointmentId }, { enabled: open && appointmentId > 0 });
  const entries: TimelineEntry[] = [
    ...(suggestions.data ?? []).map(suggestion => ({ id: `suggestion-${suggestion.id}`, profile: "Fornecedor", status: suggestion.status === "accepted" ? "Sugestão aceita" : suggestion.status === "declined" ? "Sugestão recusada" : "Sugestão", name: suggestion.supplierName || appointment?.supplierName || "Fornecedor", date: new Date(suggestion.suggestedFor), detail: suggestion.notes || undefined })),
    ...(history.data ?? []).map(event => ({ id: `history-${event.id}`, profile: event.handlerName ? "Operador" : "Sistema", status: event.previousScheduledFor || event.nextScheduledFor ? (event.previousScheduledFor ? "Reagendamento" : "Agendamento") : statusCopy[event.nextStatus as PortalStatus], name: event.handlerName || event.handlerEmail || "Processo automático", date: new Date(event.nextScheduledFor || event.createdAt), detail: event.eventNote || (event.previousScheduledFor ? `Anterior: ${formatDate(new Date(event.previousScheduledFor))} às ${formatTime(new Date(event.previousScheduledFor))}` : undefined) })),
  ].sort((left, right) => left.date.getTime() - right.date.getTime());

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-[2rem] !border !border-rvd-plum-soft !bg-white p-0 shadow-2xl"><DialogHeader className="border-b border-rvd-plum-soft bg-white px-7 py-6"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rvd-plum-pale text-rvd-plum"><CalendarClock className="size-5" /></span><div><DialogTitle className="font-display text-2xl font-extrabold text-rvd-plum">Histórico de datas</DialogTitle><DialogDescription className="mt-1 text-rvd-plum">NF {appointment?.invoiceNumber || "não identificada"} · sugestões, agendamentos e reagendamentos</DialogDescription></div></div></DialogHeader><div className="bg-white p-7">{history.isLoading || suggestions.isLoading ? <div className="flex min-h-36 items-center justify-center text-rvd-plum"><Loader2 className="mr-2 size-5 animate-spin" />Carregando histórico...</div> : entries.length ? <div className="overflow-hidden rounded-2xl border border-rvd-plum-soft"><table className="w-full text-left"><thead className="bg-[#fafbfc]"><tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum"><th className="px-4 py-3">Perfil</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Hora</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} className="border-t border-rvd-plum-soft text-sm text-rvd-plum"><td className="px-4 py-4 font-semibold">{entry.profile}</td><td className="px-4 py-4"><span className="rounded-full bg-rvd-plum-pale px-2.5 py-1 text-xs font-bold text-rvd-plum">{entry.status}</span>{entry.detail && <p className="mt-1 max-w-48 text-xs text-rvd-plum">{entry.detail}</p>}</td><td className="px-4 py-4 font-semibold">{entry.name}</td><td className="px-4 py-4">{formatDate(entry.date)}</td><td className="px-4 py-4">{formatTime(entry.date)}</td></tr>)}</tbody></table></div> : <div className="rounded-2xl bg-[#fafbfc] px-6 py-12 text-center"><CalendarClock className="mx-auto size-8 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Nenhuma alteração de data registrada</p><p className="mt-1 text-sm text-rvd-plum">As sugestões e alterações de agendamento aparecerão aqui.</p></div>}</div><footer className="flex justify-end border-t border-rvd-plum-soft bg-white px-7 py-4"><Button type="button" onClick={() => onOpenChange(false)} className="rounded-xl bg-rvd-plum px-6 font-bold text-white hover:bg-rvd-plum">Fechar</Button></footer></DialogContent></Dialog>;
}
