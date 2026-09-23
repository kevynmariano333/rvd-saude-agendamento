import { homePathFor, isPortalSchedulingDesk, type PortalRole } from "@/lib/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COLUNAS_DO_BACKLOG, filterBacklogReport, reportColumns, toBacklogReportRows, toConsolidatedReportRows, toDetailedReportRows, type ReportFilters } from "@/lib/reports";
import { cnpjsDoDestinatario } from "@shared/recipients";
import SeletorDeDestinatario from "@/components/SeletorDeDestinatario";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CalendarRange, ClipboardList, Download, FileSpreadsheet, Filter, RefreshCw, Search, TableProperties, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

const initialFilters: ReportFilters = { status: "all" };
/** Quantas linhas a tela desenha, e quantas o Excel leva. */
const NA_TELA = 200;
const NO_EXCEL = 5000;
const statusOptions = [
  ["all", "Todos"], ["pending", "Pendente"], ["scheduled", "Agendado"], ["received", "Recebido"], ["completed", "Concluído"], ["backlog", "Backlog"], ["rejected", "Rejeitado"],
] as const;

export default function ReportsPage() {
  const [location, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  // A visão vem da rota: "Relatórios" é um menu com duas consultas, e cada uma
  // tem o seu endereço. Consolidado e detalhado continuam sendo abas dentro da
  // primeira, porque são o mesmo relatório com mais ou menos colunas.
  const ehBacklog = location.startsWith("/operador/relatorios/backlog");
  const [visaoDeNotas, setVisaoDeNotas] = useState<"consolidated" | "detailed">("consolidated");
  const view: "consolidated" | "detailed" | "backlog" = ehBacklog ? "backlog" : visaoDeNotas;
  // O servidor filtra e devolve só as colunas do relatório. Antes a tela
  // baixava a tabela inteira a cada abertura para filtrar no navegador.
  const consultaDeNotas = useMemo(() => ({
    scheduledStart: filters.scheduledStart || undefined,
    scheduledEnd: filters.scheduledEnd || undefined,
    receivedStart: filters.receivedStart || undefined,
    receivedEnd: filters.receivedEnd || undefined,
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
    supplier: filters.supplier?.trim() || undefined,
    recipientCnpjs: cnpjsDoDestinatario(filters.recipientCnpj),
  }), [filters]);
  // A tela mostra uma amostra; o Excel leva tudo.
  //
  // Antes cada abertura baixava 3.000 linhas — 2 MB — para desenhar as
  // primeiras que cabem na rolagem. Agora a tela pede 200 e o arquivo completo
  // só é buscado quando alguém clica em exportar, que é quando ele serve.
  const appointments = trpc.reports.notas.useQuery({ ...consultaDeNotas, limite: NA_TELA }, { enabled: !ehBacklog, placeholderData: anterior => anterior });
  const [exportando, setExportando] = useState(false);
  const utils = trpc.useUtils();
  const backlogReport = trpc.reports.backlog.useQuery(undefined, { enabled: ehBacklog });
  useEffect(() => { if (auth.data && !isPortalSchedulingDesk(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole)); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  // Já vem filtrado do banco; a tela só conta o que chegou e avisa quando o
  // teto cortou alguma coisa.
  const filtered = useMemo(() => appointments.data?.linhas ?? [], [appointments.data]);
  const totalNoBanco = appointments.data?.total ?? 0;
  const backlogFiltrado = useMemo(() => filterBacklogReport(backlogReport.data ?? [], filters), [backlogReport.data, filters]);
  const rows = useMemo<Record<string, string>[]>(() => {
    if (view === "backlog") return toBacklogReportRows(backlogFiltrado);
    return view === "detailed" ? toDetailedReportRows(filtered) : toConsolidatedReportRows(filtered);
  }, [backlogFiltrado, filtered, view]);
  const colunas = useMemo(() => (view === "backlog" ? COLUNAS_DO_BACKLOG : reportColumns(view)), [view]);
  const tituloDaVisao = view === "backlog" ? "Backlog" : view === "detailed" ? "Detalhado" : "Consolidado";
  const carregando = view === "backlog" ? backlogReport.isLoading : appointments.isFetching && !appointments.data;
  const setFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  /** Monta e baixa a planilha a partir das linhas recebidas. */
  const baixarExcel = (linhas: Record<string, string>[]) => {
    const worksheet = XLSX.utils.json_to_sheet(linhas);
    worksheet["!cols"] = colunas.map(coluna => ({ wch: Math.max(16, coluna.length + 6) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, tituloDaVisao);
    XLSX.writeFile(workbook, `relatorio-${tituloDaVisao.toLowerCase()}-rvd-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportExcel = async () => {
    if (view === "backlog") return baixarExcel(rows);
    setExportando(true);
    try {
      const completo = await utils.reports.notas.fetch({ ...consultaDeNotas, limite: NO_EXCEL });
      baixarExcel(view === "detailed" ? toDetailedReportRows(completo.linhas) : toConsolidatedReportRows(completo.linhas));
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível montar a planilha.");
    } finally {
      setExportando(false);
    }
  };
  if (!auth.data || !isPortalSchedulingDesk(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  return <PortalLayout user={auth.data} title="Relatórios" subtitle={ehBacklog ? "Notas que travaram no recebimento, da entrada no backlog à tratativa." : "Histórico completo das notas lançadas."} onLogout={() => logout.mutate()}>
    <section className="overflow-hidden rounded-3xl bg-[#172136] p-6 text-white shadow-xl shadow-rvd-plum/10 sm:p-8"><div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-4"><span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-on-brand"><ClipboardList className="size-7" /></span><div><p className="font-display text-3xl font-extrabold">Relatórios</p><p className="mt-1 text-sm text-white/75">Consolidado operacional de agendamentos e recebimentos.</p></div></div><div className="flex flex-wrap gap-3"><Button onClick={() => (view === "backlog" ? backlogReport.refetch() : appointments.refetch())} variant="ghost" className="h-11 rounded-xl bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><RefreshCw className="size-4" />Carregar relatório</Button><Button onClick={exportExcel} disabled={!rows.length || exportando} className="h-11 rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale"><Download className="size-4" />{exportando ? "Montando a planilha..." : `Exportar Excel (${view === "backlog" ? rows.length : totalNoBanco})`}</Button></div></div></section>

    <section className="mt-7">{ehBacklog ? <div className="flex items-center gap-2 rounded-xl bg-rvd-plum-pale px-4 py-2.5 text-sm font-extrabold text-rvd-plum"><AlertTriangle className="size-4" />Backlog<span className="ml-1 font-normal text-ink-soft">Notas que passaram pelo backlog, com entrada, saída, motivo e comentários.</span></div> : <div className="flex flex-wrap items-center gap-2"><button onClick={() => setVisaoDeNotas("consolidated")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${view === "consolidated" ? "bg-brand text-white shadow-sm" : "bg-rvd-plum-pale text-rvd-plum hover:bg-rvd-plum-soft"}`}><TableProperties className="size-4" />Consolidado</button><button onClick={() => setVisaoDeNotas("detailed")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${view === "detailed" ? "bg-brand text-white shadow-sm" : "bg-rvd-plum-pale text-rvd-plum hover:bg-rvd-plum-soft"}`}><FileSpreadsheet className="size-4" />Detalhado</button><span className="ml-1 text-sm text-ink-soft">{view === "consolidated" ? "Uma linha por nota — visão geral." : "Consulta com todos os dados operacionais disponíveis."}</span></div>}</section>

    <section className="mt-7 rounded-3xl bg-sunken p-5 sm:p-7"><div className="flex items-center gap-2"><Filter className="size-5 text-rvd-plum" /><p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-faint">Filtros</p></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><FilterDate label={view === "backlog" ? "Entrou em backlog: início" : "Agendamento: início"} value={filters.scheduledStart || ""} onChange={value => setFilter("scheduledStart", value)} /><FilterDate label={view === "backlog" ? "Entrou em backlog: fim" : "Agendamento: fim"} value={filters.scheduledEnd || ""} onChange={value => setFilter("scheduledEnd", value)} /><FilterSelect label="Status" value={filters.status || "all"} onChange={value => setFilter("status", value as ReportFilters["status"])} options={statusOptions} /><FilterText label="Fornecedor (nome ou CNPJ)" value={filters.supplier || ""} onChange={value => setFilter("supplier", value)} placeholder="Buscar fornecedor..." /><SeletorDeDestinatario value={filters.recipientCnpj || ""} onChange={value => setFilter("recipientCnpj", value)} /><div className="flex items-end"><Button onClick={() => setFilters(initialFilters)} variant="ghost" className="h-11 text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Limpar filtros</Button></div></div></section>

    <section className="mt-7 overflow-hidden panel"><div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-faint">{tituloDaVisao}</p><h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas e recebimentos</h2></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1.5 text-xs font-bold text-rvd-plum"><Truck className="size-3.5" />{view !== "backlog" && totalNoBanco > rows.length ? `${rows.length} de ${totalNoBanco} notas` : `${rows.length} notas encontradas`}</span></div>{carregando ? <div className="py-16 text-center font-bold text-rvd-plum">Carregando {tituloDaVisao.toLowerCase()}...</div> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-sunken"><tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{colunas.map(coluna => <th key={coluna} className="px-4 py-4 align-bottom">{coluna}</th>)}</tr></thead><tbody>{rows.length ? rows.map((linha, indice) => <tr key={`${linha["Nota fiscal"]}-${indice}`} className="border-t border-line text-sm text-ink-soft">{colunas.map(coluna => <td key={coluna} className="px-4 py-4"><ReportCell coluna={coluna} valor={linha[coluna]} /></td>)}</tr>) : <tr><td colSpan={colunas.length} className="px-5 py-16 text-center"><Search className="mx-auto size-6 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Nenhuma nota encontrada</p><p className="mt-1 text-sm text-ink-soft">Ajuste os filtros para consultar o relatório.</p></td></tr>}</tbody></table></div>}</section>
  </PortalLayout>;
}

/**
 * Uma célula do relatório. As colunas vêm das próprias linhas — as mesmas que
 * vão para o Excel —, então a tela não tem como mostrar menos do que exporta.
 * Só o número da nota e o status ganham tratamento próprio, que é como eles
 * aparecem no resto do sistema.
 */
function ReportCell({ coluna, valor }: { coluna: string; valor: string }) {
  if (coluna === "Nota fiscal" || coluna === "Número da Nota") return <span className="font-display text-base font-extrabold text-ink">{valor}</span>;
  if (coluna === "Status" || coluna === "Status Atual") return <span className="inline-flex whitespace-nowrap rounded-full bg-rvd-plum-pale px-2.5 py-1 text-xs font-bold text-rvd-plum">{valor}</span>;
  if (coluna === "Fornecedor" || coluna === "Nome Fornecedor" || coluna === "Item recebido") return <span className="line-clamp-2 max-w-56 font-semibold">{valor}</span>;
  if (coluna === "Motivo" || coluna === "Comentários") return <span className="line-clamp-3 block max-w-80">{valor || "—"}</span>;
  // Data e hora em duas linhas: numa só, as duas colunas de data sozinhas
  // empurravam a tabela para fora da tela.
  if (coluna.startsWith("Data")) {
    const [dia, hora] = valor.split(" ");
    return <span className="whitespace-nowrap"><span className="font-semibold text-ink-soft">{dia}</span>{hora ? <><br /><span className="text-xs text-ink-faint">{hora}</span></> : null}</span>;
  }
  return <span className="whitespace-nowrap">{valor}</span>;
}

function FilterDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div><Label className="text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{label}</Label><div className="relative mt-2"><CalendarRange className="pointer-events-none absolute left-3 top-3 size-4 text-rvd-plum" /><Input type="date" value={value} onChange={event => onChange(event.target.value)} className="h-11 border-line bg-surface pl-10 text-rvd-plum" /></div></div>; }
function FilterText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <div><Label className="text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{label}</Label><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-rvd-plum" /><Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-11 border-line bg-surface pl-10 text-rvd-plum placeholder:text-ink-soft" /></div></div>; }
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) { return <div><Label className="text-[10px] font-bold uppercase tracking-wide text-rvd-plum">{label}</Label><select value={value} onChange={event => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-rvd-plum focus:outline-none focus:ring-2 focus:ring-rvd-blue">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></div>; }
