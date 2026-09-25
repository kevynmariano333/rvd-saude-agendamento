import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { canTreatBacklogPortal, formatAppointmentDate, homePathFor, isPortalOperator, type PortalRole } from "@/lib/portal";
import { cnpjsDoDestinatario, rotuloDoDestinatario } from "@shared/recipients";
import SeletorDeDestinatario from "../components/SeletorDeDestinatario";
import { pedidoEhUrgente, pedidosDaNota } from "@shared/purchaseOrders";
import UrgenciaBadge from "../components/UrgenciaBadge";
import { curtoDoMotivo } from "@shared/backlogReasons";
import { baixarPlanilha, nomeDaPlanilha } from "@/lib/planilha";
import { COLUNAS_DA_FILA_DO_BACKLOG, toBacklogQueueRows } from "@/lib/reports";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, Download, FileText, Filter, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { AppointmentDetail } from "../components/AppointmentDetailsDialog";
import AppointmentDetailsDialog from "../components/AppointmentDetailsDialog";
import AppointmentDateHistoryDialog from "../components/AppointmentDateHistoryDialog";
import LoadingTruck from "../components/LoadingTruck";
import TratarPendenciaDialog from "../components/TratarPendenciaDialog";
import PortalLayout from "./PortalLayout";

/**
 * Fila de tratativa do backlog.
 *
 * Uma nota chega aqui quando o Operador constata, no recebimento, que ela não
 * fecha — divergência de volume, de valor, de item. Reagendar não resolveria:
 * a carga já chegou. O que falta é acertar o lançamento, e isso é trabalho do
 * planejamento, que é quem enxerga esta tela.
 */
/** Os filtros da fila, vazios. É também o estado do "Limpar filtros". */
const FILTROS_VAZIOS = {
  busca: "",
  supplierCnpj: "",
  invoiceNumber: "",
  recipientCnpj: "",
  itemCountOperator: ">=" as ">=" | "<=" | "=",
  itemCount: "",
  dateStart: "",
  dateEnd: "",
  backlogStart: "",
  backlogEnd: "",
  onlyUrgent: false,
};
type FiltrosDoBacklog = typeof FILTROS_VAZIOS;

