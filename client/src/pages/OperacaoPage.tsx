import AttendanceHistoryDialog from "@/components/AttendanceHistoryDialog";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import GateDayLogPanel from "@/components/GateDayLogPanel";
import LoadingTruck from "@/components/LoadingTruck";
import {
  DataTable,
  EmptyState,
  FieldShell,
  Panel,
  PanelBody,
  PanelHeader,
  SegmentedControl,
  StatCard,
  fieldClass,
} from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  classificationLabel,
  formatArrival,
  formatElapsed,
  serviceTypeCopy,
  type AttendanceServiceType,
  type AttendanceStatus,
} from "@/lib/attendance";
import { homePathFor, isPortalYard, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import {
  Inbox,
  PackageCheck,
  RadioTower,
  Send,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

type ServiceFilter = "todos" | AttendanceServiceType;

/** O pátio conduz o que já foi aceito e ainda não encerrou. */
const activeStatuses: AttendanceStatus[] = ["aprovado", "em_atendimento", "liberado"];

/** Da doca, a Operação só registra a liberação: o portão é da Portaria. */
const actionCopy = { liberar: "Liberação registrada. A Portaria pode encerrar a saída." } as const;

/**
 * Tela da Operação. É aqui que se aceita ou recusa o recebimento enviado pela
 * Portaria e, uma vez aceito, o caminhão é conduzido até a conclusão.
 */
export default function OperacaoPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<ServiceFilter>("todos");
  const [historyFor, setHistoryFor] = useState<{ id: number; protocol: string } | null>(null);
  const [refusal, setRefusal] = useState<{ id: number; protocol: string; plate: string } | null>(null);
  const [refusalReason, setRefusalReason] = useState("");

  const incoming = trpc.attendances.list.useQuery({ status: "aguardando" }, { refetchInterval: 15_000 });
  const records = trpc.attendances.list.useQuery({ statuses: activeStatuses }, { refetchInterval: 20_000 });
  const overview = trpc.attendances.overview.useQuery(undefined, { refetchInterval: 20_000 });

  const refreshBoard = () => {
    utils.attendances.list.invalidate();
    utils.attendances.overview.invalidate();
  };

  const decide = trpc.attendances.decideReceipt.useMutation({
    onSuccess: (_, variables) => {
      toast.success(
        variables.decision === "aprovar"
          ? "Recebimento aceito. O caminhão pode entrar."
          : "Recebimento recusado com o motivo registrado."
      );
      setRefusal(null);
      setRefusalReason("");
      refreshBoard();
    },
    onError: error => toast.error(error.message),
  });

  const execute = trpc.attendances.executeAction.useMutation({
    onSuccess: () => {
      toast.success(actionCopy.liberar);
      refreshBoard();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    const current = auth.data?.role as PortalRole | undefined;
    if (current && !isPortalYard(current)) setLocation(homePathFor(current));
  }, [auth.data, setLocation]);

  const all = useMemo(() => records.data ?? [], [records.data]);
  const items = useMemo(
    () => (filter === "todos" ? all : all.filter(item => item.serviceType === filter)),
    [all, filter]
  );

  if (auth.isLoading) return <LoadingTruck label="Abrindo o pátio" />;
  if (!auth.data || !isPortalYard(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  const queue = incoming.data ?? [];
  const metrics = overview.data;

  return (
    <PortalLayout
      user={auth.data}
      title="Operação"
      subtitle="Aceite ou recuse os recebimentos enviados pela Portaria e libere a doca quando o atendimento terminar."
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aguardando sua decisão" value={queue.length} hint="Enviados pela Portaria" icon={Inbox} tone="wait" />
          <StatCard
            label="Aguardando a Portaria"
            value={all.filter(item => item.status === "aprovado").length}
            hint="Aceitos, esperando a entrada"
            icon={Truck}
            tone="go"
          />
          <StatCard
            label="Em atendimento"
            value={all.filter(item => item.status === "em_atendimento").length}
            hint="Na doca neste momento"
            icon={RadioTower}
            tone="brand"
          />
          <StatCard
            label="Movimentação de hoje"
            value={metrics ? metrics.collectionsToday + metrics.receiptsToday : "—"}
            hint={
              metrics
                ? `${metrics.collectionsToday} coleta(s) · ${metrics.receiptsToday} recebimento(s)`
                : "Chegadas registradas hoje"
            }
            icon={PackageCheck}
            tone="neutral"
          />
        </section>


        <Panel>
          <PanelHeader
            eyebrow="Enviados pela Portaria"
            title="Aceitar o recebimento"
            description="Aceitar libera a entrada do caminhão; recusar exige o motivo, que volta para a Portaria."
            icon={Inbox}
            actions={
              <span className="rounded-lg bg-canvas px-3 py-1.5 font-display text-lg font-extrabold tabular-nums text-ink">
                {queue.length}
              </span>
            }
          />
          {incoming.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Consultando o que a Portaria enviou...</p>
            </PanelBody>
          ) : queue.length ? (
            <ul className="divide-y divide-line">
              {queue.map(item => (
                <li key={item.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-ink-faint">{item.protocol}</span>
                    <AttendanceStatusBadge status={item.status} />
                    <span className="ml-auto text-xs font-bold text-ink-soft">esperando há {formatElapsed(item.arrivalAt)}</span>
                  </div>
                  <p className="mt-2 font-display text-lg font-extrabold tracking-tight text-ink">
                    <span className="font-mono">{item.licensePlate}</span>
                    <span className="mx-2 text-ink-faint">·</span>
                    {item.driverName}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {item.carrier} — {serviceTypeCopy[item.serviceType]} ·{" "}
                    {classificationLabel(item.classification, item.classificationDetail)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">Chegada em {formatArrival(item.arrivalAt)}</p>
                  {item.notes && (
                    <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-ink-soft">
                      <span className="font-bold">Da Portaria: </span>
                      {item.notes}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => decide.mutate({ attendanceId: item.id, decision: "aprovar" })}
                      disabled={decide.isPending}
                      className="h-9 rounded-lg bg-state-go px-3.5 text-xs font-bold text-white hover:bg-state-go/90"
                    >
                      <ShieldCheck className="size-4" />
                      Aceitar recebimento
                    </Button>
                    <Button
                      onClick={() => {
                        setRefusalReason("");
                        setRefusal({ id: item.id, protocol: item.protocol, plate: item.licensePlate });
                      }}
                      disabled={decide.isPending}
                      variant="outline"
                      className="h-9 rounded-lg border-line bg-surface px-3.5 text-xs font-bold text-state-stop hover:bg-state-stop-bg"
                    >
                      <XCircle className="size-4" />
                      Recusar
                    </Button>
                    <Button
                      onClick={() => setHistoryFor({ id: item.id, protocol: item.protocol })}
                      variant="ghost"
                      className="h-9 rounded-lg px-3 text-xs font-bold text-ink-soft hover:text-ink"
                    >
                      Histórico
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Nada aguardando decisão"
              description="Quando a Portaria registrar uma chegada, ela aparece aqui para você aceitar ou recusar."
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Fluxo do pátio"
            title="Atendimentos aceitos"
            description="A Portaria abre a entrada, a Operação libera a doca e a Portaria fecha a saída."
            icon={PackageCheck}
            actions={
              <SegmentedControl
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "todos", label: "Todos", count: all.length },
                  { value: "coleta", label: "Coletas", count: all.filter(item => item.serviceType === "coleta").length },
                  {
                    value: "recebimento",
                    label: "Recebimentos",
                    count: all.filter(item => item.serviceType === "recebimento").length,
                  },
                ]}
              />
            }
          />
          {records.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Consultando atendimentos aceitos...</p>
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
                    {item.notes && <p className="mt-1 max-w-xs text-xs text-ink-faint">Da Portaria: {item.notes}</p>}
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
                        <span className="rounded-lg bg-canvas px-3 py-2 text-xs font-bold text-ink-soft">
                          Aguardando a Portaria liberar a entrada
                        </span>
                      )}
                      {item.status === "em_atendimento" && (
                        <Button
                          onClick={() => execute.mutate({ attendanceId: item.id, action: "liberar" })}
                          disabled={execute.isPending}
                          className="h-9 rounded-lg bg-state-move px-3.5 text-xs font-bold text-white hover:bg-state-move/90"
                        >
                          <Send className="size-4" />
                          Liberar
                        </Button>
                      )}
                      {item.status === "liberado" && (
                        <span className="rounded-lg bg-canvas px-3 py-2 text-xs font-bold text-ink-soft">
                          Na Portaria para registrar a saída
                        </span>
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
              title={filter === "todos" ? "Nenhum atendimento em curso" : "Nenhum atendimento neste filtro"}
              description="Assim que você aceitar um recebimento, o caminhão aparece nesta fila para ser conduzido."
            />
          )}
        </Panel>

        <GateDayLogPanel isAdmin={auth.data.role === "admin"} />
      </div>

      <Dialog open={Boolean(refusal)} onOpenChange={open => !open && setRefusal(null)}>
        <DialogContent className="max-w-md rounded-2xl border-line bg-surface">
          <DialogHeader className="text-left">
            <p className="eyebrow">Decisão do recebimento</p>
            <DialogTitle className="font-display text-xl font-extrabold text-ink">Recusar recebimento</DialogTitle>
            <DialogDescription className="text-sm text-ink-soft">
              Protocolo {refusal?.protocol} · placa {refusal?.plate}. O motivo volta para a Portaria informar ao
              motorista e fica no histórico.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={event => {
              event.preventDefault();
              if (!refusal) return;
              decide.mutate({ attendanceId: refusal.id, decision: "recusar", refusalReason });
            }}
          >
            <FieldShell label="Motivo da recusa" htmlFor="refusalReason">
              <textarea
                id="refusalReason"
                value={refusalReason}
                onChange={event => setRefusalReason(event.target.value)}
                placeholder="Descreva por que o recebimento não pode ser feito"
                required
                maxLength={1000}
                className={`${fieldClass} min-h-28 resize-y py-2.5`}
              />
            </FieldShell>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRefusal(null)} className="h-10 rounded-xl border-line">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={decide.isPending || !refusalReason.trim()}
                className="h-10 rounded-xl bg-state-stop px-4 text-sm font-bold text-white hover:bg-state-stop/90"
              >
                {decide.isPending ? "Registrando..." : "Confirmar recusa"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
