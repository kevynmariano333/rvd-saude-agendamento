import AttendanceHistoryDialog from "@/components/AttendanceHistoryDialog";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import LoadingTruck from "@/components/LoadingTruck";
import { DataTable, EmptyState, Panel, PanelBody, PanelHeader, SegmentedControl, StatCard } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import {
  classificationLabel,
  formatArrival,
  formatElapsed,
  serviceTypeCopy,
  type AttendanceServiceType,
  type AttendanceStatus,
} from "@/lib/attendance";
import { isPortalYard, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { CircleAlert, PackageCheck, Play, RadioTower, Send, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

type ServiceFilter = "todos" | AttendanceServiceType;

/** O pátio trata o que a Portaria já aprovou e ainda não encerrou. */
const activeStatuses: AttendanceStatus[] = ["aprovado", "em_atendimento", "liberado"];

const actionCopy = {
  iniciar: "Atendimento iniciado.",
  liberar: "Liberação registrada.",
  concluir: "Atendimento concluído.",
} as const;

export default function OperacaoPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<ServiceFilter>("todos");
  const [historyFor, setHistoryFor] = useState<{ id: number; protocol: string } | null>(null);

  const records = trpc.attendances.list.useQuery({ statuses: activeStatuses }, { refetchInterval: 20_000 });
  const role = (auth.data?.role ?? "supplier") as PortalRole;
  const canManage = isPortalYard(role);

  const execute = trpc.attendances.executeAction.useMutation({
    onSuccess: (_, variables) => {
      toast.success(actionCopy[variables.action]);
      utils.attendances.list.invalidate();
      utils.attendances.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    if (auth.data?.role === "supplier") setLocation("/fornecedor");
  }, [auth.data, setLocation]);

  const all = useMemo(() => records.data ?? [], [records.data]);
  const items = useMemo(
    () => (filter === "todos" ? all : all.filter(item => item.serviceType === filter)),
    [all, filter]
  );

  if (auth.isLoading) return <LoadingTruck label="Abrindo o pátio" />;
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-canvas" />;

  const approved = all.filter(item => item.status === "aprovado").length;
  const inProgress = all.filter(item => item.status === "em_atendimento").length;
  const released = all.filter(item => item.status === "liberado").length;

  return (
    <PortalLayout
      user={auth.data}
      title="Operação"
      subtitle="Conduza coletas e recebimentos aprovados até a liberação e a conclusão."
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Aguardando início" value={approved} hint="Aprovados pela Portaria" icon={Truck} tone="go" />
          <StatCard label="Em atendimento" value={inProgress} hint="Na doca neste momento" icon={RadioTower} tone="brand" />
          <StatCard label="Liberados" value={released} hint="Aguardando conclusão" icon={Send} tone="neutral" />
        </section>

        {!canManage && (
          <div className="flex items-start gap-3 rounded-xl border border-state-wait/30 bg-state-wait-bg px-4 py-3 text-sm text-state-wait">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Seu perfil acompanha o pátio, mas não pode iniciar, liberar ou concluir atendimentos. Fale com o
              administrador para receber o perfil de Operação.
            </p>
          </div>
        )}

        <Panel>
          <PanelHeader
            eyebrow="Fluxo do pátio"
            title="Atendimentos ativos"
            description="Cada caminhão avança na ordem: iniciar, liberar e concluir."
            icon={PackageCheck}
            actions={
              <SegmentedControl
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "todos", label: "Todos", count: all.length },
                  { value: "coleta", label: "Coletas", count: all.filter(item => item.serviceType === "coleta").length },
                  { value: "recebimento", label: "Recebimentos", count: all.filter(item => item.serviceType === "recebimento").length },
                ]}
              />
            }
          />
          {records.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Consultando atendimentos aprovados...</p>
            </PanelBody>
          ) : items.length ? (
            <DataTable
              head={
                <>
                  <th>Caminhão</th>
                  <th>Atendimento</th>
                  <th>Na unidade</th>
                  <th>Status</th>
                  <th className="text-right">Ações</th>
                </>
              }
            >
              {items.map(item => (
                <tr key={item.id} className="align-middle transition-colors hover:bg-canvas/70 [&>td]:px-5 [&>td]:py-4 sm:[&>td]:px-6">
                  <td>
                    <p className="font-mono text-sm font-bold text-ink">{item.licensePlate}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {item.driverName} · {item.carrier}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{item.protocol}</p>
                  </td>
                  <td>
                    <p className="text-sm font-bold text-ink">{serviceTypeCopy[item.serviceType]}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {classificationLabel(item.classification, item.classificationDetail)}
                    </p>
                  </td>
                  <td>
                    <p className="text-sm font-bold text-ink">há {formatElapsed(item.arrivalAt)}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">Desde {formatArrival(item.arrivalAt)}</p>
                  </td>
                  <td>
                    <AttendanceStatusBadge status={item.status} />
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {item.status === "aprovado" && (
                        <Button
                          onClick={() => execute.mutate({ attendanceId: item.id, action: "iniciar" })}
                          disabled={!canManage || execute.isPending}
                          className="h-9 rounded-lg bg-rvd-plum px-3.5 text-xs font-bold text-white hover:bg-rvd-plum/90"
                        >
                          <Play className="size-4" />
                          Iniciar
                        </Button>
                      )}
                      {item.status === "em_atendimento" && (
                        <Button
                          onClick={() => execute.mutate({ attendanceId: item.id, action: "liberar" })}
                          disabled={!canManage || execute.isPending}
                          className="h-9 rounded-lg bg-state-move px-3.5 text-xs font-bold text-white hover:bg-state-move/90"
                        >
                          <Send className="size-4" />
                          Liberar
                        </Button>
                      )}
                      {(item.status === "liberado" || item.status === "em_atendimento") && (
                        <Button
                          onClick={() => execute.mutate({ attendanceId: item.id, action: "concluir" })}
                          disabled={!canManage || execute.isPending}
                          variant="outline"
                          className="h-9 rounded-lg border-line bg-surface px-3.5 text-xs font-bold text-state-go hover:bg-state-go-bg"
                        >
                          <PackageCheck className="size-4" />
                          Concluir
                        </Button>
                      )}
                      <Button
                        onClick={() => setHistoryFor({ id: item.id, protocol: item.protocol })}
                        variant="ghost"
                        className="h-9 rounded-lg px-3 text-xs font-bold text-ink-soft hover:text-ink"
                      >
                        Histórico
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState
              icon={PackageCheck}
              title={filter === "todos" ? "Nenhum atendimento ativo" : "Nenhum atendimento neste filtro"}
              description="Assim que a Portaria aprovar uma entrada, o caminhão aparece nesta fila para ser conduzido."
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
