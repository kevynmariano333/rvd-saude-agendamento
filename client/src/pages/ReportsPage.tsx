import { homePathFor, isPortalSchedulingDesk, type PortalRole } from "@/lib/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { filterReportAppointments, reportColumns, toConsolidatedReportRows, toDetailedReportRows, type ReportFilters } from "@/lib/reports";
import { trpc } from "@/lib/trpc";
import { CalendarRange, ClipboardList, Download, FileSpreadsheet, Filter, RefreshCw, Search, TableProperties, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

const initialFilters: ReportFilters = { status: "all" };
const statusOptions = [
  ["all", "Todos"], ["pending", "Pendente"], ["scheduled", "Agendado"], ["received", "Recebido"], ["completed", "Concluído"], ["rejected", "Rejeitado"],
] as const;

export default function ReportsPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const appointments = trpc.appointments.list.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setLocation("/") });
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [view, setView] = useState<"consolidated" | "detailed">("consolidated");
  useEffect(() => { if (auth.data && !isPortalSchedulingDesk(auth.data.role as PortalRole)) setLocation(homePathFor(auth.data.role as PortalRole)); if (auth.data === null) setLocation("/"); }, [auth.data, setLocation]);
  const filtered = useMemo(() => filterReportAppointments(appointments.data ?? [], filters), [appointments.data, filters]);
  const rows = useMemo<Record<string, string>[]>(() => (view === "detailed" ? toDetailedReportRows(filtered) : toConsolidatedReportRows(filtered)), [filtered, view]);
  const colunas = useMemo(() => reportColumns(view), [view]);
  const tituloDaVisao = view === "detailed" ? "Detalhado" : "Consolidado";
  const setFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const exportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = colunas.map(coluna => ({ wch: Math.max(16, coluna.length + 6) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, tituloDaVisao);
    XLSX.writeFile(workbook, `relatorio-${tituloDaVisao.toLowerCase()}-rvd-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  if (!auth.data || !isPortalSchedulingDesk(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  return <PortalLayout user={auth.data} title="Relatórios" subtitle="Histórico completo das notas lançadas." onLogout={() => logout.mutate()}>
    <section className="overflow-hidden rounded-3xl bg-[#172136] p-6 text-white shadow-xl shadow-rvd-plum/10 sm:p-8"><div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-center gap-4"><span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-on-brand"><ClipboardList className="size-7" /></span><div><p className="font-display text-3xl font-extrabold">Relatórios</p><p className="mt-1 text-sm text-white/75">Consolidado operacional de agendamentos e recebimentos.</p></div></div><div className="flex flex-wrap gap-3"><Button onClick={() => appointments.refetch()} variant="ghost" className="h-11 rounded-xl bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><RefreshCw className="size-4" />Carregar relatório</Button><Button onClick={exportExcel} disabled={!rows.length} className="h-11 rounded-xl bg-rvd-blue font-bold text-rvd-plum hover:bg-rvd-blue-pale"><Download className="size-4" />Exportar Excel ({rows.length})</Button></div></div></section>

    <section className="mt-7"><div className="flex flex-wrap items-center gap-2"><button onClick={() => setView("consolidated")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${view === "consolidated" ? "bg-brand text-white shadow-sm" : "bg-rvd-plum-pale text-rvd-plum hover:bg-rvd-plum-soft"}`}><TableProperties className="size-4" />Consolidado</button><button onClick={() => setView("detailed")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${view === "detailed" ? "bg-brand text-white shadow-sm" : "bg-rvd-plum-pale text-rvd-plum hover:bg-rvd-plum-soft"}`}><FileSpreadsheet className="size-4" />Detalhado</button><span className="ml-1 text-sm text-ink-soft">{view === "consolidated" ? "Uma linha por nota — visão geral." : "Consulta com todos os dados operacionais disponíveis."}</span></div></section>

    <section className="mt-7 rounded-3xl bg-sunken p-5 sm:p-7"><div className="flex items-center gap-2"><Filter className="size-5 text-rvd-plum" /><p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-faint">Filtros</p></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><FilterDate label="Agendamento: início" value={filters.scheduledStart || ""} onChange={value => setFilter("scheduledStart", value)} /><FilterDate label="Agendamento: fim" value={filters.scheduledEnd || ""} onChange={value => setFilter("scheduledEnd", value)} /><FilterSelect label="Status" value={filters.status || "all"} onChange={value => setFilter("status", value as ReportFilters["status"])} options={statusOptions} /><FilterText label="Fornecedor (nome ou CNPJ)" value={filters.supplier || ""} onChange={value => setFilter("supplier", value)} placeholder="Buscar fornecedor..." /><FilterText label="Destinatário" value={filters.recipientCnpj || ""} onChange={value => setFilter("recipientCnpj", value)} placeholder="HSH, MSH ou o CNPJ" /><div className="flex items-end"><Button onClick={() => setFilters(initialFilters)} variant="ghost" className="h-11 text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Limpar filtros</Button></div></div></section>

    <section className="mt-7 overflow-hidden panel"><div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-faint">{tituloDaVisao}</p><h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas e recebimentos</h2></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-rvd-plum-pale px-3 py-1.5 text-xs font-bold text-rvd-plum"><Truck className="size-3.5" />{rows.length} notas encontradas</span></div>{appointments.isLoading ? <div className="py-16 text-center font-bold text-rvd-plum">Carregando {tituloDaVisao.toLowerCase()}...</div> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-sunken"><tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{colunas.map(coluna => <th key={coluna} className="px-4 py-4 align-bottom">{coluna}</th>)}</tr></thead><tbody>{rows.length ? rows.map((linha, indice) => <tr key={`${linha["Nota fiscal"]}-${indice}`} className="border-t border-line text-sm text-ink-soft">{colunas.map(coluna => <td key={coluna} className="px-4 py-4"><ReportCell coluna={coluna} valor={linha[coluna]} /></td>)}</tr>) : <tr><td colSpan={colunas.length} className="px-5 py-16 text-center"><Search className="mx-auto size-6 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Nenhuma nota encontrada</p><p className="mt-1 text-sm text-ink-soft">Ajuste os filtros para consultar o relatório.</p></td></tr>}</tbody></table></div>}</section>
  </PortalLayout>;
}

/**
 * Uma célula do relatório. As colunas vêm das próprias linhas — as mesmas que
 * vão para o Excel —, então a tela não tem como mostrar menos do que exporta.
 * Só o número da nota e o status ganham tratamento próprio, que é como eles
 * aparecem no resto do sistema.
 */
function ReportCell({ coluna, valor }: { coluna: string; valor: string }) {
  if (coluna === "Nota fiscal") return <span className="font-display text-base font-extrabold text-ink">{valor}</span>;
  if (coluna === "Status") return <span className="inline-flex whitespace-nowrap rounded-full bg-rvd-plum-pale px-2.5 py-1 text-xs font-bold text-rvd-plum">{valor}</span>;
  if (coluna === "Fornecedor" || coluna === "Item recebido") return <span className="line-clamp-2 max-w-56 font-semibold">{valor}</span>;
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
