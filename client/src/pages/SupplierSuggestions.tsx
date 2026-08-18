import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatAppointmentDate } from "@/lib/portal";
import { CalendarClock, Lightbulb, Send } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

export default function SupplierSuggestions() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const appointments = trpc.appointments.list.useQuery();
  const suggestions = trpc.suggestions.list.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const eligible = useMemo(() => appointments.data?.filter(item => item.status === "pending" || item.status === "scheduled" || item.status === "backlog") ?? [], [appointments.data]);
  const [appointmentId, setAppointmentId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const create = trpc.suggestions.create.useMutation({
    onSuccess: () => {
      toast.success("Sugestão enviada ao operador.");
      setDate(""); setTime(""); setNotes("");
      utils.suggestions.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data && auth.data.role !== "supplier") setLocation("/operador");
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);
  useEffect(() => {
    if (!appointmentId && eligible[0]) setAppointmentId(String(eligible[0].id));
  }, [appointmentId, eligible]);

  if (!auth.data || auth.data.role !== "supplier") return <div className="min-h-screen bg-white" />;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!appointmentId || !date || !time) return toast.error("Selecione o agendamento, a data e o horário sugeridos.");
    create.mutate({ appointmentId: Number(appointmentId), suggestedFor: new Date(`${date}T${time}:00`).toISOString(), notes: notes || undefined });
  }

  return <PortalLayout user={auth.data} title="Sugestões de agendamento" subtitle="Envie horários que funcionam para sua operação."><div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]"><section className="h-fit rounded-3xl bg-rvd-plum p-6 text-white sm:p-7"><div className="flex items-center gap-3"><span className="rounded-2xl bg-rvd-blue p-3 text-rvd-plum"><Lightbulb className="size-5" /></span><div><p className="text-sm font-bold uppercase tracking-[0.12em] text-rvd-blue-pale">Fornecedor</p><h2 className="mt-1 font-display text-xl font-extrabold">Sugerir data e horário</h2></div></div>{eligible.length ? <form onSubmit={submit} className="mt-7 space-y-4"><div><Label className="text-sm font-bold text-white">Agendamento</Label><Select value={appointmentId} onValueChange={setAppointmentId}><SelectTrigger className="mt-2 border-white bg-white text-rvd-plum"><SelectValue /></SelectTrigger><SelectContent>{eligible.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.serviceType} · {formatAppointmentDate(item.scheduledFor)}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label className="text-sm font-bold text-white">Data</Label><Input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-2 border-white bg-white text-rvd-plum" /></div><div><Label className="text-sm font-bold text-white">Horário</Label><Input type="time" value={time} onChange={event => setTime(event.target.value)} className="mt-2 border-white bg-white text-rvd-plum" /></div></div><div><Label className="text-sm font-bold text-white">Observação</Label><Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: preferimos a primeira janela disponível." className="mt-2 min-h-28 border-white bg-white text-rvd-plum placeholder:text-rvd-plum/70" /></div><Button type="submit" disabled={create.isPending} className="h-11 w-full rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale">{create.isPending ? "Enviando..." : <>Enviar sugestão <Send className="size-4" /></>}</Button></form> : <div className="mt-7 rounded-2xl bg-white/10 p-5 text-center"><CalendarClock className="mx-auto size-7 text-rvd-blue" /><p className="mt-3 text-sm font-bold">Nenhum agendamento elegível</p><p className="mt-2 text-xs leading-5 text-white/85">As sugestões ficam disponíveis para itens pendentes, agendados ou em backlog.</p></div>}</section><section className="rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7"><p className="text-sm font-bold uppercase tracking-[0.14em] text-rvd-plum">Acompanhamento</p><h2 className="mt-2 font-display text-xl font-extrabold text-rvd-plum">Minhas sugestões</h2>{suggestions.isLoading ? <div className="py-16 text-center text-sm font-bold text-rvd-plum">Carregando sugestões...</div> : suggestions.data?.length ? <div className="mt-6 space-y-3">{suggestions.data.map(item => <article key={item.id} className="rounded-2xl border border-rvd-plum-soft p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold text-rvd-plum">{item.serviceType}</p><span className="rounded-full bg-rvd-blue-pale px-3 py-1 text-xs font-bold text-rvd-plum">{item.status === "pending" ? "Em análise" : item.status === "accepted" ? "Aceita" : "Recusada"}</span></div><p className="mt-2 text-sm text-rvd-plum">{formatAppointmentDate(item.suggestedFor)}</p>{item.notes && <p className="mt-2 text-xs leading-5 text-rvd-plum">{item.notes}</p>}</article>)}</div> : <div className="mt-6 rounded-2xl bg-rvd-plum-pale p-7 text-center"><Lightbulb className="mx-auto size-7 text-rvd-plum" /><p className="mt-3 text-sm font-bold text-rvd-plum">Ainda não há sugestões enviadas</p></div>}</section></div></PortalLayout>;
}
