import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getAppointmentMomentForDisplay, type PortalStatus, formatAppointmentDate, statusCopy } from "@/lib/portal";
import { CalendarClock, CheckCircle2, ClipboardList, FileText, Lightbulb, MessageSquare, Send, Upload } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import AppointmentChatDialog from "../components/AppointmentChatDialog";
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

function nextStep(status: PortalStatus) {
  const steps: Record<PortalStatus, string> = {
    pending: "Aguarde a análise do Operador ou acompanhe as mensagens.",
    scheduled: "Agendamento confirmado. Prepare a entrega para o horário definido.",
    received: "Recebimento confirmado. A nota seguirá para a conclusão.",
    completed: "Processo concluído com sucesso.",
    backlog: "O agendamento está em fila de tratamento pelo Operador.",
    rejected: "Verifique a conversa para entender a orientação do Operador.",
  };
  return steps[status];
}

export default function SupplierDashboard() {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const agenda = trpc.appointments.list.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [xmlInputKey, setXmlInputKey] = useState(0);
  const [suggestionDate, setSuggestionDate] = useState("");
  const [suggestionTime, setSuggestionTime] = useState("");
  const [suggestionNotes, setSuggestionNotes] = useState("");
  const [chatTarget, setChatTarget] = useState<(typeof agenda.data extends (infer Item)[] | undefined ? Item : never) | null>(null);
  const createManual = trpc.appointments.createManualXml.useMutation({
    onSuccess: () => {
      toast.success("Agendamento enviado para análise.");
      setXmlFile(null); setXmlInputKey(key => key + 1); setSuggestionDate(""); setSuggestionTime(""); setSuggestionNotes("");
      utils.appointments.list.invalidate(); utils.suggestions.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const summary = useMemo(() => ({ pending: agenda.data?.filter(item => item.status === "pending").length ?? 0, scheduled: agenda.data?.filter(item => item.status === "scheduled").length ?? 0, received: agenda.data?.filter(item => item.status === "received").length ?? 0 }), [agenda.data]);

  useEffect(() => { if (auth.data && auth.data.role !== "supplier") setLocation("/operador"); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  useEffect(() => {
    const requestedId = Number(new URLSearchParams(window.location.search).get("chat"));
    if (!requestedId) return;
    const appointment = agenda.data?.find(item => item.id === requestedId);
    if (appointment) setChatTarget(appointment);
  }, [agenda.data, location]);
  if (!auth.data || auth.data.role !== "supplier") return <div className="min-h-screen bg-white" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!xmlFile) return toast.error("Selecione o XML da nota fiscal.");
    if (!xmlFile.name.toLowerCase().endsWith(".xml")) return toast.error("Envie apenas arquivo XML.");
    if (xmlFile.size > 2 * 1024 * 1024) return toast.error("O XML deve ter até 2 MB.");
    if ((suggestionDate && !suggestionTime) || (!suggestionDate && suggestionTime)) return toast.error("Preencha data e hora juntas ou deixe a sugestão em branco.");
    try {
      createManual.mutate({
        fileName: xmlFile.name,
        xmlBase64: await readAsBase64(xmlFile),
        suggestedFor: suggestionDate && suggestionTime ? new Date(`${suggestionDate}T${suggestionTime}:00`).toISOString() : undefined,
        suggestionNotes: suggestionNotes.trim() || undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar o XML.");
    }
  }

  return <PortalLayout user={auth.data} title="Meus agendamentos" subtitle="Envie a nota e acompanhe cada etapa com clareza." onLogout={() => logout.mutate()}>
    <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="h-fit overflow-hidden rounded-3xl bg-rvd-plum p-6 text-white sm:p-7">
        <div className="flex items-center gap-3"><span className="rounded-2xl bg-rvd-blue p-3 text-rvd-plum"><Upload className="size-5" /></span><div><p className="text-sm font-bold uppercase tracking-[0.12em] text-rvd-blue-pale">Novo agendamento</p><h2 className="mt-1 font-display text-xl font-extrabold">Envie sua nota fiscal</h2></div></div>
        <p className="mt-5 text-sm leading-6 text-white/90">Envie o XML da nota. Se desejar, inclua uma sugestão de data e horário para o Operador avaliar.</p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="rounded-2xl border border-white/45 bg-white/10 p-5"><FileText className="size-6 text-rvd-blue" /><Label htmlFor="invoice-xml" className="mt-4 block text-sm font-bold text-white">Arquivo XML da nota</Label><Input key={xmlInputKey} id="invoice-xml" type="file" accept=".xml,application/xml,text/xml" onChange={event => setXmlFile(event.target.files?.[0] ?? null)} className="mt-2 cursor-pointer border-white bg-white text-rvd-plum file:mr-3 file:rounded-lg file:border-0 file:bg-rvd-plum-pale file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-rvd-plum" />{xmlFile && <p className="mt-3 truncate text-xs font-bold text-rvd-blue-pale">Selecionado: {xmlFile.name}</p>}</div>
          <div className="rounded-2xl border border-white/35 bg-white/10 p-5"><div className="flex items-start gap-3"><Lightbulb className="mt-0.5 size-5 shrink-0 text-rvd-blue" /><div><p className="text-sm font-bold">Sugestão de agendamento <span className="font-normal text-white/75">(opcional)</span></p><p className="mt-1 text-xs leading-5 text-white/80">O Operador poderá aceitar a sugestão e preencherá o agendamento automaticamente.</p></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div><Label htmlFor="supplier-suggestion-date" className="text-xs font-bold text-white">Data</Label><Input id="supplier-suggestion-date" type="date" value={suggestionDate} onChange={event => setSuggestionDate(event.target.value)} className="mt-2 border-white bg-white text-rvd-plum" /></div><div><Label htmlFor="supplier-suggestion-time" className="text-xs font-bold text-white">Hora</Label><Input id="supplier-suggestion-time" type="time" value={suggestionTime} onChange={event => setSuggestionTime(event.target.value)} className="mt-2 border-white bg-white text-rvd-plum" /></div></div><Label htmlFor="supplier-suggestion-notes" className="mt-4 block text-xs font-bold text-white">Observação</Label><Textarea id="supplier-suggestion-notes" value={suggestionNotes} onChange={event => setSuggestionNotes(event.target.value)} maxLength={1000} placeholder="Ex.: preferimos o período da manhã." className="mt-2 min-h-24 border-white bg-white text-rvd-plum placeholder:text-rvd-plum/70" /></div>
          <Button type="submit" disabled={createManual.isPending} className="h-12 w-full rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale active:scale-[0.97]">{createManual.isPending ? "Enviando..." : <>Enviar agendamento <Send className="size-4" /></>}</Button>
        </form>
      </section>
      <section className="rounded-3xl border border-rvd-plum-soft bg-white p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-center gap-3"><span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum"><ClipboardList className="size-5" /></span><div><p className="text-sm font-bold uppercase tracking-[0.12em] text-rvd-plum">Acompanhamento</p><h2 className="mt-1 font-display text-xl font-extrabold text-rvd-plum">Histórico de agendamentos</h2><p className="mt-1 text-sm text-rvd-plum">Veja o status e a próxima etapa de cada envio.</p></div></div><div className="flex gap-2"><SummaryBadge label="Em análise" value={summary.pending} /><SummaryBadge label="Agendados" value={summary.scheduled} /><SummaryBadge label="Recebidos" value={summary.received} /></div></div>{agenda.isLoading ? <div className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando histórico...</div> : agenda.data?.length ? <div className="mt-7 space-y-3">{agenda.data.map(item => { const status = item.status as PortalStatus; const shownAt = getAppointmentMomentForDisplay({ status, scheduledFor: item.scheduledFor, receivedAt: item.receivedAt }); const received = status === "received" && Boolean(item.receivedAt); return <article key={item.id} className="rounded-2xl border border-rvd-plum-soft p-4 transition hover:border-rvd-plum"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-display text-lg font-extrabold text-rvd-plum">{item.invoiceNumber ? `Nota ${item.invoiceNumber}` : item.serviceType}</p><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold text-rvd-plum ${badgeStyle[status]}`}>{statusCopy[status]}</span></div><p className="mt-2 flex items-center gap-2 text-sm font-semibold text-rvd-plum"><CalendarClock className="size-4" />{formatAppointmentDate(shownAt)}{received && <span className="text-[10px] uppercase tracking-wide">Recebido em</span>}</p><p className="mt-2 text-xs leading-5 text-rvd-plum">{nextStep(status)}</p>{item.source === "manual_xml" && <p className="mt-3 text-xs font-semibold text-rvd-plum">{item.xmlUrl && <a href={item.xmlUrl} target="_blank" rel="noreferrer" className="underline">Ver XML enviado</a>}</p>}</div><Button onClick={() => setChatTarget(item)} variant="ghost" className="h-9 shrink-0 rounded-xl border border-rvd-plum-soft px-3 text-xs font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><MessageSquare className="size-4" />Conversar</Button></div></article>; })}</div> : <div className="mt-7 rounded-2xl bg-rvd-plum-pale px-6 py-14 text-center"><CheckCircle2 className="mx-auto size-8 text-rvd-plum" /><h3 className="mt-4 font-display text-lg font-extrabold text-rvd-plum">Ainda não há envios</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-rvd-plum">Envie o XML da sua primeira nota para iniciar um agendamento.</p></div>}</section>
    </div>
    <AppointmentChatDialog appointment={chatTarget} currentUserId={auth.data.id} open={Boolean(chatTarget)} onOpenChange={open => { if (!open) { setChatTarget(null); if (window.location.search.includes("chat=")) setLocation("/fornecedor"); } }} />
  </PortalLayout>;
}

function SummaryBadge({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-rvd-plum-pale px-3 py-2 text-center"><p className="text-lg font-extrabold text-rvd-plum">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-rvd-plum">{label}</p></div>;
}
