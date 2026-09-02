import AttendanceHistoryDialog from "@/components/AttendanceHistoryDialog";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import DockBoard from "@/components/DockBoard";
import GateDayLogPanel from "@/components/GateDayLogPanel";
import LoadingTruck from "@/components/LoadingTruck";
import {
  EmptyState,
  FieldShell,
  Panel,
  PanelBody,
  PanelHeader,
  StatCard,
  fieldClass,
} from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import {
  classificationCopy,
  classificationDetailCopy,
  classificationDetailsFor,
  classificationLabel,
  formatArrival,
  formatElapsed,
  formatWaitMinutes,
  serviceTypeCopy,
  type AttendanceClassification,
  type AttendanceClassificationDetail,
  type AttendanceServiceType,
  type AttendanceStatus,
} from "@/lib/attendance";
import { homePathFor, isPortalGate, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import {
  ClipboardPlus,
  Clock3,
  DoorOpen,
  LogOut,
  Plus,
  SendHorizontal,
  ShieldCheck,
  Timer,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

/** O que a Portaria ainda tem para fazer no pátio, do aceite até a saída. */
const yardStatuses: AttendanceStatus[] = ["aprovado", "em_atendimento", "liberado"];

const emptyForm = {
  driverName: "",
  driverDocument: "",
  licensePlate: "",
  carrier: "",
  serviceType: "recebimento" as AttendanceServiceType,
  classification: "amil" as AttendanceClassification,
  classificationDetail: "maternidade" as AttendanceClassificationDetail,
  notes: "",
};

/**
 * Tela da Portaria. O portão é o começo e o fim do caminho do caminhão: aqui se
 * registra a chegada e se envia para a Operação decidir, aqui se abre a entrada
 * depois do aceite e aqui se fecha o protocolo quando o caminhão vai embora.
 */
export default function PortariaPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState(emptyForm);
  // Um caminhão costuma trazer várias notas do mesmo motorista.
  const [invoiceNumbers, setInvoiceNumbers] = useState<string[]>([""]);
  const [historyFor, setHistoryFor] = useState<{ id: number; protocol: string } | null>(null);

  // A resposta da Operação chega enquanto o caminhão está parado no acesso,
  // então as listas se atualizam sozinhas em vez de depender de recarregar.
  const waiting = trpc.attendances.list.useQuery({ status: "aguardando" }, { refetchInterval: 20_000 });
  const yard = trpc.attendances.list.useQuery({ statuses: yardStatuses }, { refetchInterval: 20_000 });
  const dayLog = trpc.attendances.dayLog.useQuery(undefined, { refetchInterval: 60_000 });
  const overview = trpc.attendances.overview.useQuery(undefined, { refetchInterval: 20_000 });

  const refreshBoard = () => {
    utils.attendances.list.invalidate();
    utils.attendances.dayLog.invalidate();
    utils.attendances.overview.invalidate();
  };

  const create = trpc.attendances.create.useMutation({
    onSuccess: attendance => {
      toast.success(
        attendance
          ? `Enviado para a Operação. Protocolo ${attendance.protocol}.`
          : "Chegada enviada para a Operação."
      );
      setForm(emptyForm);
      setInvoiceNumbers([""]);
      refreshBoard();
    },
    onError: error => toast.error(error.message),
  });

  const execute = trpc.attendances.executeAction.useMutation({
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === "iniciar" ? "Entrada liberada no portão." : "Saída registrada. Protocolo encerrado."
      );
      refreshBoard();
    },
    onError: error => toast.error(error.message),
  });

  // A categoria depende da classificação: trocar de AMIL para RVD deixaria um
  // subtipo inválido selecionado, que o servidor recusaria no envio.
  useEffect(() => {
    const allowed = classificationDetailsFor(form.classification);
    if (!allowed.includes(form.classificationDetail)) {
      setForm(current => ({ ...current, classificationDetail: allowed[0] }));
    }
  }, [form.classification, form.classificationDetail]);

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    const current = auth.data?.role as PortalRole | undefined;
    if (current && !isPortalGate(current)) setLocation(homePathFor(current));
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Abrindo a portaria" />;
  if (!auth.data || !isPortalGate(auth.data.role as PortalRole)) return <div className="min-h-screen bg-canvas" />;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function updateInvoice(index: number, value: string) {
    setInvoiceNumbers(current => current.map((item, position) => (position === index ? value : item)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const notes = form.notes.trim();
    create.mutate({
      ...form,
      driverDocument: form.driverDocument.trim() || undefined,
      notes: notes || undefined,
      invoiceNumbers: invoiceNumbers.map(item => item.trim()).filter(Boolean),
    });
  }

  const isAdmin = auth.data.role === "admin";
  const metrics = overview.data;
  const pending = waiting.data ?? [];
  const inYard = yard.data ?? [];
  const today = dayLog.data ?? [];
  const enteredToday = today.filter(item => item.status !== "aguardando" && item.status !== "recusado");

  return (
    <PortalLayout
      user={auth.data}
      title="Portaria"
      subtitle="Registre a chegada, libere a entrada depois do aceite da Operação e feche o protocolo na saída."
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aguardando a Operação" value={metrics?.awaiting ?? "—"} hint="Enviados e sem resposta" icon={Clock3} tone="wait" />
          <StatCard label="Entradas aprovadas hoje" value={enteredToday.length} hint="Caminhões que entraram" icon={ShieldCheck} tone="go" />
          <StatCard label="Recebimentos recusados" value={metrics?.refused ?? "—"} hint="Com o motivo registrado" icon={XCircle} tone="stop" />
          <StatCard
            label="Espera média"
            value={metrics ? formatWaitMinutes(metrics.averageReleaseWaitMinutes) : "—"}
            hint="Dos caminhões ainda em curso"
            icon={Timer}
            tone="brand"
          />
        </section>

        <Panel>
          <PanelHeader
            eyebrow="Nova chegada"
            title="Registrar e enviar para a Operação"
            description="Os dados do motorista e das notas abrem o protocolo e vão para a decisão de quem recebe."
            icon={ClipboardPlus}
          />
          <form onSubmit={submit}>
            <PanelBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FieldShell label="Motorista" htmlFor="driverName">
                <input
                  id="driverName"
                  value={form.driverName}
                  onChange={event => update("driverName", event.target.value)}
                  placeholder="Nome completo"
                  required
                  minLength={3}
                  className={fieldClass}
                />
              </FieldShell>
              <FieldShell label="RG" htmlFor="driverDocument">
                <input
                  id="driverDocument"
                  value={form.driverDocument}
                  onChange={event => update("driverDocument", event.target.value)}
                  placeholder="Documento do motorista"
                  maxLength={32}
                  className={fieldClass}
                />
              </FieldShell>
              <FieldShell label="Placa" htmlFor="licensePlate">
                <input
                  id="licensePlate"
                  value={form.licensePlate}
                  onChange={event => update("licensePlate", event.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                  required
                  minLength={7}
                  className={`${fieldClass} font-mono uppercase tracking-wide`}
                />
              </FieldShell>
              <FieldShell label="Transportadora" htmlFor="carrier">
                <input
                  id="carrier"
                  value={form.carrier}
                  onChange={event => update("carrier", event.target.value)}
                  placeholder="Empresa do transporte"
                  required
                  minLength={2}
                  className={fieldClass}
                />
              </FieldShell>
              <FieldShell label="Tipo de atendimento" htmlFor="serviceType">
                <select
                  id="serviceType"
                  value={form.serviceType}
                  onChange={event => update("serviceType", event.target.value as AttendanceServiceType)}
                  className={fieldClass}
                >
                  {(Object.keys(serviceTypeCopy) as AttendanceServiceType[]).map(value => (
                    <option key={value} value={value}>
                      {serviceTypeCopy[value]}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <FieldShell label="Classificação" htmlFor="classification">
                <select
                  id="classification"
                  value={form.classification}
                  onChange={event => update("classification", event.target.value as AttendanceClassification)}
                  className={fieldClass}
                >
                  {(Object.keys(classificationCopy) as AttendanceClassification[]).map(value => (
                    <option key={value} value={value}>
                      {classificationCopy[value]}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <FieldShell label="Categoria específica" htmlFor="classificationDetail">
                <select
                  id="classificationDetail"
                  value={form.classificationDetail}
                  onChange={event => update("classificationDetail", event.target.value as AttendanceClassificationDetail)}
                  className={fieldClass}
                >
                  {classificationDetailsFor(form.classification).map(value => (
                    <option key={value} value={value}>
                      {classificationDetailCopy[value]}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <div className="grid gap-1.5 sm:col-span-2 xl:col-span-3">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">Número da nota</span>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {invoiceNumbers.map((number, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={number}
                        onChange={event => updateInvoice(index, event.target.value)}
                        placeholder={index === 0 ? "Ex.: 123456" : "Outra nota do mesmo motorista"}
                        maxLength={60}
                        aria-label={`Número da nota ${index + 1}`}
                        className={fieldClass}
                      />
                      {invoiceNumbers.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setInvoiceNumbers(current => current.filter((_, position) => position !== index))}
                          aria-label={`Remover a nota ${index + 1}`}
                          className="size-11 shrink-0 rounded-xl border-line p-0 text-ink-soft hover:text-state-stop"
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInvoiceNumbers(current => [...current, ""])}
                  className="mt-1 h-9 w-fit rounded-lg border-line px-3 text-xs font-bold text-ink-soft hover:text-ink"
                >
                  <Plus className="size-4" />
                  Adicionar nota
                </Button>
                <p className="text-xs text-ink-faint">O mesmo motorista costuma trazer mais de uma nota.</p>
              </div>

              <FieldShell
                label="Observações para a Operação"
                htmlFor="notes"
                hint="Opcional — o que quem vai receber a carga precisa saber antes de decidir."
                className="sm:col-span-2 xl:col-span-3"
              >
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={event => update("notes", event.target.value)}
                  placeholder="Ex.: carga refrigerada, entrega parcial, documento pendente"
                  maxLength={1000}
                  className={`${fieldClass} min-h-24 resize-y py-2.5`}
                />
              </FieldShell>
            </PanelBody>
            <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
              <Button
                type="submit"
                disabled={create.isPending}
                className="h-11 rounded-xl bg-rvd-plum px-5 text-sm font-bold text-white hover:bg-rvd-plum/90"
              >
                <SendHorizontal className="size-4" />
                {create.isPending ? "Enviando..." : "Enviar para a Operação"}
              </Button>
            </div>
          </form>
        </Panel>

        <DockBoard />

        <Panel>
          <PanelHeader
            eyebrow="No portão agora"
            title="Entradas e saídas"
            description="Depois do aceite da Operação, é a Portaria que abre a entrada e registra a saída."
            icon={DoorOpen}
            actions={
              <span className="rounded-lg bg-canvas px-3 py-1.5 text-xs font-bold text-ink-soft">
                {pending.length} aguardando resposta
              </span>
            }
          />
          {yard.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Consultando o pátio...</p>
            </PanelBody>
          ) : inYard.length ? (
            <ul className="divide-y divide-line">
              {inYard.map(item => (
                <li key={item.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-ink-faint">{item.protocol}</span>
                    <AttendanceStatusBadge status={item.status} />
                    <span className="ml-auto text-xs font-bold text-ink-soft">na unidade há {formatElapsed(item.arrivalAt)}</span>
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
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.status === "aprovado" && (
                      <Button
                        onClick={() => execute.mutate({ attendanceId: item.id, action: "iniciar" })}
                        disabled={execute.isPending}
                        className="h-9 rounded-lg bg-state-go px-3.5 text-xs font-bold text-white hover:bg-state-go/90"
                      >
                        <DoorOpen className="size-4" />
                        Liberar entrada
                      </Button>
                    )}
                    {item.status === "em_atendimento" && (
                      <span className="rounded-lg bg-canvas px-3 py-2 text-xs font-bold text-ink-soft">
                        Na doca com a Operação
                      </span>
                    )}
                    {item.status === "liberado" && (
                      <Button
                        onClick={() => execute.mutate({ attendanceId: item.id, action: "concluir" })}
                        disabled={execute.isPending}
                        className="h-9 rounded-lg bg-rvd-plum px-3.5 text-xs font-bold text-white hover:bg-rvd-plum/90"
                      >
                        <LogOut className="size-4" />
                        Registrar saída
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
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Truck}
              title="Nenhum caminhão no pátio"
              description="Os caminhões aceitos pela Operação aparecem aqui para você liberar a entrada e depois a saída."
            />
          )}
        </Panel>

        <GateDayLogPanel isAdmin={isAdmin} />
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
