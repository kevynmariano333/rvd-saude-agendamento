import LoadingTruck from "@/components/LoadingTruck";
import { trpc } from "@/lib/trpc";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3 } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

export default function OperatorOverview() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const analytics = trpc.analytics.dashboard.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  useEffect(() => { if (auth.data?.role === "supplier") setLocation("/fornecedor"); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  if (auth.isLoading) return <LoadingTruck label="Preparando o dashboard" />;
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-white" />;
  const counts = analytics.data?.statusCounts;
  return <PortalLayout user={auth.data} title="Dashboard" subtitle="Visão geral da operação de agendamentos." onLogout={() => logout.mutate()}><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card label="Total de agendamentos" value={analytics.data?.total ?? 0} icon={ClipboardList} surface="bg-rvd-blue-pale" /><Card label="Pendentes" value={counts?.pending ?? 0} icon={Clock3} surface="bg-rvd-plum-pale" /><Card label="Agendados" value={counts?.scheduled ?? 0} icon={CalendarDays} surface="bg-rvd-lilac-blue" /><Card label="Concluídos" value={counts?.completed ?? 0} icon={CheckCircle2} surface="bg-rvd-blue" /></section><section className="mt-7 rounded-3xl border border-rvd-plum-soft bg-white p-6 sm:p-8"><p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Acesso rápido</p><h2 className="mt-2 font-display text-2xl font-extrabold text-rvd-plum">Central de agendamentos</h2><p className="mt-2 max-w-xl text-sm text-rvd-plum">Filtre notas, atualize status, agende recebimentos e acompanhe o calendário da operação.</p><button onClick={() => setLocation("/operador")} className="mt-6 rounded-xl bg-rvd-plum px-5 py-3 text-sm font-bold text-white">Abrir agendamentos</button></section></PortalLayout>;
}

function Card({ label, value, icon: Icon, surface }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; surface: string }) { return <article className={`rounded-3xl p-5 ${surface}`}><div className="flex items-center justify-between"><p className="text-sm font-bold text-rvd-plum">{label}</p><Icon className="size-5 text-rvd-plum" /></div><p className="mt-6 font-display text-4xl font-extrabold text-rvd-plum">{value}</p></article>; }
