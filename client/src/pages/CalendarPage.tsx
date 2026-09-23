import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { homePathFor, isPortalSchedulingDesk, type PortalRole, type PortalStatus, statusCopy } from "@/lib/portal";
import { pedidoEhUrgente, pedidosDaNota } from "@shared/purchaseOrders";
import { UNIDADES, unidadePorCnpj } from "@shared/recipients";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Package, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import AppointmentDetailsDialog, { type AppointmentDetail } from "../components/AppointmentDetailsDialog";
import AppointmentDateHistoryDialog from "../components/AppointmentDateHistoryDialog";
import LoadingTruck from "../components/LoadingTruck";
import PortalLayout from "./PortalLayout";

const statusStyle: Record<PortalStatus, string> = { pending: "bg-rvd-blue-pale text-rvd-plum", scheduled: "bg-rvd-plum-pale text-rvd-plum", received: "bg-rvd-lilac-blue text-rvd-plum", completed: "bg-rvd-blue text-rvd-plum", backlog: "bg-rvd-plum-pale text-rvd-plum", rejected: "bg-rvd-lilac-blue text-rvd-plum" };
const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * A cor de cada unidade, na ordem em que elas estão cadastradas.
 *
 * O calendário mostra o dia inteiro num número só; a cor é o que separa
 * hospital de maternidade de relance, sem obrigar a abrir o dia.
 */
const CORES_DAS_UNIDADES = ["bg-state-go", "bg-rvd-blue", "bg-state-wait", "bg-brand"];
function corDaUnidade(cnpj: string) {
  const posicao = UNIDADES.findIndex(unidade => unidade.cnpj === cnpj);
  return CORES_DAS_UNIDADES[posicao < 0 ? CORES_DAS_UNIDADES.length - 1 : posicao % CORES_DAS_UNIDADES.length];
}

/** A chave do dia em São Paulo — é por ela que a nota cai numa célula. */
function chaveDoDia(valor: Date | string) {
  return new Date(valor).toLocaleDateString("en-CA");
}
function primeiroDoMes(data: Date) { const clone = new Date(data); clone.setDate(1); clone.setHours(0, 0, 0, 0); return clone; }
function somarMeses(data: Date, meses: number) { const clone = primeiroDoMes(data); clone.setMonth(clone.getMonth() + meses); return clone; }

/**
 * As células do mês, do domingo que abre a primeira semana ao sábado que fecha
 * a última. Os dias de fora do mês continuam no quadro, apagados, para a
 * semana não ficar quebrada.
 */
function celulasDoMes(mes: Date) {
  const inicio = primeiroDoMes(mes);
  inicio.setDate(inicio.getDate() - inicio.getDay());
  const fim = somarMeses(mes, 1);
  fim.setDate(fim.getDate() - 1);
  const total = Math.ceil((fim.getTime() - inicio.getTime()) / 86_400_000 / 7 + 0.001) * 7;
  return Array.from({ length: Math.max(total, 35) }, (_, indice) => {
    const dia = new Date(inicio);
    dia.setDate(dia.getDate() + indice);
    return dia;
  });
}

type NotaDoCalendario = AppointmentDetail;

