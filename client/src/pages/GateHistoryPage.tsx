import AttendanceHistoryDialog from "@/components/AttendanceHistoryDialog";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import LoadingTruck from "@/components/LoadingTruck";
import { DataTable, EmptyState, FieldShell, Panel, PanelBody, PanelHeader, StatCard, fieldClass } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import {
  attendanceStatusCopy,
  classificationLabel,
  serviceTypeCopy,
  type AttendanceStatus,
} from "@/lib/attendance";
import { canSeeAttendances, homePathFor, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import {
  formatMinutes,
  gateReportColumns,
  minutesBetween,
  parseInvoiceNumbers,
  reportDate,
  reportTime,
  toGateReportRow,
  type GateReportSource,
} from "@shared/attendanceReport";
import { CalendarRange, ClipboardList, Download, Search, Timer, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import PortalLayout from "./PortalLayout";

/** Data de hoje em São Paulo, no formato que os campos de data usam. */
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function daysAgoKey(days: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() - days * 86_400_000)
  );
}

const statusOptions = [["todos", "Todos os status"], ...Object.entries(attendanceStatusCopy)] as const;
const serviceOptions = [["todos", "Coletas e recebimentos"], ...Object.entries(serviceTypeCopy)] as const;

/**
 * O histórico geral do portão. A tela do dia responde "o que está acontecendo
 * agora"; esta responde "o que aconteceu no período" — e é dela que sai a
 * planilha que a operação leva para fora do sistema.
 */
