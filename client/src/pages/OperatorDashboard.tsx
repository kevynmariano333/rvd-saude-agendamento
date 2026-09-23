import { SegmentedControl } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getAppointmentMomentForDisplay, hasConfirmedAppointmentMoment, type PortalStatus, formatAppointmentDate, sourceCopy, statusCopy, homePathFor, isPortalOperator, isPortalSchedulingDesk, type PortalRole } from "@/lib/portal";
import { isScheduledForDate } from "@/lib/agendaFilters";
import { formatSaoPauloDateKey } from "@shared/dateFilters";
import { filtroDeDestinatario, rotuloDoDestinatario } from "@shared/recipients";
import { pedidoEhUrgente, pedidosDaNota } from "@shared/purchaseOrders";
import UrgenciaBadge from "../components/UrgenciaBadge";
import { MOTIVOS_DE_BACKLOG } from "@shared/backlogReasons";
import { AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ClipboardCheck, FileText, Filter, Grid2X2, MessageSquare, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import AppointmentDateHistoryDialog from "../components/AppointmentDateHistoryDialog";
import AppointmentChatDialog, { type ChatAppointment } from "../components/AppointmentChatDialog";
import AppointmentDetailsDialog, { type AppointmentDetail } from "../components/AppointmentDetailsDialog";
import LoadingTruck from "../components/LoadingTruck";
import UnscheduledReceiptDialog from "../components/UnscheduledReceiptDialog";
import PortalLayout from "./PortalLayout";

type Appointment = AppointmentDetail;
type StatusTab = "all" | PortalStatus;

const tabs: { id: StatusTab; label: string; icon: typeof Grid2X2 }[] = [
  { id: "all", label: "Todos", icon: Grid2X2 }, { id: "pending", label: "Pendente", icon: RotateCcw }, { id: "scheduled", label: "Agendado", icon: CalendarDays }, { id: "received", label: "Recebido", icon: ClipboardCheck }, { id: "completed", label: "Concluído", icon: CheckCircle2 }, { id: "backlog", label: "Backlog", icon: AlertTriangle }, { id: "rejected", label: "Rejeitado", icon: X },
];
const statusStyle: Record<PortalStatus, string> = { pending: "bg-rvd-blue-pale text-rvd-plum", scheduled: "bg-rvd-plum-pale text-rvd-plum", received: "bg-rvd-lilac-blue text-rvd-plum", completed: "bg-rvd-blue text-rvd-plum", backlog: "bg-rvd-plum-pale text-rvd-plum", rejected: "bg-rvd-lilac-blue text-rvd-plum" };

function todayValue() { return formatSaoPauloDateKey(); }
function tomorrowValue() { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); return formatSaoPauloDateKey(tomorrow); }
function datePart(value: Date | string) { return new Date(value).toLocaleDateString("en-CA"); }

/** Quantas linhas a tabela pede por vez. */
const PAGINA = 100;

