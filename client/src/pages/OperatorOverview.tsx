import LoadingTruck from "@/components/LoadingTruck";
import { trpc } from "@/lib/trpc";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import { classificationLabel, formatArrival, parseInvoiceNumbers, serviceTypeCopy } from "@/lib/attendance";
import { CalendarDays, Clock3, DoorOpen, PackageCheck, Trophy, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

export default function OperatorOverview() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const today = new Date();
  const [month, setMonth] = useState(() => today.getMonth() + 1);
  const [year, setYear] = useState(() => today.getFullYear());
  const analytics = trpc.analytics.dashboard.useQuery({ month, year });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  useEffect(() => { if (auth.data?.role === "supplier") setLocation("/fornecedor"); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  if (auth.isLoading) return <LoadingTruck label="Preparando o dashboard" />;
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-canvas" />;
  const data = analytics.data;
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(year, month - 1, 1));
  const yearOptions = Array.from({ length: 5 }, (_, index) => today.getFullYear() - 2 + index);
  return <PortalLayout user={auth.data} title="Dashboard" subtitle="Acompanhe indicadores, recebimentos e prioridades da operação." onLogout={() => logout.mutate()}><div className="space-y-6"><section className="flex flex-col gap-4 panel p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Visão operacional</p><h2 className="mt-1 font-display text-2xl font-extrabold capitalize text-ink">{monthName} de {year}</h2></div><div className="flex flex-wrap gap-2"><FilterSelect label="Mês" value={month} onChange={value => setMonth(Number(value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</FilterSelect><FilterSelect label="Ano" value={year} onChange={value => setYear(Number(value))}>{yearOptions.map(option => <option key={option} value={option}>{option}</option>)}</FilterSelect></div></section><section className="grid gap-4 lg:grid-cols-3"><MetricCard label="Pendentes de Agendamento" value={data?.pendingCount ?? 0} amountCents={data?.pendingTotalCents ?? 0} detail="Aguardam confirmação" icon={Clock3} iconClass="bg-amber-50 text-amber-500" /><MetricCard label="Agendadas" value={data?.scheduledCount ?? 0} amountCents={data?.scheduledTotalCents ?? 0} detail={`Confirmadas em ${monthName}`} icon={CalendarDays} iconClass="bg-rvd-lilac-blue text-rvd-plum" /><MetricCard label="Recebidas" value={data?.receivedCount ?? 0} amountCents={data?.receivedTotalCents ?? 0} detail={`Notas recebidas em ${monthName}`} icon={PackageCheck} iconClass="bg-emerald-50 text-emerald-600" /></section><section className="panel p-5 shadow-sm sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Recebimentos</p><h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas recebidas por dia</h2></div><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><PackageCheck className="size-5" /></span></div><div className="mt-5 h-72">{data?.dailyReceived.some(item => item.total > 0) ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.dailyReceived} margin={{ top: 22, right: 4, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#E5E8EF" /><XAxis dataKey="label" interval="preserveStartEnd" tickLine={false} axisLine={false} tick={{ fill: "#5A6275", fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#8B93A6", fontSize: 11 }} /><Tooltip cursor={{ fill: "#F6F7FA" }} contentStyle={{ borderRadius: 12, borderColor: "#E5E8EF" }} formatter={(value: number) => [value, "Notas recebidas"]} /><Bar dataKey="total" fill="#39c99b" radius={[6, 6, 2, 2]} maxBarSize={30}><LabelList dataKey="total" position="top" fill="#169b75" fontSize={11} formatter={(value: number) => value || ""} /></Bar></BarChart></ResponsiveContainer> : <EmptyChart month={monthName} />}</div></section><section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><section className="panel p-5 shadow-sm sm:p-7"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Top fornecedores</p><h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas recebidas no período</h2></div><span className="rounded-xl bg-rvd-plum-pale p-2.5 text-rvd-plum"><Trophy className="size-5" /></span></div>{data?.topSuppliers.length ? <ol className="mt-5 divide-y divide-line">{data.topSuppliers.map((supplier, index) => <li key={supplier.name} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rvd-plum-pale text-sm font-extrabold text-rvd-plum">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-rvd-plum">{supplier.name}</span><span className="mt-0.5 block text-xs text-ink-soft">Fornecedor</span></span><span className="text-right"><span className="block text-lg font-extrabold text-rvd-plum">{supplier.notesReceived}</span><span className="block text-[10px] font-bold uppercase tracking-wide text-ink-soft">notas</span></span></li>)}</ol> : <EmptyRanking month={monthName} />}</section><section className="flex min-h-[20rem] flex-col panel p-5 shadow-sm sm:p-7"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Tempo médio de espera</p><h2 className="mt-1 font-display text-xl font-extrabold text-ink">Pendentes sem agendamento</h2></div><span className="rounded-xl bg-amber-50 p-2.5 text-amber-500"><Clock3 className="size-5" /></span></div><div className="my-auto py-8 text-center"><p className="text-sm text-ink-soft">O tempo médio de agendamento é de</p><p className="mt-2 font-display text-5xl font-extrabold text-ink">{formatDuration(data?.averageWaitMinutes ?? 0)}</p><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-ink-faint">Baseado em {data?.pendingBasis ?? 0} notas pendentes</p></div></section></section><GateEntriesPanel /><section className="panel p-6 sm:p-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-faint">Acesso rápido</p><h2 className="mt-2 font-display text-2xl font-extrabold text-ink">Central de agendamentos</h2><p className="mt-2 max-w-xl text-sm text-ink-soft">Filtre notas, atualize status, agende recebimentos e acompanhe o calendário da operação.</p></div><button onClick={() => setLocation("/operador")} className="rounded-xl bg-rvd-plum px-5 py-3 text-sm font-bold text-white">Abrir agendamentos</button></div></section></div></PortalLayout>;
}

/**
 * O que entrou pela portaria hoje. A operação de agendamentos não trabalha no
 * pátio, mas precisa saber qual fornecedor e qual transportadora chegaram — e
 * o registro continua aqui depois que o caminhão vai embora.
 */
function GateEntriesPanel() {
  const dayLog = trpc.attendances.dayLog.useQuery(undefined, { refetchInterval: 60_000 });
  const entries = (dayLog.data ?? []).filter(item => item.status !== "aguardando" && item.status !== "recusado");

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Portaria</p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Entradas de hoje</h2>
          <p className="mt-1 text-sm text-ink-soft">Fornecedores e transportadoras que deram entrada no portão.</p>
        </div>
        <span className="w-fit rounded-lg bg-canvas px-3 py-1.5 font-display text-lg font-extrabold tabular-nums text-ink">
          {entries.length}
        </span>
      </div>
      {dayLog.isLoading ? (
        <p className="px-5 py-6 text-sm text-ink-soft sm:px-7">Consultando a portaria...</p>
      ) : entries.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-canvas">
              <tr className="[&>th]:px-5 [&>th]:py-3 [&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.1em] [&>th]:text-ink-faint sm:[&>th]:px-7">
                <th>Transportadora</th>
                <th>Caminhão</th>
                <th>Atendimento</th>
                <th>Notas</th>
                <th>Entrada</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map(item => {
                const invoices = parseInvoiceNumbers(item.invoiceNumbersJson);
                return (
                  <tr key={item.id} className="align-top [&>td]:px-5 [&>td]:py-4 sm:[&>td]:px-7">
                    <td className="text-sm font-bold text-ink">{item.carrier}</td>
                    <td>
                      <p className="font-mono text-sm font-bold text-ink">{item.licensePlate}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">{item.driverName}</p>
                    </td>
                    <td>
                      <p className="text-sm text-ink">{serviceTypeCopy[item.serviceType]}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {classificationLabel(item.classification, item.classificationDetail)}
                      </p>
                    </td>
                    <td className="font-mono text-xs text-ink">{invoices.length ? invoices.join(", ") : "—"}</td>
                    <td className="text-xs text-ink-soft">{formatArrival(item.arrivalAt)}</td>
                    <td><AttendanceStatusBadge status={item.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-12 text-center sm:px-7">
          <DoorOpen className="mx-auto size-7 text-ink-faint" />
          <p className="mt-3 text-sm font-bold text-ink">Nenhuma entrada hoje</p>
          <p className="mt-1 text-sm text-ink-soft">Os caminhões liberados pela portaria aparecem aqui.</p>
        </div>
      )}
    </section>
  );
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function FilterSelect({ label, value, onChange, children }: { label: string; value: number; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-rvd-plum"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="bg-transparent text-sm font-extrabold outline-none">{children}</select></label>; }

function MetricCard({ label, value, amountCents, detail, icon: Icon, iconClass }: { label: string; value: number; amountCents: number; detail: string; icon: React.ComponentType<{ className?: string }>; iconClass: string }) { return <article className="panel p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><p className="max-w-44 text-xs font-bold uppercase tracking-[0.13em] text-ink-faint">{label}</p><span className={`rounded-xl p-2.5 ${iconClass}`}><Icon className="size-5" /></span></div><p className="mt-7 font-display text-4xl font-extrabold text-ink">{value}</p><p className="mt-1 text-sm font-bold text-ink-soft">{formatCurrency(amountCents)}</p><p className="mt-2 text-xs text-ink-soft">{detail}</p></article>; }

function EmptyChart({ month }: { month: string }) { return <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-canvas text-center"><PackageCheck className="size-8 text-rvd-plum" /><p className="mt-3 text-sm font-bold text-rvd-plum">Sem recebimentos em {month}</p><p className="mt-1 max-w-xs text-xs text-ink-soft">Os recebimentos confirmados aparecerão aqui por dia.</p></div>; }

function EmptyRanking({ month }: { month: string }) { return <div className="mt-6 flex min-h-44 flex-col items-center justify-center rounded-2xl bg-canvas text-center"><UsersRound className="size-8 text-rvd-plum" /><p className="mt-3 text-sm font-bold text-rvd-plum">Sem fornecedores no ranking</p><p className="mt-1 max-w-xs text-xs text-ink-soft">As notas recebidas em {month} formarão este ranking.</p></div>; }

function formatDuration(totalMinutes: number) { if (totalMinutes < 60) return `${totalMinutes} min`; const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return minutes ? `${hours}h ${minutes}min` : `${hours}h`; }
function formatCurrency(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