export default function GateHistoryPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  // Uma semana é o período que o porteiro confere no fim do turno; o resto se
  // alcança mudando as datas.
  const [from, setFrom] = useState(() => daysAgoKey(7));
  const [to, setTo] = useState(todayKey);
  const [status, setStatus] = useState<string>("todos");
  const [service, setService] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: number; protocol: string } | null>(null);

  const report = trpc.attendances.report.useQuery({ from, to }, { enabled: from <= to });

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    const role = auth.data?.role as PortalRole | undefined;
    if (role && !canSeeAttendances(role)) setLocation(homePathFor(role));
  }, [auth.data, setLocation]);

  const all = useMemo(() => report.data ?? [], [report.data]);

  // O filtro é local: o período já veio do servidor, e refazer a consulta a
  // cada letra digitada só faria a tela piscar.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter(item => {
      if (status !== "todos" && item.status !== status) return false;
      if (service !== "todos" && item.serviceType !== service) return false;
      if (!term) return true;
      const haystack = [
        item.protocol,
        item.licensePlate,
        item.driverName,
        item.supplierName ?? "",
        parseInvoiceNumbers(item.invoiceNumbersJson).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [all, status, service, search]);

  const concluded = rows.filter(item => item.concludedAt);
  const averageStay = concluded.length
    ? Math.round(
        concluded.reduce((total, item) => {
          const minutes = minutesBetween(item.arrivalAt, item.concludedAt);
          return total + (minutes === "" ? 0 : minutes);
        }, 0) / concluded.length
      )
    : 0;

  function exportExcel() {
    if (!rows.length) return toast.error("Nenhum atendimento no filtro para exportar.");
    const sheetRows = rows.map(item =>
      toGateReportRow(item as GateReportSource, {
        status: value => attendanceStatusCopy[value as AttendanceStatus] ?? value,
        serviceType: value => serviceTypeCopy[value as keyof typeof serviceTypeCopy] ?? value,
        classification: source => classificationLabel(source.classification, source.classificationDetail as never),
      })
    );
    const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: gateReportColumns.map(column => column.key) });
    worksheet["!cols"] = gateReportColumns.map(column => ({ wch: column.width }));
    // Congelar o cabeçalho: a planilha do portão passa de cem linhas rápido.
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Portaria");
    XLSX.writeFile(workbook, `historico-portaria-${from}-a-${to}.xlsx`);
    toast.success(`${sheetRows.length} atendimento(s) exportado(s).`);
  }

  if (auth.isLoading) return <LoadingTruck label="Abrindo o histórico" />;
  if (!auth.data || !canSeeAttendances(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  return (
    <PortalLayout
      user={auth.data}
      title="Histórico da portaria"
      subtitle="Tudo que passou pelo portão no período, com os horários, a permanência e as esperas."
      actions={
        <Button
          onClick={exportExcel}
          disabled={!rows.length}
          className="h-11 rounded-xl bg-rvd-plum px-4 text-sm font-bold text-white hover:bg-rvd-plum/90"
        >
          <Download className="size-4" />
          Exportar Excel ({rows.length})
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Atendimentos no filtro" value={rows.length} hint="Chegadas registradas" icon={ClipboardList} tone="brand" />
          <StatCard label="Concluídos" value={concluded.length} hint="Com saída registrada" icon={Truck} tone="go" />
          <StatCard
            label="Permanência média"
            value={concluded.length ? formatMinutes(averageStay) : "—"}
            hint="Da chegada à saída"
            icon={Timer}
            tone="neutral"
          />
          <StatCard
            label="Período"
            value={`${reportDate(`${from}T12:00:00`)} — ${reportDate(`${to}T12:00:00`)}`}
            hint="Dias de São Paulo"
            icon={CalendarRange}
            tone="wait"
          />
        </section>

        <Panel>
          <PanelHeader eyebrow="Consulta" title="Período e filtros" description="O período é buscado no servidor; o resto filtra o que já está na tela." icon={Search} />
          <PanelBody>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <FieldShell label="De" htmlFor="from">
                <input id="from" type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} className={fieldClass} />
              </FieldShell>
              <FieldShell label="Até" htmlFor="to">
                <input id="to" type="date" value={to} min={from} max={todayKey()} onChange={event => setTo(event.target.value)} className={fieldClass} />
              </FieldShell>
              <FieldShell label="Status" htmlFor="status">
                <select id="status" value={status} onChange={event => setStatus(event.target.value)} className={fieldClass}>
                  {statusOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <FieldShell label="Tipo" htmlFor="service">
                <select id="service" value={service} onChange={event => setService(event.target.value)} className={fieldClass}>
                  {serviceOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <FieldShell label="Buscar" htmlFor="search">
                <input
                  id="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Placa, motorista, nota, protocolo"
                  className={fieldClass}
                />
              </FieldShell>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Histórico"
            title="Atendimentos do período"
            description="A planilha exportada leva estas mesmas linhas, com os tempos também em minutos."
            icon={ClipboardList}
            actions={
              <span className="rounded-lg bg-canvas px-3 py-1.5 font-display text-lg font-extrabold tabular-nums text-ink">
                {rows.length}
              </span>
            }
          />
          {report.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Consultando o histórico...</p>
            </PanelBody>
          ) : rows.length ? (
            <DataTable
              head={
                <>
                  <th>Protocolo</th>
                  <th>Caminhão</th>
                  <th>Atendimento</th>
                  <th>Doca</th>
                  <th>Chegada</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Permanência</th>
                  <th>Status</th>
                  <th className="text-right">Registro</th>
                </>
              }
            >
              {rows.map(item => {
                const stay = minutesBetween(item.arrivalAt, item.concludedAt);
                return (
                  <tr key={item.id} className="align-top transition-colors hover:bg-canvas/70 [&>td]:px-5 [&>td]:py-4 sm:[&>td]:px-6">
                    <td>
                      <p className="font-mono text-xs font-bold text-ink">{item.protocol}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">{reportDate(item.arrivalAt)}</p>
                    </td>
                    <td>
                      <p className="font-mono text-sm font-bold text-ink">{item.licensePlate}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">{item.driverName}</p>
                      {item.supplierName && <p className="mt-0.5 text-xs text-ink-faint">{item.supplierName}</p>}
                    </td>
                    <td>
                      <p className="text-sm font-bold text-ink">{serviceTypeCopy[item.serviceType]}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {classificationLabel(item.classification, item.classificationDetail)}
                      </p>
                    </td>
                    <td>
                      {item.dockNumber ? (
                        <p className="text-sm font-bold text-ink">{item.dockNumber}</p>
                      ) : (
                        <span className="text-xs text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="text-xs text-ink-soft">{reportTime(item.arrivalAt)}</td>
                    <td className="text-xs text-ink-soft">{reportTime(item.enteredAt) || "—"}</td>
                    <td className="text-xs text-ink-soft">{reportTime(item.concludedAt) || "—"}</td>
                    <td>
                      {stay === "" ? (
                        <span className="text-xs text-ink-faint">—</span>
                      ) : (
                        <p className="text-sm font-bold text-ink">{formatMinutes(stay)}</p>
                      )}
                    </td>
                    <td>
                      <AttendanceStatusBadge status={item.status} />
                      {item.status === "recusado" && item.refusalReason && (
                        <p className="mt-1.5 max-w-xs text-xs text-state-stop">{item.refusalReason}</p>
                      )}
                    </td>
                    <td className="text-right">
                      <Button
                        onClick={() => setHistoryFor({ id: item.id, protocol: item.protocol })}
                        variant="ghost"
                        className="h-8 rounded-lg px-2.5 text-xs font-bold text-ink-soft hover:text-ink"
                      >
                        Histórico
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <EmptyState
              icon={Search}
              title={all.length ? "Nenhum atendimento neste filtro" : "Nenhum atendimento no período"}
              description={
                all.length
                  ? "Ajuste o status, o tipo ou a busca para encontrar o atendimento."
                  : "Escolha outro período para consultar o histórico do portão."
              }
            />
          )}
        </Panel>
      </div>

      {historyFor && (
        <AttendanceHistoryDialog
          attendanceId={historyFor.id}
          protocol={historyFor.protocol}
          open
          onOpenChange={open => !open && setHistoryFor(null)}
        />
      )}
    </PortalLayout>
  );
}
