import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { addCalendarMonths, calendarDateKey, getMonthCalendarDays, groupCalendarEntriesByDay, startOfMonth } from "@/lib/monthCalendar";
import { type PortalStatus, statusCopy } from "@/lib/portal";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import LoadingTruck from "../components/LoadingTruck";
import PortalLayout from "./PortalLayout";

const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const statusSurface: Record<PortalStatus, string> = {
  pending: "bg-rvd-blue-pale text-rvd-plum",
  scheduled: "bg-rvd-plum-pale text-rvd-plum",
  received: "bg-emerald-50 text-emerald-700",
  completed: "bg-rvd-blue text-rvd-plum",
  backlog: "bg-rvd-plum-pale text-rvd-plum",
  rejected: "bg-red-50 text-red-700",
};

function atStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatSelectedDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export default function CalendarPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const currentDate = new Date();
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(currentDate));
  const [selectedDate, setSelectedDate] = useState(() => atStartOfDay(currentDate));
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const range = useMemo(() => {
    const start = startOfMonth(displayMonth);
    const end = addCalendarMonths(start, 1);
    return { start: start.toISOString(), end: new Date(end.getTime() - 1).toISOString() };
  }, [displayMonth]);
  const calendar = trpc.calendar.list.useQuery(range);

  const monthDays = useMemo(() => getMonthCalendarDays(displayMonth), [displayMonth]);
  const appointmentsByDay = useMemo(() => groupCalendarEntriesByDay((calendar.data ?? []).filter(item => item.status !== "backlog")), [calendar.data]);
  const selectedAppointments = useMemo(() => (appointmentsByDay.get(calendarDateKey(selectedDate)) ?? []).slice().sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()), [appointmentsByDay, selectedDate]);

  useEffect(() => {
    if (auth.data?.role === "supplier") setLocation("/fornecedor");
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Carregando o calendário operacional" />;
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-white" />;

  const changeMonth = (amount: number) => {
    const nextMonth = addCalendarMonths(displayMonth, amount);
    setDisplayMonth(nextMonth);
    setSelectedDate(nextMonth);
  };
  const goToToday = () => {
    const today = new Date();
    setDisplayMonth(startOfMonth(today));
    setSelectedDate(atStartOfDay(today));
  };

  return (
    <PortalLayout user={auth.data} title="Calendário operacional" subtitle="Veja a quantidade por dia e selecione uma data para consultar horários e fornecedores." onLogout={() => logout.mutate()}>
      <div className="space-y-6">
        <section className="rounded-3xl border border-rvd-plum-soft bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Visão mensal</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold capitalize text-rvd-plum">{displayMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
              <p className="mt-1 text-sm text-rvd-plum/70">Clique em um dia para abrir os agendamentos programados.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => changeMonth(-1)} className="border border-rvd-plum-soft text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><ChevronLeft className="size-4" />Anterior</Button>
              <Button variant="ghost" onClick={goToToday} className="border border-rvd-plum-soft text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Hoje</Button>
              <Button variant="ghost" onClick={() => changeMonth(1)} className="border border-rvd-plum-soft text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Próximo<ChevronRight className="size-4" /></Button>
            </div>
          </div>

          <div className="mt-7 overflow-x-auto">
            <div className="min-w-[760px] overflow-hidden rounded-2xl border border-rvd-plum-soft">
              <div className="grid grid-cols-7 bg-rvd-plum-pale">
                {weekDays.map(day => <div key={day} className="border-r border-rvd-plum-soft px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum last:border-r-0">{day}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map(day => {
                  const dayKey = calendarDateKey(day);
                  const count = appointmentsByDay.get(dayKey)?.length ?? 0;
                  const isCurrentMonth = day.getMonth() === displayMonth.getMonth();
                  const isSelected = dayKey === calendarDateKey(selectedDate);
                  const isToday = dayKey === calendarDateKey(new Date());
                  return <button key={dayKey} type="button" aria-label={`${day.toLocaleDateString("pt-BR")}: ${count} ${count === 1 ? "agendamento" : "agendamentos"}`} onClick={() => setSelectedDate(atStartOfDay(day))} className={`min-h-24 border-b border-r border-rvd-plum-soft p-3 text-left transition last:border-r-0 hover:bg-rvd-plum-pale ${isSelected ? "bg-rvd-plum text-white hover:bg-rvd-plum" : "bg-white text-rvd-plum"} ${!isCurrentMonth ? "opacity-45" : ""}`}>
                    <span className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-extrabold ${isToday && !isSelected ? "bg-rvd-blue text-rvd-plum" : ""}`}>{day.getDate()}</span>
                    {count ? <><span className={`mt-3 block text-sm font-extrabold ${isSelected ? "text-white" : "text-rvd-plum"}`}>{count}</span><span className={`mt-0.5 block text-[10px] font-bold uppercase tracking-wide ${isSelected ? "text-white/80" : "text-rvd-plum/70"}`}>{count === 1 ? "agendamento" : "agendamentos"}</span></> : null}
                  </button>;
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-rvd-plum-soft bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-3 border-b border-rvd-plum-soft pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-rvd-plum-pale p-2.5 text-rvd-plum"><CalendarDays className="size-5" /></span>
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-rvd-plum">Programação do dia</p><h2 className="mt-1 font-display text-xl font-extrabold capitalize text-rvd-plum">{formatSelectedDate(selectedDate)}</h2></div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1.5 text-xs font-bold text-rvd-plum"><UsersRound className="size-3.5" />{selectedAppointments.length} {selectedAppointments.length === 1 ? "agendamento" : "agendamentos"}</span>
          </div>

          {calendar.isLoading ? <p className="py-12 text-center text-sm font-bold text-rvd-plum">Carregando programação...</p> : selectedAppointments.length ? <div className="mt-5 space-y-3">{selectedAppointments.map(item => {
            const scheduledFor = new Date(item.scheduledFor);
            const supplier = item.supplierName || "Fornecedor não informado";
            return <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-rvd-plum-soft bg-[#fcfbfd] p-4 sm:flex-row sm:items-center"><div className="flex min-w-20 items-center gap-2 text-rvd-plum"><Clock3 className="size-4" /><span className="font-display text-lg font-extrabold">{scheduledFor.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-rvd-plum">{supplier}</p><p className="mt-1 text-xs text-rvd-plum/75">{item.invoiceNumber ? `NF ${item.invoiceNumber}` : item.serviceType}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusSurface[item.status]}`}>{statusCopy[item.status]}</span></article>;
          })}</div> : <div className="flex min-h-48 flex-col items-center justify-center text-center"><CalendarDays className="size-8 text-rvd-plum" /><p className="mt-3 text-sm font-bold text-rvd-plum">Nenhum agendamento nesta data</p><p className="mt-1 text-xs text-rvd-plum/75">Escolha outro dia no calendário para consultar horários e fornecedores.</p></div>}
        </section>
      </div>
    </PortalLayout>
  );
}