export default function CalendarPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const [mes, setMes] = useState(() => primeiroDoMes(new Date()));
  /** "todas" ou o CNPJ de uma unidade. */
  const [unidade, setUnidade] = useState("todas");
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [notaAberta, setNotaAberta] = useState<NotaDoCalendario | null>(null);
  const [historicoDaNota, setHistoricoDaNota] = useState<NotaDoCalendario | null>(null);

  const periodo = useMemo(() => {
    const inicio = primeiroDoMes(mes);
    const fim = somarMeses(mes, 1);
    return { start: inicio.toISOString(), end: new Date(fim.getTime() - 1).toISOString() };
  }, [mes]);
  const calendario = trpc.calendar.list.useQuery(periodo, { placeholderData: anterior => anterior });

  // O que o calendário mostra — só o que ainda vai chegar — é decidido no
  // servidor. Aqui fica só o recorte por unidade, que é escolha da pessoa.
  const notas = useMemo(
    () => (calendario.data ?? []).filter(nota => unidade === "todas" || nota.recipientCnpj === unidade),
    [calendario.data, unidade],
  );
  const porDia = useMemo(() => {
    const mapa = new Map<string, NotaDoCalendario[]>();
    for (const nota of notas) {
      const chave = chaveDoDia(nota.scheduledFor);
      const lista = mapa.get(chave);
      if (lista) lista.push(nota);
      else mapa.set(chave, [nota]);
    }
    for (const lista of Array.from(mapa.values())) lista.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
    return mapa;
  }, [notas]);

  const celulas = useMemo(() => celulasDoMes(mes), [mes]);
  const hoje = chaveDoDia(new Date());
  const doDiaAberto = diaAberto ? (porDia.get(diaAberto) ?? []) : [];

  useEffect(() => { setDiaAberto(null); }, [mes]);
  useEffect(() => {
    if (auth.data && !isPortalSchedulingDesk(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole));
    if (auth.data === null) setLocation("/");
  }, [auth.data, setLocation]);
  if (auth.isLoading) return <LoadingTruck label="Carregando o calendário operacional" />;
  if (!auth.data || !isPortalSchedulingDesk(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  const nomeDoMes = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return <PortalLayout user={auth.data} title="Calendário operacional" subtitle="O que ainda vai chegar, mês a mês. Abra o dia para ler as notas." onLogout={() => logout.mutate()} actions={<div className="flex flex-wrap items-center gap-2">
    <Button variant="ghost" onClick={() => setMes(atual => somarMeses(atual, -1))} className="rounded-xl border border-line bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><ChevronLeft className="size-4" />Anterior</Button>
    <Button variant="ghost" onClick={() => setMes(primeiroDoMes(new Date()))} className="rounded-xl border border-line bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Este mês</Button>
    <Button variant="ghost" onClick={() => setMes(atual => somarMeses(atual, 1))} className="rounded-xl border border-line bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Próximo<ChevronRight className="size-4" /></Button>
  </div>}>
    <section className="panel p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-display text-lg font-extrabold capitalize text-ink">{nomeDoMes}</h2>
          <ChipDeUnidade ativo={unidade === "todas"} onClick={() => setUnidade("todas")}>Todas</ChipDeUnidade>
          {UNIDADES.map(item => <ChipDeUnidade key={item.cnpj} ativo={unidade === item.cnpj} cor={corDaUnidade(item.cnpj)} onClick={() => setUnidade(item.cnpj)}>{item.sigla}</ChipDeUnidade>)}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
          <span><strong className="font-extrabold text-ink">{notas.length}</strong> nota(s) a chegar em <span className="capitalize">{mes.toLocaleDateString("pt-BR", { month: "long" })}</span></span>
          <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-state-stop"><span className="size-2 rounded-full bg-state-stop" />Contém urgente</span>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[840px] overflow-hidden rounded-2xl border border-line">
          <div className="grid grid-cols-7 bg-sunken">
            {DIAS_DA_SEMANA.map(dia => <p key={dia} className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{dia}</p>)}
          </div>
          <div className="grid grid-cols-7">
            {celulas.map(dia => {
              const chave = chaveDoDia(dia);
              const doDia = porDia.get(chave) ?? [];
              const doMes = dia.getMonth() === mes.getMonth();
              const urgente = doDia.some(nota => pedidosDaNota(nota.purchaseOrder).some(pedidoEhUrgente));
              const porUnidade = UNIDADES.map(item => ({ ...item, total: doDia.filter(nota => nota.recipientCnpj === item.cnpj).length })).filter(item => item.total > 0);
              const outras = doDia.length - porUnidade.reduce((soma, item) => soma + item.total, 0);
              return (
                <button
                  key={chave}
                  type="button"
                  disabled={!doDia.length}
                  onClick={() => setDiaAberto(atual => (atual === chave ? null : chave))}
                  title={doDia.length ? `${doDia.length} nota(s) em ${dia.toLocaleDateString("pt-BR")}` : undefined}
                  className={`relative min-h-24 border-b border-l border-line p-2.5 text-left transition first:border-l-0 ${doDia.length ? "cursor-pointer hover:bg-rvd-plum-pale/50" : "cursor-default"} ${doMes ? "" : "bg-sunken/60"} ${diaAberto === chave ? "ring-2 ring-inset ring-rvd-plum" : ""}`}
                >
                  <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${chave === hoje ? "bg-brand text-white" : doMes ? "text-ink-soft" : "text-ink-faint"}`}>{dia.getDate()}</span>
                  {urgente && <span title="Há pedido urgente neste dia" className="absolute right-2.5 top-3 size-2 rounded-full bg-state-stop" />}
                  {doDia.length > 0 && <>
                    <p className="mt-1 font-display text-xl font-extrabold text-ink">{doDia.length}</p>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      {porUnidade.map(item => <span key={item.cnpj} className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-soft"><span className={`size-1.5 rounded-full ${corDaUnidade(item.cnpj)}`} />{item.sigla} {item.total}</span>)}
                      {outras > 0 && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-soft"><span className="size-1.5 rounded-full bg-ink-faint" />Outros {outras}</span>}
                    </div>
                  </>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>

    {diaAberto && <DiaAberto
      dia={diaAberto}
      notas={doDiaAberto}
      onFechar={() => setDiaAberto(null)}
      onAbrirNota={setNotaAberta}
    />}

    <AppointmentDetailsDialog appointment={notaAberta} open={Boolean(notaAberta)} onOpenChange={aberto => !aberto && setNotaAberta(null)} onHistory={() => { setHistoricoDaNota(notaAberta); setNotaAberta(null); }} />
    <AppointmentDateHistoryDialog appointment={historicoDaNota} open={Boolean(historicoDaNota)} onOpenChange={(aberto: boolean) => !aberto && setHistoricoDaNota(null)} />
  </PortalLayout>;
}

function ChipDeUnidade({ ativo, cor, onClick, children }: { ativo: boolean; cor?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${ativo ? "bg-brand text-white" : "bg-sunken text-rvd-plum hover:bg-rvd-plum-pale"}`}>
      {cor && <span className={`size-2 rounded-full ${ativo ? "bg-white" : cor}`} />}
      {children}
    </button>
  );
}

/**
 * O dia aberto: as notas daquele dia, agrupadas pela hora marcada.
 *
 * O calendário mostra quantas notas caem no dia; quem precisa montar a doca
 * precisa saber quais são e a que horas. A hora aparece uma vez por grupo, à
 * esquerda, para a coluna virar uma linha do tempo em vez de repetir o horário
 * em toda linha.
 */
function DiaAberto({ dia, notas, onFechar, onAbrirNota }: { dia: string; notas: NotaDoCalendario[]; onFechar: () => void; onAbrirNota: (nota: NotaDoCalendario) => void }) {
  const titulo = new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  // O quadro do mês ocupa a tela inteira: sem isto, clicar num dia abre a lista
  // fora do campo de visão e parece que nada aconteceu.
  const quadro = useRef<HTMLElement>(null);
  useEffect(() => { quadro.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [dia]);
  const porHora = new Map<string, NotaDoCalendario[]>();
  for (const nota of notas) {
    const hora = `${String(new Date(nota.scheduledFor).getHours()).padStart(2, "0")}:00`;
    const lista = porHora.get(hora);
    if (lista) lista.push(nota);
    else porHora.set(hora, [nota]);
  }

  return (
    <section ref={quadro} className="mt-6 panel overflow-hidden scroll-mt-4">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-sunken px-5 py-3.5">
        <p className="inline-flex items-center gap-2 text-sm font-extrabold capitalize text-ink"><CalendarDays className="size-4 text-rvd-plum" />{titulo}<span className="rounded-full bg-rvd-plum-pale px-2 py-0.5 text-[11px] font-extrabold uppercase text-rvd-plum">{notas.length}</span></p>
        <button type="button" onClick={onFechar} title="Fechar o dia" className="rounded-lg p-1.5 text-ink-faint hover:bg-rvd-plum-pale hover:text-rvd-plum"><X className="size-4" /></button>
      </header>
      <div className="divide-y divide-line">
        {Array.from(porHora.entries()).map(([hora, daHora]) => (
          <div key={hora} className="flex gap-4 px-5 py-4">
            <p className="w-14 shrink-0 pt-2 text-xs font-extrabold text-rvd-plum">{hora}</p>
            <div className="min-w-0 flex-1 space-y-2">
              {daHora.map(nota => {
                const unidade = unidadePorCnpj(nota.recipientCnpj);
                const fornecedor = nota.invoiceSupplierName || nota.supplierName || "Fornecedor";
                const urgente = pedidosDaNota(nota.purchaseOrder).some(pedidoEhUrgente);
                return (
                  <button
                    key={nota.id}
                    type="button"
                    onClick={() => onAbrirNota(nota)}
                    className={`flex w-full items-center gap-3 rounded-xl border bg-surface px-4 py-2.5 text-left transition hover:bg-rvd-plum-pale/60 ${urgente ? "border-state-stop" : "border-line"}`}
                  >
                    <span className="w-11 shrink-0 text-[11px] font-extrabold text-ink-soft">{new Date(nota.scheduledFor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-extrabold text-ink">{fornecedor}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                        NF {nota.invoiceNumber || "não informada"} · <span className="font-bold text-rvd-plum">{unidade ? `${unidade.sigla} — ${unidade.nome}` : "Destinatário não identificado"}</span>
                      </span>
                    </span>
                    {urgente && <span className="shrink-0 rounded-md bg-state-stop-bg px-2 py-0.5 text-[10px] font-extrabold uppercase text-state-stop">Urgente</span>}
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle[nota.status]}`}>{statusCopy[nota.status]}</span>
                    {nota.invoiceVolumeCount !== null && <span title={`${nota.invoiceVolumeCount} volume(s)`} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-ink-soft"><Package className="size-3.5" />{nota.invoiceVolumeCount}</span>}
                    <FileText className="size-4 shrink-0 text-rvd-plum" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
