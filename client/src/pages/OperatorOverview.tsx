import LoadingTruck from "@/components/LoadingTruck";
import { trpc } from "@/lib/trpc";
import { CalendarDays, Clock3, PackageCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

  useEffect(() => {
    if (auth.data?.role === "supplier") setLocation("/fornecedor");
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Preparando o dashboard" />;
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-white" />;

  const data = analytics.data;
  const canViewFinancial = Boolean(data?.canViewFinancial && auth.data.role === "admin");
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(year, month - 1, 1));
  const yearOptions = Array.from({ length: 5 }, (_, index) => today.getFullYear() - 2 + index);

  return (
    <PortalLayout user={auth.data} title="Dashboard" subtitle="Acompanhe indicadores, recebimentos e prioridades da operação." onLogout={() => logout.mutate()}>
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-rvd-plum-soft bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rvd-plum">Visão operacional</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold capitalize text-rvd-plum">{monthName} de {year}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="Mês" value={month} onChange={value => setMonth(Number(value))}>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </FilterSelect>
            <FilterSelect label="Ano" value={year} onChange={value => setYear(Number(value))}>
              {yearOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </FilterSelect>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <MetricCard label="Pendentes de Agendamento" value={data?.pendingCount ?? 0} amountCents={data?.pendingTotalCents} showFinancial={canViewFinancial} detail="Aguardam confirmação" icon={Clock3} iconClass="bg-amber-50 text-amber-500" />
          <MetricCard label="Agendadas" value={data?.scheduledCount ?? 0} amountCents={data?.scheduledTotalCents} showFinancial={canViewFinancial} detail={`Confirmadas em ${monthName}`} icon={CalendarDays} iconClass="bg-rvd-lilac-blue text-rvd-plum" />
          <MetricCard label="Recebidas" value={data?.receivedCount ?? 0} amountCents={data?.receivedTotalCents} showFinancial={canViewFinancial} detail={`Notas recebidas em ${monthName}`} icon={PackageCheck} iconClass="bg-emerald-50 text-emerald-600" />
        </section>

        <section className="rounded-3xl border border-rvd-plum-soft bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-rvd-plum">Recebimentos</p>
              <h2 className="mt-1 font-display text-xl font-extrabold text-rvd-plum">Notas recebidas por dia</h2>
              <p className="mt-1 text-sm text-rvd-plum/70">{canViewFinancial ? "Quantidade de notas e valor total das NFs recebidas." : "Quantidade de notas recebidas no período selecionado."}</p>
            </div>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><PackageCheck className="size-5" /></span>
          </div>
          <div className="mt-5 h-72">
            {data?.dailyReceived.some(item => item.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.dailyReceived} margin={{ top: 22, right: canViewFinancial ? 34 : 4, left: -22, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f2e7f2" />
                  <XAxis dataKey="label" interval="preserveStartEnd" tickLine={false} axisLine={false} tick={{ fill: "#782078", fontSize: 11 }} />
                  <YAxis yAxisId="notes" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#a28aa4", fontSize: 11 }} />
                  {canViewFinancial ? <YAxis yAxisId="value" orientation="right" tickLine={false} axisLine={false} tick={{ fill: "#782078", fontSize: 10 }} tickFormatter={formatCompactCurrency} /> : null}
                  <Tooltip cursor={{ fill: "#f8f0f8" }} contentStyle={{ borderRadius: 14, borderColor: "#e9d4ea" }} formatter={(value: number, name: string) => name === "Valor das NFs" ? [formatCurrency(value), name] : [value, "Notas recebidas"]} />
                  <Bar yAxisId="notes" dataKey="total" name="Notas recebidas" fill="#39c99b" radius={[6, 6, 2, 2]} maxBarSize={30}>
                    <LabelList dataKey="total" position="top" fill="#169b75" fontSize={11} formatter={(value: number) => value || ""} />
                  </Bar>
                  {canViewFinancial ? <Line yAxisId="value" type="monotone" dataKey="totalCents" name="Valor das NFs" stroke="#782078" strokeWidth={3} dot={{ r: 3, fill: "#782078" }} activeDot={{ r: 5 }} /> : null}
                </ComposedChart>
              </ResponsiveContainer>
            ) : <EmptyChart month={monthName} />}
          </div>
        </section>

        <section className="flex min-h-[16rem] flex-col rounded-3xl border border-rvd-plum-soft bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-rvd-plum">Tempo médio de espera</p>
              <h2 className="mt-1 font-display text-xl font-extrabold text-rvd-plum">Pendentes sem agendamento</h2>
            </div>
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-500"><Clock3 className="size-5" /></span>
          </div>
          <div className="my-auto py-8 text-center">
            <p className="text-sm text-rvd-plum/70">O tempo médio de agendamento é de</p>
            <p className="mt-2 font-display text-5xl font-extrabold text-rvd-plum">{formatDuration(data?.averageWaitMinutes ?? 0)}</p>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-rvd-plum/70">Baseado em {data?.pendingBasis ?? 0} notas pendentes</p>
          </div>
        </section>

        <section className="rounded-3xl border border-rvd-plum-soft bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Acesso rápido</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold text-rvd-plum">Central de agendamentos</h2>
              <p className="mt-2 max-w-xl text-sm text-rvd-plum">Filtre notas, atualize status, agende recebimentos e acompanhe o calendário da operação.</p>
            </div>
            <button onClick={() => setLocation("/operador")} className="rounded-xl bg-rvd-plum px-5 py-3 text-sm font-bold text-white">Abrir agendamentos</button>
          </div>
        </section>
      </div>
    </PortalLayout>
  );
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function FilterSelect({ label, value, onChange, children }: { label: string; value: number; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="flex items-center gap-2 rounded-xl border border-rvd-plum-soft bg-white px-3 py-2 text-xs font-bold text-rvd-plum"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="bg-transparent text-sm font-extrabold outline-none">{children}</select></label>;
}

function MetricCard({ label, value, amountCents, showFinancial, detail, icon: Icon, iconClass }: { label: string; value: number; amountCents: number | null | undefined; showFinancial: boolean; detail: string; icon: React.ComponentType<{ className?: string }>; iconClass: string }) {
  return <article className="rounded-3xl border border-rvd-plum-soft bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><p className="max-w-44 text-xs font-bold uppercase tracking-[0.13em] text-rvd-plum">{label}</p><span className={`rounded-xl p-2.5 ${iconClass}`}><Icon className="size-5" /></span></div><p className="mt-7 font-display text-4xl font-extrabold text-rvd-plum">{value}</p>{showFinancial && amountCents !== null && amountCents !== undefined ? <p className="mt-1 text-sm font-bold text-rvd-plum/75">{formatCurrency(amountCents)}</p> : null}<p className={`${showFinancial ? "mt-2" : "mt-1"} text-xs text-rvd-plum/70`}>{detail}</p></article>;
}

function EmptyChart({ month }: { month: string }) {
  return <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-rvd-plum-pale/60 text-center"><PackageCheck className="size-8 text-rvd-plum" /><p className="mt-3 text-sm font-bold text-rvd-plum">Sem recebimentos em {month}</p><p className="mt-1 max-w-xs text-xs text-rvd-plum/75">Os recebimentos confirmados aparecerão aqui por dia.</p></div>;
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatCompactCurrency(cents: number) {
  if (!cents) return "R$ 0";
  if (Math.abs(cents) >= 100_000) return `R$ ${(cents / 100_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return formatCurrency(cents);
}