export default function OperatorDashboard() {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const [activeStatus, setActiveStatus] = useState<StatusTab>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [date, setDate] = useState("");
  const [dailyFilterDate, setDailyFilterDate] = useState<string | null>(null);
  const [tomorrowFilterDate, setTomorrowFilterDate] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [recipientCnpj, setRecipientCnpj] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [details, setDetails] = useState<Appointment | null>(null);
  const [dateHistory, setDateHistory] = useState<Appointment | null>(null);
  const [preNoteTarget, setPreNoteTarget] = useState<Appointment | null>(null);
  // A conversa é aberta por uma linha da lista ou por link direto, e o que
  // ela precisa cabe em quatro campos.
  const [chatTarget, setChatTarget] = useState<ChatAppointment | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(() => new URLSearchParams(window.location.search).get("modal") === "receipt");
  const [scheduleDate, setScheduleDate] = useState(todayValue());
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [acceptedSuggestionId, setAcceptedSuggestionId] = useState<number | undefined>();
  const [finalizeTarget, setFinalizeTarget] = useState<Appointment | null>(null);
  const [finalizeMode, setFinalizeMode] = useState<"sucesso" | "problema">("sucesso");
  const [miro, setMiro] = useState("");
  const [finalizeNote, setFinalizeNote] = useState("");
  const [finalizeReason, setFinalizeReason] = useState("");
  const [suggestTarget, setSuggestTarget] = useState<Appointment | null>(null);
  const [suggestDate, setSuggestDate] = useState("");
  const [suggestTime, setSuggestTime] = useState("");
  const [suggestNotes, setSuggestNotes] = useState("");
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  // A tabela mostra um punhado de linhas por vez. Sem teto, cada abertura
  // trazia as milhares de notas do acervo para exibir as primeiras cinquenta.
  const [limite, setLimite] = useState(PAGINA);
  const listInput = useMemo(() => ({ limit: limite, date: date || dailyFilterDate || tomorrowFilterDate || undefined, status: activeStatus === "all" ? undefined : activeStatus, invoiceNumber: invoiceNumber || undefined, supplierName: supplierName || undefined, recipientCnpj: filtroDeDestinatario(recipientCnpj) || undefined }), [activeStatus, dailyFilterDate, date, invoiceNumber, limite, recipientCnpj, supplierName, tomorrowFilterDate]);
  // Trocar de aba ou de filtro recomeça a contagem: a página 3 de uma busca não
  // é a página 3 da seguinte.
  useEffect(() => { setLimite(PAGINA); }, [activeStatus, dailyFilterDate, date, invoiceNumber, recipientCnpj, supplierName, tomorrowFilterDate]);
  const agenda = trpc.appointments.list.useQuery(listInput);
  // As contagens das abas vêm contadas do banco. Antes a tela baixava a tabela
  // inteira só para exibir sete números.
  const contagens = trpc.appointments.counts.useQuery();
  const activeSupplier = trpc.appointments.activeForSupplier.useQuery({ supplierId: selected?.supplierId ?? 1 }, { enabled: Boolean(selected) });
  const pendingSuggestions = trpc.suggestions.list.useQuery({ appointmentId: selected?.id ?? 1, status: "pending" }, { enabled: Boolean(selected) });
  const updateStatus = trpc.appointments.updateStatus.useMutation({ onSuccess: () => { toast.success("Status atualizado."); setFinalizeTarget(null); utils.appointments.list.invalidate(); utils.calendar.list.invalidate(); }, onError: error => toast.error(error.message) });
  const rescue = trpc.appointments.rescue.useMutation({ onSuccess: () => { toast.success("Item resgatado para novo tratamento."); utils.appointments.list.invalidate(); }, onError: error => toast.error(error.message) });
  const schedule = trpc.appointments.schedule.useMutation({ onSuccess: () => { toast.success("Agendamento confirmado."); setSelected(null); setAcceptedSuggestionId(undefined); utils.appointments.list.invalidate(); utils.calendar.list.invalidate(); utils.suggestions.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createSuggestion = trpc.suggestions.create.useMutation({ onSuccess: () => { toast.success("Sugestão enviada ao Operador."); setSuggestTarget(null); setSuggestNotes(""); utils.suggestions.list.invalidate(); }, onError: error => toast.error(error.message) });
  const confirmPreNote = trpc.appointments.confirmPreNote.useMutation({ onSuccess: () => { toast.success("Pré-nota confirmada com sucesso."); setPreNoteTarget(null); utils.appointments.list.invalidate(); }, onError: error => toast.error(error.message) });

  useEffect(() => { if (auth.data && !isPortalSchedulingDesk(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole)); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  // Abrir a conversa por link (?chat=123) busca aquela nota, e não a tabela
  // inteira para procurar dentro dela.
  const notaDoLink = Number(new URLSearchParams(window.location.search).get("chat")) || 0;
  const notaPedidaPeloLink = trpc.appointments.byId.useQuery({ appointmentId: notaDoLink }, { enabled: notaDoLink > 0 });
  useEffect(() => {
    const nota = notaPedidaPeloLink.data;
    if (!nota) return;
    setChatTarget({ id: nota.id, invoiceNumber: nota.invoiceNumber, serviceType: nota.serviceType, invoiceSupplierName: nota.invoiceSupplierName });
  }, [notaPedidaPeloLink.data, location]);
  const shortcutDate = dailyFilterDate || tomorrowFilterDate;
  // O backlog é o que travou e precisa voltar para a fila. Continua fora das
  // outras abas para não inflar a contagem do dia, mas agora tem a sua.
  const visibleAgenda = useMemo(() => agenda.data?.filter(item => (activeStatus === "backlog" || item.status !== "backlog") && (!shortcutDate || isScheduledForDate(item.scheduledFor, shortcutDate))) ?? [], [activeStatus, agenda.data, shortcutDate]);
  const counters = useMemo(() => {
    const porStatus: Record<string, number> = contagens.data ?? {};
    const de = (status: string) => porStatus[status] ?? 0;
    // "Todos" é tudo menos o backlog, que tem aba e fila próprias.
    const total = Object.entries(porStatus).reduce((soma, [status, quantidade]) => (status === "backlog" ? soma : soma + quantidade), 0);
    return { all: total, pending: de("pending"), scheduled: de("scheduled"), received: de("received"), completed: de("completed"), backlog: de("backlog"), rejected: de("rejected") };
  }, [contagens.data]);
  const isTodayFilterApplied = Boolean(dailyFilterDate);
  const isTomorrowFilterApplied = Boolean(tomorrowFilterDate);
  const dayShortcut: "todos" | "hoje" | "amanha" = isTodayFilterApplied
    ? "hoje"
    : isTomorrowFilterApplied
      ? "amanha"
      : "todos";

  /** Um atalho de data por vez, e escolher "Todos" limpa a data digitada. */
  function applyDayShortcut(next: "todos" | "hoje" | "amanha") {
    setDailyFilterDate(next === "hoje" ? todayValue() : null);
    setTomorrowFilterDate(next === "amanha" ? tomorrowValue() : null);
    setDate("");
    setActiveStatus("all");
  }
  if (auth.isLoading) return <LoadingTruck label="Preparando a central do operador" />;
  if (!auth.data || !isPortalSchedulingDesk(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  // O planejador chega até aqui, mas a data quem crava é o Operador: para ele o
  // botão de agendar vira um pedido, que entra na mesma fila das sugestões do
  // fornecedor e espera o aceite.
  const podeConfirmar = isPortalOperator(auth.data.role as PortalRole);

  const clearFilters = () => { setDate(""); setDailyFilterDate(null); setTomorrowFilterDate(null); setInvoiceNumber(""); setSupplierName(""); setRecipientCnpj(""); setActiveStatus("all"); };
  const openSchedule = (item: Appointment) => {
    if (!podeConfirmar) { setSuggestTarget(item); setSuggestDate(""); setSuggestTime(""); setSuggestNotes(""); return; }
    setSelected(item); setScheduleDate(""); setScheduleTime(""); setAcceptedSuggestionId(undefined);
  };
  const openFinalize = (item: Appointment) => { setFinalizeTarget(item); setFinalizeMode("sucesso"); setMiro(""); setFinalizeNote(""); setFinalizeReason(""); };
  const confirmFinalize = () => {
    if (!finalizeTarget) return;
    if (finalizeMode === "problema") {
      // As mesmas exigências do servidor, aqui só para responder na hora.
      if (!finalizeReason) return toast.error("Selecione o motivo do backlog.");
      if (!finalizeNote.trim()) return toast.error("Descreva o que houve.");
      updateStatus.mutate({ appointmentId: finalizeTarget.id, status: "backlog", backlogReasonCode: finalizeReason, note: finalizeNote.trim() });
      return;
    }
    // A mesma regra do servidor, aqui só para responder na hora em vez de
    // depois da ida e volta.
    if (!/^\d{10}$/.test(miro.replace(/\s/g, ""))) return toast.error("O número MIRO deve ter exatamente 10 dígitos.");
    updateStatus.mutate({ appointmentId: finalizeTarget.id, status: "completed", miroNumber: miro });
  };
  const confirmSuggestion = () => {
    if (!suggestTarget || !suggestDate || !suggestTime) return toast.error("Informe a data e a hora que você sugere.");
    createSuggestion.mutate({ appointmentId: suggestTarget.id, suggestedFor: new Date(`${suggestDate}T${suggestTime}:00`).toISOString(), notes: suggestNotes.trim() || undefined });
  };
  const acceptSuggestion = (suggestion: { id: number; suggestedFor: Date }) => { const dateTime = new Date(suggestion.suggestedFor); setScheduleDate(datePart(dateTime)); setScheduleTime(dateTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false })); setAcceptedSuggestionId(suggestion.id); };
  const confirmSchedule = () => { if (!selected || !scheduleDate || !scheduleTime) return toast.error("Informe a data e a hora do recebimento."); schedule.mutate({ appointmentId: selected.id, scheduledFor: new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString(), acceptedSuggestionId }); };

  return <PortalLayout user={auth.data} title="Agendamentos" subtitle="Gestão e monitoramento de agendamentos e recebimentos." onLogout={() => logout.mutate()} actions={<div className="flex flex-wrap items-center gap-2 xl:flex-nowrap"><SegmentedControl value={dayShortcut} onChange={applyDayShortcut} options={[{ value: "todos", label: "Todos" }, { value: "hoje", label: "Hoje" }, { value: "amanha", label: "Amanhã" }]} className="shrink-0" />{podeConfirmar && <Button onClick={() => setReceiptOpen(true)} className="shrink-0 whitespace-nowrap rounded-xl bg-brand font-bold text-white hover:bg-brand/90"><ClipboardCheck className="size-4" />Recebimento sem agendamento</Button>}<Button onClick={() => setFiltersOpen(value => !value)} variant="outline" aria-pressed={filtersOpen} className="shrink-0 whitespace-nowrap rounded-xl border-line bg-surface font-bold text-ink-soft hover:bg-canvas hover:text-ink"><Filter className="size-4" />Filtros<ChevronDown className={`size-4 transition ${filtersOpen ? "rotate-180" : ""}`} /></Button></div>}>
    <section className="rounded-3xl bg-sunken p-4 sm:p-6">
      {filtersOpen && <div className="mb-6 panel p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><FilterField label="Número da nota" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="NF-e..." /><FilterField label="Nome do fornecedor" value={supplierName} onChange={setSupplierName} placeholder="Parte do nome..." /><FilterField label="Destinatário" value={recipientCnpj} onChange={setRecipientCnpj} placeholder="HSH, MSH ou o CNPJ" /><div><Label className="text-xs font-bold uppercase tracking-wide text-rvd-plum">Data inicial</Label><Input type="date" value={date} onChange={event => { setDate(event.target.value); setDailyFilterDate(null); setTomorrowFilterDate(null); }} className="mt-2 border-line text-rvd-plum" /></div></div><Button onClick={clearFilters} variant="ghost" className="mt-5 px-0 text-rvd-plum hover:bg-transparent hover:text-rvd-plum"><X className="size-4" />Limpar filtros</Button></div>}
      <div className="flex flex-wrap justify-center gap-2">{tabs.map(tab => { const Icon = tab.icon; const count = counters[tab.id]; const active = activeStatus === tab.id; const showsCounter = tab.id === "pending" || tab.id === "scheduled"; return <button key={tab.id} onClick={() => setActiveStatus(tab.id)} className={`relative inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${active ? "border-rvd-plum bg-brand text-white" : "border-line bg-surface text-rvd-plum hover:bg-rvd-plum-pale"}`}><Icon className="size-3.5" />{tab.label}{showsCounter && count > 0 && <span className={`-right-2 -top-2 absolute flex size-5 items-center justify-center rounded-full text-[10px] font-extrabold ${active ? "bg-rvd-blue text-rvd-plum" : "bg-brand text-white"}`}>{count}</span>}</button>; })}</div>
    </section>
      <section className="mt-6 overflow-hidden panel"><div className="overflow-x-auto"><table className="w-full min-w-[1060px] text-left"><thead className="bg-sunken"><tr className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint"><th className="px-3 py-4">Status</th><th className="px-3 py-4">Fornecedor</th><th className="px-3 py-4">Destinatário</th><th className="px-3 py-4">Nota fiscal</th><th className="px-3 py-4">Pedido</th><th className="px-3 py-4">{activeStatus === "rejected" ? "Motivo da recusa" : activeStatus === "pending" ? "Confirmação" : activeStatus === "received" ? "Recebimento" : "Agendamento"}</th><th className="px-3 py-4 text-right">Ações</th></tr></thead><tbody>{agenda.isLoading ? <tr><td colSpan={7} className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando agendamentos...</td></tr> : visibleAgenda.length ? visibleAgenda.map(item => <AppointmentRow key={item.id} item={item} activeStatus={activeStatus} canConfirm={podeConfirmar} onFinalize={() => openFinalize(item)} onDetails={() => setDetails(item)} onHistory={() => setDateHistory(item)} onChat={() => setChatTarget(item)} onPreNote={() => item.preNoteConfirmedAt ? toast.info("Pré-nota já confirmada.") : setPreNoteTarget(item)} onSchedule={() => openSchedule(item)} onUpdate={(status, reason) => updateStatus.mutate({ appointmentId: item.id, status, rejectionReason: reason })} onRescue={() => rescue.mutate({ appointmentId: item.id })} />) : <tr><td colSpan={7} className="px-4 py-16 text-center"><Search className="mx-auto size-7 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Nenhum agendamento encontrado</p><p className="mt-1 text-sm text-ink-soft">Ajuste os filtros ou selecione outra aba de status.</p></td></tr>}</tbody></table></div>{visibleAgenda.length >= limite && <div className="border-t border-line px-4 py-4 text-center"><Button onClick={() => setLimite(atual => atual + PAGINA)} variant="ghost" className="h-10 rounded-xl border border-line font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Carregar mais {PAGINA} · mostrando {visibleAgenda.length} de {counters[activeStatus === "all" ? "all" : activeStatus] ?? visibleAgenda.length}</Button></div>}</section>
    <FinalizeDialog item={finalizeTarget} open={Boolean(finalizeTarget)} onOpenChange={open => !open && setFinalizeTarget(null)} mode={finalizeMode} onMode={setFinalizeMode} miro={miro} onMiro={setMiro} note={finalizeNote} onNote={setFinalizeNote} reason={finalizeReason} onReason={setFinalizeReason} onConfirm={confirmFinalize} loading={updateStatus.isPending} />
    <SuggestDialog item={suggestTarget} open={Boolean(suggestTarget)} onOpenChange={open => !open && setSuggestTarget(null)} date={suggestDate} time={suggestTime} notes={suggestNotes} onDate={setSuggestDate} onTime={setSuggestTime} onNotes={setSuggestNotes} onConfirm={confirmSuggestion} loading={createSuggestion.isPending} />
    <ScheduleDialog item={selected} open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} date={scheduleDate} time={scheduleTime} onDate={setScheduleDate} onTime={setScheduleTime} onConfirm={confirmSchedule} loading={schedule.isPending} activeAppointments={activeSupplier.data?.filter(item => item.id !== selected?.id) ?? []} suggestions={pendingSuggestions.data ?? []} acceptedSuggestionId={acceptedSuggestionId} onAcceptSuggestion={acceptSuggestion} />
    <AppointmentDetailsDialog appointment={details} open={Boolean(details)} onOpenChange={open => !open && setDetails(null)} onHistory={() => { if (details) { setDateHistory(details); setDetails(null); } }} />
    <AppointmentDateHistoryDialog appointment={dateHistory} open={Boolean(dateHistory)} onOpenChange={open => !open && setDateHistory(null)} />
    <AppointmentChatDialog appointment={chatTarget} currentUserId={auth.data.id} open={Boolean(chatTarget)} onOpenChange={open => { if (!open) { setChatTarget(null); if (window.location.search.includes("chat=")) setLocation("/operador"); } }} />
    <PreNoteConfirmDialog item={preNoteTarget} open={Boolean(preNoteTarget)} onOpenChange={open => !open && setPreNoteTarget(null)} onConfirm={() => preNoteTarget && confirmPreNote.mutate({ appointmentId: preNoteTarget.id })} loading={confirmPreNote.isPending} />
    <UnscheduledReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} onRegistered={() => { utils.appointments.list.invalidate(); utils.calendar.list.invalidate(); }} />
  </PortalLayout>;
}

function FilterField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <div><Label className="text-xs font-bold uppercase tracking-wide text-rvd-plum">{label}</Label><div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-rvd-plum" /><Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="border-line pl-9 text-rvd-plum placeholder:text-ink-soft" /></div></div>; }

function AppointmentRow({ item, activeStatus, canConfirm, onDetails, onHistory, onChat, onPreNote, onSchedule, onUpdate, onRescue, onFinalize }: { item: Appointment; activeStatus: StatusTab; canConfirm: boolean; onFinalize: () => void; onDetails: () => void; onHistory: () => void; onChat: () => void; onPreNote: () => void; onSchedule: () => void; onUpdate: (status: Exclude<PortalStatus, "pending">, reason?: string) => void; onRescue: () => void }) { const displaySupplier = item.invoiceSupplierName || item.supplierName || "Fornecedor"; const showReceivedMoment = item.status === "received" && Boolean(item.receivedAt); const hasConfirmedSchedule = hasConfirmedAppointmentMoment(item.status as PortalStatus); const displayedMoment = getAppointmentMomentForDisplay({ status: item.status as PortalStatus, scheduledFor: item.scheduledFor, receivedAt: item.receivedAt }); const destinatario = rotuloDoDestinatario(item.recipientCnpj); const pedidos = pedidosDaNota(item.purchaseOrder); return <tr className="border-t border-line align-middle"><td className="px-3 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusStyle[item.status as PortalStatus]}`}>{statusCopy[item.status as PortalStatus]}</span><UrgenciaBadge purchaseOrder={item.purchaseOrder} className="mt-1.5 flex w-fit" /></td><td className="px-3 py-4"><p title={displaySupplier} className="line-clamp-2 max-w-40 font-bold leading-5 text-rvd-plum">{displaySupplier}</p><p title={item.supplierEmail ?? undefined} className="mt-1 max-w-40 truncate text-xs text-ink-soft">{item.supplierEmail}</p></td><td className="px-3 py-4"><div title={destinatario.tooltip} className={destinatario.unidade ? "font-display text-base font-extrabold leading-snug text-ink" : ""}><p className={destinatario.unidade ? "" : "font-bold text-rvd-plum"}>{destinatario.principal}</p><p className={destinatario.unidade ? "" : "mt-1 text-xs text-ink-soft"}>{destinatario.secundaria}</p></div></td><td className="px-3 py-4"><p className="font-display text-lg font-extrabold text-ink">{item.invoiceNumber || "—"}</p><p className="text-xs text-ink-soft">{sourceCopy[item.source]}</p></td><td className="px-3 py-4">{pedidos.length ? <div className="flex flex-col items-start gap-1">{pedidos.map(pedido => <span key={pedido} className={`rounded-md px-2.5 py-1 text-xs font-bold ${pedidoEhUrgente(pedido) ? "bg-state-stop-bg text-state-stop" : "bg-rvd-plum-pale text-rvd-plum"}`}>{pedido}</span>)}</div> : <span className="text-xs text-ink-soft">—</span>}</td><td className="px-3 py-4">{activeStatus === "rejected" ? <p className="max-w-36 text-sm font-semibold leading-5 text-red-700">{item.rejectionReason || "Motivo não informado"}</p> : hasConfirmedSchedule ? <><p className="font-bold text-rvd-plum">{new Date(displayedMoment).toLocaleDateString("pt-BR")}</p><p className="text-sm text-ink-soft">{new Date(displayedMoment).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>{showReceivedMoment && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">Recebido em</p>}</> : <p className="max-w-32 text-sm font-semibold leading-5 text-rvd-plum">Aguardando confirmação</p>}</td><td className="px-3 py-4"><div className="flex items-center justify-end gap-2 text-rvd-plum"><ActionIcon label="Abrir detalhes da nota" icon={FileText} onClick={onDetails} /><ActionIcon label="Histórico de datas" icon={CalendarClock} onClick={onHistory} />{item.status === "scheduled" && <ActionIcon label={canConfirm ? "Reagendar" : "Sugerir outra data"} icon={CalendarDays} onClick={onSchedule} />}<ActionIcon label="Conversar sobre esta nota" icon={MessageSquare} onClick={onChat} /><ActionIcon label={item.preNoteConfirmedAt ? "Pré-nota confirmada" : "Confirmar pré-nota"} icon={ClipboardCheck} onClick={onPreNote} confirmed={Boolean(item.preNoteConfirmedAt)} /><PrimaryAction status={item.status as PortalStatus} canConfirm={canConfirm} onSchedule={onSchedule} onUpdate={onUpdate} onRescue={onRescue} onFinalize={onFinalize} /></div></td></tr>; }
function ActionIcon({ label, icon: Icon, onClick, confirmed = false }: { label: string; icon: typeof FileText; onClick: () => void; confirmed?: boolean }) { return <button onClick={onClick} title={label} className={`rounded-lg p-1.5 hover:bg-rvd-plum-pale ${confirmed ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""}`}><Icon className="size-4" /></button>; }
function PrimaryAction({ status, canConfirm, onSchedule, onUpdate, onRescue, onFinalize }: { status: PortalStatus; canConfirm: boolean; onSchedule: () => void; onUpdate: (status: Exclude<PortalStatus, "pending">, reason?: string) => void; onRescue: () => void; onFinalize: () => void }) { const buttonClass = "h-9 shrink-0 rounded-xl px-3 text-xs font-bold"; if (status === "pending") return <Button onClick={onSchedule} className={`${buttonClass} bg-brand text-white hover:bg-brand`}>{canConfirm ? "Agendar" : "Sugerir data"}</Button>; if (status === "scheduled") return <div className="flex justify-end gap-2"><Button onClick={() => onUpdate("received")} className={`${buttonClass} bg-brand text-white hover:bg-brand`}>Receber</Button><Button onClick={() => onUpdate("rejected", canConfirm ? "Recusado pelo operador" : "Recusado pelo planejador")} variant="ghost" className={`${buttonClass} border border-line text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum`}>Rejeitar</Button></div>; if (status === "received") return <Button onClick={onFinalize} className={`${buttonClass} bg-brand text-white hover:bg-brand`}>Concluir</Button>; if (status === "backlog") return <span className="whitespace-nowrap text-xs font-bold text-rvd-plum">Em tratativa</span>; if (status === "rejected") return <Button onClick={onRescue} className={`${buttonClass} bg-rvd-blue text-rvd-plum hover:bg-rvd-blue-pale`}><RefreshCw className="size-3.5" />Resgatar</Button>; return <span className="text-xs font-bold text-rvd-plum">Consulta</span>; }

type ScheduleSuggestion = { id: number; suggestedFor: Date; notes: string | null; supplierName: string | null; createdByRole?: string | null };

/**
 * De quem é a sugestão. Sem isso o Operador lê "sugestão do fornecedor" numa
 * data que o planejador propôs — e aceita achando que é pedido de quem entrega.
 */
function suggestionAuthor(suggestion: ScheduleSuggestion, fallback: string | null | undefined) {
  if (suggestion.createdByRole === "planejador") return { label: "Sugestão do planejador", name: suggestion.supplierName || "Planejador" };
  return { label: "Sugestão do fornecedor", name: suggestion.supplierName || fallback || "Fornecedor" };
}

function ScheduleDialog({ item, open, onOpenChange, date, time, onDate, onTime, onConfirm, loading, activeAppointments, suggestions, acceptedSuggestionId, onAcceptSuggestion }: { item: Appointment | null; open: boolean; onOpenChange: (open: boolean) => void; date: string; time: string; onDate: (value: string) => void; onTime: (value: string) => void; onConfirm: () => void; loading: boolean; activeAppointments: { id: number; serviceType: string; scheduledFor: Date; status: string }[]; suggestions: ScheduleSuggestion[]; acceptedSuggestionId?: number; onAcceptSuggestion: (suggestion: ScheduleSuggestion) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none"><div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]"><section className="rounded-[2rem] bg-surface p-7 shadow-2xl"><DialogHeader><DialogTitle className="font-display text-2xl font-extrabold text-ink">Agendar recebimento</DialogTitle><DialogDescription className="text-rvd-plum">Defina manualmente a data e a hora ou aceite uma sugestão do fornecedor.</DialogDescription></DialogHeader><div className="mt-7 space-y-5">{suggestions.map(suggestion => { const autor = suggestionAuthor(suggestion, item?.supplierName); return <article key={suggestion.id} className={`rounded-3xl border p-4 ${acceptedSuggestionId === suggestion.id ? "border-rvd-plum bg-rvd-plum-pale" : "border-line bg-sunken"}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">{autor.label}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><p className="font-display text-lg font-extrabold text-ink">{formatAppointmentDate(suggestion.suggestedFor)}</p><p className="mt-1 text-xs text-ink-soft">{autor.name}{suggestion.notes ? ` · ${suggestion.notes}` : ""}</p></div><Button type="button" onClick={() => onAcceptSuggestion(suggestion)} className="rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand">{acceptedSuggestionId === suggestion.id ? "Sugestão aplicada" : "Aceitar"}</Button></div></article>; })}<div><Label className="font-bold text-rvd-plum">Data</Label><Input type="date" value={date} onChange={event => onDate(event.target.value)} className="mt-2 h-12 border-line bg-surface text-rvd-plum" /></div><div><Label className="font-bold text-rvd-plum">Hora</Label><Input type="time" value={time} onChange={event => onTime(event.target.value)} className="mt-2 h-12 border-line bg-surface text-rvd-plum" /></div><div className="flex justify-end gap-3 pt-4"><Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={onConfirm} disabled={loading} className="h-12 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand">{loading ? "Confirmando..." : "Confirmar agendamento"}</Button></div></div></section><aside className="rounded-[2rem] bg-surface p-7 shadow-2xl"><div className="flex items-center gap-2"><CalendarDays className="size-5 text-rvd-plum" /><div><h3 className="font-display text-lg font-extrabold text-ink">Agendamentos deste fornecedor</h3><p className="text-xs text-ink-soft">Agrupe novas entregas nas janelas já reservadas quando possível.</p></div></div>{activeAppointments.length ? <div className="mt-6 overflow-hidden rounded-2xl border border-line"><table className="w-full text-left"><thead className="bg-sunken"><tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint"><th className="px-3 py-3">Data</th><th className="px-3 py-3">Hora</th><th className="px-3 py-3">Agendamento</th></tr></thead><tbody>{activeAppointments.map(active => <tr key={active.id} className="border-t border-line text-sm text-ink-soft"><td className="px-3 py-3 font-semibold">{new Date(active.scheduledFor).toLocaleDateString("pt-BR")}</td><td className="px-3 py-3">{new Date(active.scheduledFor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td><td className="px-3 py-3 font-bold">{active.serviceType}</td></tr>)}</tbody></table></div> : <div className="mt-16 text-center"><CalendarDays className="mx-auto size-9 text-on-brand" /><p className="mt-4 font-bold text-rvd-plum">Nenhum agendamento ativo</p><p className="mt-1 text-sm text-ink-soft">Este fornecedor não tem outras notas agendadas no momento.</p></div>}</aside></div></DialogContent></Dialog>;
}
function PreNoteConfirmDialog({ item, open, onOpenChange, onConfirm, loading }: { item: Appointment | null; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void; loading: boolean }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md overflow-hidden rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl"><div className="bg-surface p-7"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><ClipboardCheck className="size-5" /></span><div><DialogTitle className="font-display text-xl font-extrabold text-ink">Confirmar pré-nota</DialogTitle><DialogDescription className="mt-1 text-rvd-plum">Nota {item?.invoiceNumber || "não identificada"}</DialogDescription></div></div><p className="mt-6 text-sm font-medium text-rvd-plum">A pré-nota foi realizada no sistema?</p><div className="mt-7 flex gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)} className="h-11 flex-1 rounded-xl border border-line bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={onConfirm} disabled={loading} className="h-11 flex-1 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700">{loading ? "Confirmando..." : "Confirmar"}</Button></div></div></DialogContent></Dialog>; }

/**
 * O planejador propõe uma data em vez de marcá-la. O pedido entra na mesma fila
 * das sugestões do fornecedor, e é lá que o Operador o encontra na hora de
 * agendar — nada de um canal paralelo que ninguém olha.
 */
function SuggestDialog({ item, open, onOpenChange, date, time, notes, onDate, onTime, onNotes, onConfirm, loading }: { item: Appointment | null; open: boolean; onOpenChange: (open: boolean) => void; date: string; time: string; notes: string; onDate: (value: string) => void; onTime: (value: string) => void; onNotes: (value: string) => void; onConfirm: () => void; loading: boolean }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg rounded-[2rem] border-line bg-surface p-7"><DialogHeader><DialogTitle className="font-display text-2xl font-extrabold text-ink">Sugerir data de recebimento</DialogTitle><DialogDescription className="text-rvd-plum">{item?.invoiceNumber ? `Nota ${item.invoiceNumber}` : "Nota sem número"} · {item?.invoiceSupplierName || item?.supplierName || "Fornecedor"}</DialogDescription></DialogHeader><p className="mt-5 rounded-2xl bg-sunken p-4 text-sm leading-6 text-ink-soft">A data vai para o Operador como sugestão. O agendamento só passa a valer depois que ele aceitar.</p><div className="mt-6 space-y-5"><div className="grid grid-cols-2 gap-3"><div><Label className="font-bold text-rvd-plum">Data</Label><Input type="date" value={date} onChange={event => onDate(event.target.value)} className="mt-2 h-12 border-line bg-surface text-rvd-plum" /></div><div><Label className="font-bold text-rvd-plum">Hora</Label><Input type="time" value={time} onChange={event => onTime(event.target.value)} className="mt-2 h-12 border-line bg-surface text-rvd-plum" /></div></div><div><Label className="font-bold text-rvd-plum">Motivo <span className="font-normal text-ink-soft">(opcional)</span></Label><Textarea value={notes} onChange={event => onNotes(event.target.value)} placeholder="Ex.: doca livre na manhã de terça." className="mt-2 min-h-24 border-line bg-surface text-rvd-plum" /></div><div className="flex justify-end gap-3 pt-2"><Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={onConfirm} disabled={loading} className="h-12 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand">{loading ? "Enviando..." : "Enviar sugestão"}</Button></div></div></DialogContent></Dialog>;
}

/**
 * Fechamento do recebimento. São dois desfechos, e eles ficam lado a lado
 * porque a escolha é uma só: deu certo — e então o MIRO do SAP é o que prova
 * isso — ou travou, e a nota volta para o backlog em vez de ser concluída no
 * escuro.
 *
 * O MIRO é pedido aqui porque é o único momento em que quem lançou está com o
 * número na tela. Depois a nota sai da lista e ninguém volta para preencher.
 */
function FinalizeDialog({ item, open, onOpenChange, mode, onMode, miro, onMiro, note, onNote, reason, onReason, onConfirm, loading }: { item: Appointment | null; open: boolean; onOpenChange: (open: boolean) => void; mode: "sucesso" | "problema"; onMode: (value: "sucesso" | "problema") => void; miro: string; onMiro: (value: string) => void; note: string; onNote: (value: string) => void; reason: string; onReason: (value: string) => void; onConfirm: () => void; loading: boolean }) {
  const cardClass = (active: boolean) => `flex flex-1 flex-col items-center gap-2 rounded-2xl border px-4 py-5 text-sm font-bold transition ${active ? "border-rvd-plum bg-brand text-white" : "border-line bg-sunken text-ink-soft hover:bg-rvd-plum-pale hover:text-rvd-plum"}`;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg rounded-[2rem] border-line bg-surface p-7"><DialogHeader><DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold text-ink"><CheckCircle2 className="size-6 text-rvd-plum" />Finalizar recebimento</DialogTitle><DialogDescription className="text-rvd-plum">{item?.invoiceNumber ? `Nota ${item.invoiceNumber}` : "Nota sem número"} · confirme o resultado da operação.</DialogDescription></DialogHeader>
    <div className="mt-6 flex gap-3"><button type="button" onClick={() => onMode("sucesso")} className={cardClass(mode === "sucesso")} aria-pressed={mode === "sucesso"}><CheckCircle2 className="size-5" />Sucesso</button><button type="button" onClick={() => onMode("problema")} className={cardClass(mode === "problema")} aria-pressed={mode === "problema"}><AlertTriangle className="size-5" />Problema / Backlog</button></div>
    {mode === "sucesso" ? <div className="mt-6 rounded-2xl border border-line bg-canvas p-5"><Label htmlFor="miro" className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">Número MIRO (SAP)</Label><Input id="miro" value={miro} onChange={event => onMiro(event.target.value)} inputMode="numeric" maxLength={14} placeholder="0000000000" className="mt-2 h-12 border-line bg-surface font-mono text-lg text-rvd-plum" /><p className="mt-2 text-xs text-ink-soft">Deve ter exatamente 10 dígitos numéricos.</p></div>
      : <div className="mt-6 space-y-4 rounded-2xl border border-line bg-canvas p-5">
          <div>
            <Label htmlFor="finalize-reason" className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">Motivo *</Label>
            <select id="finalize-reason" value={reason} onChange={event => onReason(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-rvd-plum focus:outline-none focus:ring-2 focus:ring-rvd-blue">
              <option value="">Selecione um motivo...</option>
              {MOTIVOS_DE_BACKLOG.map(motivo => <option key={motivo.codigo} value={motivo.codigo}>{motivo.rotulo}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="finalize-note" className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">O que houve? *</Label>
            <Textarea id="finalize-note" value={note} onChange={event => onNote(event.target.value)} placeholder="Descreva o que houve de errado..." className="mt-2 min-h-24 border-line bg-surface text-rvd-plum" />
            <p className="mt-2 text-xs text-ink-soft">A nota vai para o Backlog e fica lá até o Planejador tratar. É este texto que ele lê primeiro.</p>
          </div>
        </div>}
    <div className="mt-7 flex justify-end gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={onConfirm} disabled={loading} className="h-12 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand">{loading ? "Confirmando..." : mode === "sucesso" ? "Confirmar finalização" : "Enviar para o backlog"}</Button></div>
  </DialogContent></Dialog>;
}