export default function BacklogPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  // A fila cresce e vira rolagem: com trezentas notas em aberto, achar a de um
  // fornecedor ou a que entrou na semana passada era trabalho de olho. Os
  // filtros são os mesmos da agenda, mais o período de entrada no backlog, que
  // só existe aqui.
  const [filtros, setFiltros] = useState<FiltrosDoBacklog>(FILTROS_VAZIOS);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const mudar = <C extends keyof FiltrosDoBacklog>(campo: C, valor: FiltrosDoBacklog[C]) => setFiltros(atual => ({ ...atual, [campo]: valor }));
  const filtrando = useMemo(
    () => (Object.keys(FILTROS_VAZIOS) as (keyof FiltrosDoBacklog)[]).some(campo => filtros[campo] !== FILTROS_VAZIOS[campo]),
    [filtros],
  );
  const consulta = useMemo(() => ({
    status: "backlog" as const,
    busca: filtros.busca.trim() || undefined,
    supplierCnpj: filtros.supplierCnpj.trim() || undefined,
    invoiceNumber: filtros.invoiceNumber.trim() || undefined,
    recipientCnpjs: cnpjsDoDestinatario(filtros.recipientCnpj),
    itemCountOperator: filtros.itemCount.trim() ? filtros.itemCountOperator : undefined,
    itemCount: filtros.itemCount.trim() ? Number(filtros.itemCount) : undefined,
    dateStart: filtros.dateStart || undefined,
    dateEnd: filtros.dateEnd || undefined,
    backlogStart: filtros.backlogStart || undefined,
    backlogEnd: filtros.backlogEnd || undefined,
    onlyUrgent: filtros.onlyUrgent || undefined,
  }), [filtros]);
  const backlog = trpc.appointments.list.useQuery(consulta, { placeholderData: anterior => anterior });
  const [tratando, setTratando] = useState<AppointmentDetail | null>(null);
  const [detalhes, setDetalhes] = useState<AppointmentDetail | null>(null);
  const [historico, setHistorico] = useState<AppointmentDetail | null>(null);
  // Reagendar é para a nota que travou por data — chegou fora da hora, não
  // chegou. Ela volta para a agenda com data nova em vez de esperar tratativa
  // de lançamento, que não é o que falta nela.
  const [reagendando, setReagendando] = useState<AppointmentDetail | null>(null);
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("09:00");
  const reagendar = trpc.appointments.schedule.useMutation({
    onSuccess: () => {
      toast.success("Nota reagendada. Ela saiu do backlog e voltou para a agenda.");
      setReagendando(null);
      utils.appointments.list.invalidate();
      utils.appointments.counts.invalidate();
    },
    onError: erro => toast.error(erro.message),
  });
  const abrirReagendamento = (item: AppointmentDetail) => {
    setReagendando(item);
    setNovaData("");
    setNovaHora("09:00");
  };
  const confirmarReagendamento = () => {
    if (!reagendando) return;
    if (!novaData || !novaHora) return toast.error("Informe a data e a hora do novo recebimento.");
    reagendar.mutate({ appointmentId: reagendando.id, scheduledFor: new Date(`${novaData}T${novaHora}:00`).toISOString() });
  };

  useEffect(() => {
    if (auth.data && !canTreatBacklogPortal(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole));
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Carregando o backlog" />;
  if (!auth.data || !canTreatBacklogPortal(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  const notas = backlog.data ?? [];
  // Quem crava data é o Operador; o planejador trata, mas não agenda.
  const podeAgendar = isPortalOperator(auth.data.role as PortalRole);
  // A planilha sai do que está na tela: o que a fila mostra é o que o arquivo
  // leva, sem uma segunda consulta que pudesse trazer outro conjunto.
  const exportarFila = () => {
    if (!notas.length) return toast.error("Não há nota em backlog para exportar.");
    baixarPlanilha({
      linhas: toBacklogQueueRows(notas),
      colunas: COLUNAS_DA_FILA_DO_BACKLOG,
      aba: "Backlog em aberto",
      arquivo: nomeDaPlanilha("backlog-em-aberto"),
    });
  };

  return <PortalLayout user={auth.data} title="Backlog" subtitle="Notas que não fecharam no recebimento e esperam tratativa." onLogout={() => logout.mutate()}>
    <section className="panel p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-state-wait-bg p-2.5 text-state-wait"><AlertTriangle className="size-4" /></span>
          <div>
            <h2 className="font-display text-base font-extrabold text-ink">Backlog de notas</h2>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-soft">Trate as notas que não foram finalizadas com sucesso. Cada tratativa registra o lançamento no SAP e os documentos do HIS.</p>
          </div>
        </div>
        <div className="flex h-fit shrink-0 items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1 text-[11px] font-bold text-rvd-plum">{notas.length} {notas.length === 1 ? "nota" : "notas"} {filtrando ? (notas.length === 1 ? "encontrada" : "encontradas") : "em aberto"}</span>
          {/* Exportar daqui, e não só dos Relatórios: quem trata o backlog
              trabalha nesta tela o dia inteiro, e a fila costuma sair em
              planilha para ser acertada no SAP com a lista do lado. */}
          <Button onClick={exportarFila} disabled={!notas.length} variant="outline" className="h-9 rounded-xl border-line bg-surface px-3.5 text-[11px] font-bold text-rvd-plum hover:bg-rvd-plum-pale"><Download className="size-3.5" />Exportar Excel</Button>
          <Button onClick={() => setMostrarFiltros(valor => !valor)} variant="outline" className={`h-9 rounded-xl border-line px-3.5 text-[11px] font-bold hover:bg-rvd-plum-pale ${mostrarFiltros ? "bg-rvd-plum-pale text-rvd-plum" : "bg-surface text-rvd-plum"}`}><Filter className="size-3.5" />Filtros{filtrando ? " (ativos)" : ""}</Button>
        </div>
      </div>

      {mostrarFiltros && <div className="mt-6 rounded-2xl bg-sunken p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CampoDoFiltro label="Busca geral" value={filtros.busca} onChange={valor => mudar("busca", valor)} placeholder="Fornecedor, nota ou pedido..." comLupa />
          <CampoDoFiltro label="CNPJ fornecedor" value={filtros.supplierCnpj} onChange={valor => mudar("supplierCnpj", valor)} placeholder="00.000.000/0000-00" />
          <CampoDoFiltro label="Número da nota" value={filtros.invoiceNumber} onChange={valor => mudar("invoiceNumber", valor)} placeholder="NF-e..." />
          <SeletorDeDestinatario value={filtros.recipientCnpj} onChange={valor => mudar("recipientCnpj", valor)} />
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-wide text-rvd-plum">Qtd. itens na nota</Label>
            <div className="mt-2 flex gap-2">
              <select value={filtros.itemCountOperator} onChange={evento => mudar("itemCountOperator", evento.target.value as FiltrosDoBacklog["itemCountOperator"])} className="h-10 shrink-0 rounded-xl border border-line bg-surface px-2 text-sm font-bold text-rvd-plum focus:outline-none focus:ring-2 focus:ring-rvd-blue"><option value=">=">≥</option><option value="<=">≤</option><option value="=">=</option></select>
              <Input type="number" min={0} value={filtros.itemCount} onChange={evento => mudar("itemCount", evento.target.value)} placeholder="0" className="border-line bg-surface text-rvd-plum" />
            </div>
          </div>
          <CampoDeData label="Data inicial" value={filtros.dateStart} onChange={valor => mudar("dateStart", valor)} />
          <CampoDeData label="Data final" value={filtros.dateEnd} onChange={valor => mudar("dateEnd", valor)} />
          {/* Este par não é o do agendamento: é o dia em que a nota caiu no
              backlog, que é como o planejamento cobra a própria fila ("o que
              travou esta semana"). */}
          <CampoDeData label="Entrou em backlog — de" value={filtros.backlogStart} onChange={valor => mudar("backlogStart", valor)} />
          <CampoDeData label="Entrou em backlog — até" value={filtros.backlogEnd} onChange={valor => mudar("backlogEnd", valor)} />
          <div className="flex items-end">
            <button type="button" role="switch" aria-checked={filtros.onlyUrgent} onClick={() => mudar("onlyUrgent", !filtros.onlyUrgent)} className="inline-flex h-10 items-center gap-3 text-xs font-bold uppercase tracking-wide text-rvd-plum">
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${filtros.onlyUrgent ? "bg-state-stop" : "bg-line"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${filtros.onlyUrgent ? "left-[1.375rem]" : "left-0.5"}`} /></span>
              Apenas urgentes
            </button>
          </div>
          <div className="flex items-end">
            <Button onClick={() => setFiltros(FILTROS_VAZIOS)} disabled={!filtrando} variant="ghost" className="h-10 text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum disabled:opacity-40"><X className="size-4" />Limpar filtros</Button>
          </div>
        </div>
      </div>}

      {backlog.isLoading ? <div className="py-20 text-center text-sm font-bold text-rvd-plum">Carregando backlog...</div>
        : notas.length ? <div className="mt-6 overflow-x-auto"><table className="w-full text-left">
            <thead className="bg-sunken">
              <tr className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Fornecedor</th>
                <th className="px-3 py-3">Destinatário</th>
                <th className="px-3 py-3">Nota / pedidos</th>
                <th className="px-3 py-3">Agendamento</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {notas.map(item => {
                const destinatario = rotuloDoDestinatario(item.recipientCnpj);
                const pedidos = pedidosDaNota(item.purchaseOrder);
                return <tr key={item.id} className="border-t border-line align-top text-sm">
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-state-wait-bg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-state-wait"><AlertTriangle className="size-3" />Backlog</span>
                    <UrgenciaBadge purchaseOrder={item.purchaseOrder} marcadaEm={item.urgenteMarcadoEm} motivo={item.urgenteMotivo} className="mt-1.5 flex w-fit" />
                    <p className="mt-1.5 inline-flex rounded bg-rvd-plum-pale px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{curtoDoMotivo(item.backlogReasonCode)}</p>
                    <p className="mt-1 line-clamp-3 max-w-44 text-[11px] leading-4 text-ink-soft">{item.backlogReason || "Sem descrição"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p title={item.invoiceSupplierName || item.supplierName || undefined} className="line-clamp-2 max-w-48 text-[13px] font-bold leading-4 text-rvd-plum">{item.invoiceSupplierName || item.supplierName || "Fornecedor"}</p>
                    <p className="mt-0.5 max-w-48 truncate text-[11px] text-ink-soft">{item.supplierEmail}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div title={destinatario.tooltip} className={destinatario.unidade ? "font-display text-[13px] font-extrabold leading-4 text-ink" : ""}>
                      <p className={destinatario.unidade ? "" : "font-bold text-rvd-plum"}>{destinatario.principal}</p>
                      <p className={destinatario.unidade ? "" : "mt-1 text-xs text-ink-soft"}>{destinatario.secundaria}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-display text-base font-extrabold leading-5 text-ink">NF {item.invoiceNumber || "—"}</p>
                    {pedidos.length ? <div className="mt-1.5 flex flex-col items-start gap-1">{pedidos.map(pedido => <span key={pedido} className={`rounded px-2 py-0.5 text-[11px] font-bold ${pedidoEhUrgente(pedido) ? "bg-state-stop-bg text-state-stop" : "bg-rvd-plum-pale text-rvd-plum"}`}>{pedido}</span>)}</div> : null}
                    {item.invoiceVolumeCount !== null && <p className="mt-1 text-[11px] text-ink-soft">{item.invoiceVolumeCount} {item.invoiceVolumeCount === 1 ? "volume" : "volumes"}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[13px] font-bold text-rvd-plum">{new Date(item.scheduledFor).toLocaleDateString("pt-BR")}</p>
                    <p className="text-[11px] text-ink-soft">{new Date(item.scheduledFor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetalhes(item)} title="Abrir detalhes da nota" className="rounded-lg p-1.5 text-rvd-plum hover:bg-rvd-plum-pale"><FileText className="size-4" /></button>
                      {podeAgendar && <Button onClick={() => abrirReagendamento(item)} variant="outline" className="h-8 shrink-0 rounded-xl border-line bg-surface px-3 text-[11px] font-bold text-rvd-plum hover:bg-rvd-plum-pale"><CalendarDays className="size-3.5" />Reagendar</Button>}
                      <Button onClick={() => setTratando(item)} className="h-8 shrink-0 rounded-xl bg-brand px-3.5 text-[11px] font-bold text-white hover:bg-brand"><ClipboardCheck className="size-3.5" />Tratar</Button>
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table></div>
        : filtrando ? <div className="mt-7 rounded-2xl bg-rvd-plum-pale px-6 py-16 text-center">
            <Search className="mx-auto size-7 text-rvd-plum" />
            <h3 className="mt-4 font-display text-lg font-extrabold text-ink">Nenhuma nota com esses filtros</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">A fila pode ter notas — só não estas. Ajuste os campos ou limpe os filtros.</p>
            <Button onClick={() => setFiltros(FILTROS_VAZIOS)} variant="ghost" className="mt-4 text-rvd-plum hover:bg-rvd-plum-soft hover:text-rvd-plum"><X className="size-4" />Limpar filtros</Button>
          </div>
        : <div className="mt-7 rounded-2xl bg-rvd-plum-pale px-6 py-16 text-center">
            <CheckCircle2 className="mx-auto size-8 text-rvd-plum" />
            <h3 className="mt-4 font-display text-lg font-extrabold text-ink">Nada em backlog</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">Todo recebimento fechou. Quando uma nota não fechar, ela aparece aqui para tratativa.</p>
          </div>}
    </section>

    <TratarPendenciaDialog
      appointment={tratando}
      open={Boolean(tratando)}
      onOpenChange={aberto => !aberto && setTratando(null)}
      onTreated={() => { setTratando(null); utils.appointments.list.invalidate(); }}
    />
    <AppointmentDetailsDialog appointment={detalhes} open={Boolean(detalhes)} onOpenChange={aberto => !aberto && setDetalhes(null)} onHistory={() => { setHistorico(detalhes); setDetalhes(null); }} />
    <AppointmentDateHistoryDialog appointment={historico} open={Boolean(historico)} onOpenChange={aberto => !aberto && setHistorico(null)} />

    <Dialog open={Boolean(reagendando)} onOpenChange={aberto => !aberto && setReagendando(null)}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:max-w-md">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><CalendarDays className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Reagendar nota</DialogTitle>
              <DialogDescription className="text-[13px] text-ink-soft">NF {reagendando?.invoiceNumber || "não identificada"} · sai do backlog e volta para a agenda.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="backlog-data" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Nova data *</Label>
            <Input id="backlog-data" type="date" value={novaData} onChange={evento => setNovaData(evento.target.value)} className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
          </div>
          <div>
            <Label htmlFor="backlog-hora" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Novo horário *</Label>
            <Input id="backlog-hora" type="time" value={novaHora} onChange={evento => setNovaHora(evento.target.value)} className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => setReagendando(null)} className="font-bold text-ink-soft hover:bg-sunken">Cancelar</Button>
          <Button type="button" onClick={confirmarReagendamento} disabled={reagendar.isPending} className="h-10 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand"><CalendarDays className="size-4" />{reagendar.isPending ? "Reagendando..." : "Reagendar"}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  </PortalLayout>;
}

/** Um campo de texto do filtro, no formato que o resto do portal usa. */
function CampoDoFiltro({ label, value, onChange, placeholder, comLupa = false }: { label: string; value: string; onChange: (valor: string) => void; placeholder: string; comLupa?: boolean }) {
  return <div>
    <Label className="text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{label}</Label>
    <div className="relative mt-2">
      {comLupa && <Search className="pointer-events-none absolute left-3 top-3 size-4 text-rvd-plum" />}
      <Input value={value} onChange={evento => onChange(evento.target.value)} placeholder={placeholder} className={`border-line bg-surface text-rvd-plum placeholder:text-ink-soft ${comLupa ? "pl-9" : ""}`} />
    </div>
  </div>;
}

function CampoDeData({ label, value, onChange }: { label: string; value: string; onChange: (valor: string) => void }) {
  return <div>
    <Label className="text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{label}</Label>
    <Input type="date" value={value} onChange={evento => onChange(evento.target.value)} className="mt-2 border-line bg-surface text-rvd-plum" />
  </div>;
}
