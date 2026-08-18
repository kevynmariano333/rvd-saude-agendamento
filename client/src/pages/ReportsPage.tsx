import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { type PortalStatus, statusCopy } from "@/lib/portal";
import { BarChart3, Download, FileSpreadsheet, PieChart as PieChartIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

const colors: Record<PortalStatus, string> = { pending: "#88B8D0", scheduled: "#D8B8D8", received: "#C8A8D0", completed: "#782078", backlog: "#E0C8E0", rejected: "#A8C8D8" };

export default function ReportsPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const analytics = trpc.analytics.dashboard.useQuery();
  const fiscal = trpc.appointments.list.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  useEffect(() => { if (auth.data?.role === "supplier") setLocation("/fornecedor"); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  const statusData = useMemo(() => Object.entries(analytics.data?.statusCounts ?? {}).map(([status, total]) => ({ name: statusCopy[status as PortalStatus], total, status: status as PortalStatus })), [analytics.data]);
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-white" />;

  return <PortalLayout user={auth.data} title="Relatórios" subtitle="Acompanhe a distribuição dos agendamentos e fornecedores." onLogout={() => logout.mutate()}>
    <section className="grid gap-4 sm:grid-cols-3"><Metric label="Total de agendamentos" value={analytics.data?.total ?? 0} icon={FileSpreadsheet} surface="bg-rvd-blue-pale" /><Metric label="Agendados" value={analytics.data?.statusCounts.scheduled ?? 0} icon={BarChart3} surface="bg-rvd-plum-pale" /><Metric label="Concluídos" value={analytics.data?.statusCounts.completed ?? 0} icon={PieChartIcon} surface="bg-rvd-blue" /></section>
    <section className="mt-8 grid gap-8 xl:grid-cols-2"><article className="rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Status</p><h2 className="mt-2 font-display text-xl font-extrabold text-rvd-plum">Distribuição dos agendamentos</h2></div><div className="mt-6 h-72">{analytics.isLoading ? <Loading /> : <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="total" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={3}>{statusData.map(item => <Cell key={item.status} fill={colors[item.status]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}</div><div className="grid grid-cols-2 gap-2">{statusData.map(item => <div key={item.status} className="flex items-center justify-between rounded-xl bg-rvd-plum-pale px-3 py-2"><span className="text-xs font-bold text-rvd-plum">{item.name}</span><span className="text-sm font-extrabold text-rvd-plum">{item.total}</span></div>)}</div></article>
      <article className="rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Fornecedores</p><h2 className="mt-2 font-display text-xl font-extrabold text-rvd-plum">Maior volume de solicitações</h2></div><Button variant="ghost" className="border border-rvd-plum-soft text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><Download className="size-4" />Exportar</Button></div><div className="mt-6 h-72">{analytics.isLoading ? <Loading /> : <ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.data?.topSuppliers ?? []} layout="vertical" margin={{ left: 10 }}><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: "#782078", fontSize: 11 }} /><Tooltip /><Bar dataKey="total" fill="#782078" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer>}</div></article></section>
    <section className="mt-8 rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7"><p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Dados fiscais</p><h2 className="mt-2 font-display text-xl font-extrabold text-rvd-plum">Notas vinculadas aos agendamentos</h2>{fiscal.isLoading ? <div className="py-10 text-sm font-bold text-rvd-plum">Carregando dados fiscais...</div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-rvd-plum-soft text-xs font-bold uppercase tracking-wide text-rvd-plum"><th className="pb-3">Nota</th><th className="pb-3">Fornecedor</th><th className="pb-3">CNPJ destinatário</th><th className="pb-3">Pedido</th><th className="pb-3">Status</th></tr></thead><tbody>{fiscal.data?.filter(item => item.invoiceNumber || item.recipientCnpj).slice(0, 8).map(item => <tr key={item.id} className="border-b border-rvd-plum-soft"><td className="py-3 font-bold text-rvd-plum">{item.invoiceNumber || "—"}</td><td className="py-3 text-rvd-plum">{item.invoiceSupplierName || item.supplierName || "—"}</td><td className="py-3 text-rvd-plum">{item.recipientCnpj || "—"}</td><td className="py-3 text-rvd-plum">{item.purchaseOrder || "—"}</td><td className="py-3 text-rvd-plum">{statusCopy[item.status as PortalStatus]}</td></tr>)}</tbody></table></div>}</section>
  </PortalLayout>;
}

function Metric({ label, value, icon: Icon, surface }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; surface: string }) { return <article className={`rounded-3xl p-5 ${surface}`}><div className="flex items-start justify-between"><p className="text-sm font-bold text-rvd-plum">{label}</p><Icon className="size-5 text-rvd-plum" /></div><p className="mt-5 font-display text-4xl font-extrabold text-rvd-plum">{value}</p></article>; }
function Loading() { return <div className="flex h-full items-center justify-center text-sm font-bold text-rvd-plum">Carregando relatório...</div>; }
