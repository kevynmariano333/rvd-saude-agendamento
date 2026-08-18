import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { type PortalStatus, formatAppointmentDate, statusCopy } from "@/lib/portal";
import { Check, CircleCheckBig, Clock3, SearchX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

const badgeStyle: Record<PortalStatus, string> = { pending: "bg-rvd-blue-pale", approved: "bg-rvd-plum-pale", rejected: "bg-rvd-lilac-blue", completed: "bg-rvd-blue" };

export default function OperatorDashboard() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const agenda = trpc.appointments.list.useQuery({ date: date || undefined, status: status === "all" ? undefined : status as PortalStatus });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const update = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status do agendamento atualizado."); utils.appointments.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data?.role === "supplier") setLocation("/fornecedor");
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  const totals = useMemo(() => ({ pending: agenda.data?.filter(item => item.status === "pending").length ?? 0, approved: agenda.data?.filter(item => item.status === "approved").length ?? 0, completed: agenda.data?.filter(item => item.status === "completed").length ?? 0 }), [agenda.data]);
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-white" />;

  return <PortalLayout user={auth.data} title="Central de agendamentos" subtitle="Acompanhe e trate as solicitações recebidas." onLogout={() => logout.mutate()}>
    <section className="grid gap-4 sm:grid-cols-3">
      <Metric label="Pendentes" value={totals.pending} icon={Clock3} surface="bg-rvd-blue-pale" />
      <Metric label="Aprovados" value={totals.approved} icon={Check} surface="bg-rvd-plum-pale" />
      <Metric label="Concluídos" value={totals.completed} icon={CircleCheckBig} surface="bg-rvd-blue" />
    </section>
    <section className="mt-8 rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Fluxo de trabalho</p><h2 className="mt-2 font-display text-2xl font-extrabold text-rvd-plum">Solicitações recebidas</h2></div><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="filter-date" className="text-xs font-bold text-rvd-plum">Data</Label><Input id="filter-date" type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 border-rvd-plum-soft text-rvd-plum" /></div><div><Label className="text-xs font-bold text-rvd-plum">Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="mt-1 border-rvd-plum-soft text-rvd-plum"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="approved">Aprovado</SelectItem><SelectItem value="rejected">Rejeitado</SelectItem><SelectItem value="completed">Concluído</SelectItem></SelectContent></Select></div></div></div>
      {agenda.isLoading ? <div className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando agendamentos...</div> : agenda.data?.length ? <div className="mt-7 overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-rvd-plum-soft text-xs font-bold uppercase tracking-[0.1em] text-rvd-plum"><th className="pb-3">Fornecedor</th><th className="pb-3">Serviço</th><th className="pb-3">Data e horário</th><th className="pb-3">Status</th><th className="pb-3 text-right">Ações</th></tr></thead><tbody>{agenda.data.map(item => <tr key={item.id} className="border-b border-rvd-plum-soft last:border-0"><td className="py-5"><p className="font-bold text-rvd-plum">{item.supplierName || "Fornecedor"}</p><p className="mt-1 text-xs text-rvd-plum">{item.supplierEmail}</p></td><td className="py-5 text-sm font-semibold text-rvd-plum">{item.serviceType}</td><td className="py-5 text-sm text-rvd-plum">{formatAppointmentDate(item.scheduledFor)}</td><td className="py-5"><StatusBadge status={item.status as PortalStatus} /></td><td className="py-5"><div className="flex justify-end gap-2">{item.status === "pending" && <><Action label="Aprovar" onClick={() => update.mutate({ appointmentId: item.id, status: "approved" })} icon={Check} /><Action label="Rejeitar" onClick={() => update.mutate({ appointmentId: item.id, status: "rejected" })} icon={X} /></>}{item.status === "approved" && <Action label="Concluir" onClick={() => update.mutate({ appointmentId: item.id, status: "completed" })} icon={CircleCheckBig} />}</div></td></tr>)}</tbody></table></div> : <EmptyState />}
    </section>
  </PortalLayout>;
}

function Metric({ label, value, icon: Icon, surface }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; surface: string }) { return <article className={`rounded-3xl p-5 ${surface}`}><div className="flex items-start justify-between"><p className="text-sm font-bold text-rvd-plum">{label}</p><Icon className="size-5 text-rvd-plum" /></div><p className="mt-5 font-display text-4xl font-extrabold text-rvd-plum">{value}</p></article>; }
function StatusBadge({ status }: { status: PortalStatus }) { return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold text-rvd-plum ${badgeStyle[status]}`}>{statusCopy[status]}</span>; }
function Action({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: React.ComponentType<{ className?: string }> }) { return <Button onClick={onClick} variant="ghost" className="h-8 gap-1 rounded-lg border border-rvd-plum-soft px-2 text-xs font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><Icon className="size-3.5" />{label}</Button>; }
function EmptyState() { return <div className="mt-7 rounded-2xl bg-rvd-plum-pale px-6 py-14 text-center"><SearchX className="mx-auto size-8 text-rvd-plum" /><h3 className="mt-4 font-display text-lg font-extrabold text-rvd-plum">Nenhum agendamento encontrado</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-rvd-plum">Ajuste os filtros ou aguarde novas solicitações de fornecedores.</p></div>; }
