import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { type PortalStatus, formatAppointmentDate, statusCopy } from "@/lib/portal";
import { CalendarPlus, ClipboardList, FileText, Send, Upload } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

const badgeStyle: Record<PortalStatus, string> = { pending: "bg-rvd-blue-pale", scheduled: "bg-rvd-plum-pale", received: "bg-rvd-lilac-blue", completed: "bg-rvd-blue", backlog: "bg-rvd-plum-pale", rejected: "bg-rvd-lilac-blue" };

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo XML."));
    reader.readAsDataURL(file);
  });
}

export default function SupplierDashboard() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const agenda = trpc.appointments.list.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const [mode, setMode] = useState<"portal" | "manual">("portal");
  const [serviceType, setServiceType] = useState("Consulta");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [xmlInputKey, setXmlInputKey] = useState(0);
  const create = trpc.appointments.create.useMutation({
    onSuccess: () => { toast.success("Solicitação enviada para avaliação."); setDate(""); setTime(""); setNotes(""); utils.appointments.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const createManual = trpc.appointments.createManualXml.useMutation({
    onSuccess: () => { toast.success("Agendamento manual criado a partir do XML."); setXmlFile(null); setXmlInputKey(key => key + 1); utils.appointments.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => { if (auth.data && auth.data.role !== "supplier") setLocation("/operador"); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  if (!auth.data || auth.data.role !== "supplier") return <div className="min-h-screen bg-white" />;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!date || !time) return toast.error("Informe a data e o horário desejados.");
    create.mutate({ serviceType, scheduledFor: new Date(`${date}T${time}:00`).toISOString(), notes: notes || undefined });
  }

  async function submitManual(event: FormEvent) {
    event.preventDefault();
    if (!xmlFile) return toast.error("Selecione o XML da nota fiscal.");
    if (!xmlFile.name.toLowerCase().endsWith(".xml")) return toast.error("Envie apenas arquivo XML.");
    if (xmlFile.size > 2 * 1024 * 1024) return toast.error("O XML deve ter até 2 MB.");
    try {
      createManual.mutate({ fileName: xmlFile.name, xmlBase64: await readAsBase64(xmlFile) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar o XML.");
    }
  }

  return <PortalLayout user={auth.data} title="Meus agendamentos" subtitle="Solicite e acompanhe seus atendimentos." onLogout={() => logout.mutate()}>
    <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="h-fit rounded-3xl bg-rvd-plum p-6 text-white sm:p-7">
        <div className="flex items-center gap-3"><span className="rounded-2xl bg-rvd-blue p-3 text-rvd-plum">{mode === "manual" ? <FileText className="size-5" /> : <CalendarPlus className="size-5" />}</span><div><p className="text-sm font-bold uppercase tracking-[0.12em] text-rvd-blue-pale">Nova solicitação</p><h2 className="mt-1 font-display text-xl font-extrabold">{mode === "manual" ? "Agendamento Manual" : "Agende um atendimento"}</h2></div></div>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-white/15 p-1"><button type="button" onClick={() => setMode("portal")} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${mode === "portal" ? "bg-white text-rvd-plum" : "text-white"}`}>Portal</button><button type="button" onClick={() => setMode("manual")} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${mode === "manual" ? "bg-white text-rvd-plum" : "text-white"}`}>Manual · XML</button></div>
        {mode === "portal" ? <form onSubmit={submit} className="mt-7 space-y-4"><div><Label className="text-sm font-bold text-white">Tipo de serviço</Label><Select value={serviceType} onValueChange={setServiceType}><SelectTrigger className="mt-2 border-white bg-white text-rvd-plum"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Consulta">Consulta</SelectItem><SelectItem value="Exame">Exame</SelectItem><SelectItem value="Avaliação">Avaliação</SelectItem><SelectItem value="Procedimento">Procedimento</SelectItem></SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="schedule-date" className="text-sm font-bold text-white">Data</Label><Input id="schedule-date" type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-2 border-white bg-white text-rvd-plum" /></div><div><Label htmlFor="schedule-time" className="text-sm font-bold text-white">Horário</Label><Input id="schedule-time" type="time" value={time} onChange={event => setTime(event.target.value)} className="mt-2 border-white bg-white text-rvd-plum" /></div></div><div><Label htmlFor="notes" className="text-sm font-bold text-white">Observações</Label><Textarea id="notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} placeholder="Inclua informações importantes para o atendimento." className="mt-2 min-h-28 border-white bg-white text-rvd-plum placeholder:text-rvd-plum/70" /></div><Button type="submit" disabled={create.isPending} className="h-11 w-full rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale active:scale-[0.97]">{create.isPending ? "Enviando..." : <>Enviar solicitação <Send className="size-4" /></>}</Button></form> : <form onSubmit={submitManual} className="mt-7"><div className="rounded-2xl border border-white/50 bg-white/10 p-5"><Upload className="size-6 text-rvd-blue" /><h3 className="mt-4 font-display text-lg font-extrabold">Somente o XML da nota</h3><p className="mt-2 text-sm leading-6 text-white/90">Envie o XML da nota fiscal. A identificação da nota e a descrição disponível são lidas automaticamente, sem campos adicionais.</p><Label htmlFor="invoice-xml" className="mt-5 block text-sm font-bold text-white">Arquivo XML</Label><Input key={xmlInputKey} id="invoice-xml" type="file" accept=".xml,application/xml,text/xml" onChange={event => setXmlFile(event.target.files?.[0] ?? null)} className="mt-2 cursor-pointer border-white bg-white text-rvd-plum file:mr-3 file:rounded-lg file:border-0 file:bg-rvd-plum-pale file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-rvd-plum" />{xmlFile && <p className="mt-3 truncate text-xs font-bold text-rvd-blue-pale">Selecionado: {xmlFile.name}</p>}</div><Button type="submit" disabled={createManual.isPending} className="mt-4 h-11 w-full rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale active:scale-[0.97]">{createManual.isPending ? "Lendo XML..." : <>Criar agendamento manual <FileText className="size-4" /></>}</Button></form>}
      </section>
      <section className="rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7"><div className="flex items-center gap-3"><span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum"><ClipboardList className="size-5" /></span><div><p className="text-sm font-bold uppercase tracking-[0.12em] text-rvd-plum">Acompanhamento</p><h2 className="mt-1 font-display text-xl font-extrabold text-rvd-plum">Histórico de solicitações</h2></div></div>{agenda.isLoading ? <div className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando histórico...</div> : agenda.data?.length ? <div className="mt-7 space-y-3">{agenda.data.map(item => <article key={item.id} className="rounded-2xl border border-rvd-plum-soft p-4 sm:flex sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-rvd-plum">{item.serviceType}</p>{item.source === "manual_xml" && <span className="rounded-full bg-rvd-blue-pale px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">Manual · XML</span>}</div><p className="mt-1 text-sm text-rvd-plum">{formatAppointmentDate(item.scheduledFor)}</p>{item.source === "manual_xml" && <p className="mt-2 text-xs font-semibold text-rvd-plum">{item.invoiceNumber ? `Nota ${item.invoiceNumber}` : "Nota fiscal XML"}{item.xmlUrl && <a href={item.xmlUrl} target="_blank" rel="noreferrer" className="ml-3 underline">Ver XML</a>}</p>}{item.notes && item.source !== "manual_xml" && <p className="mt-2 text-xs leading-5 text-rvd-plum">{item.notes}</p>}</div><span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold text-rvd-plum sm:mt-0 ${badgeStyle[item.status as PortalStatus]}`}>{statusCopy[item.status as PortalStatus]}</span></article>)}</div> : <div className="mt-7 rounded-2xl bg-rvd-plum-pale px-6 py-14 text-center"><ClipboardList className="mx-auto size-8 text-rvd-plum" /><h3 className="mt-4 font-display text-lg font-extrabold text-rvd-plum">Ainda não há solicitações</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-rvd-plum">Use o formulário ao lado para registrar seu primeiro agendamento.</p></div>}</section>
    </div>
  </PortalLayout>;
}
