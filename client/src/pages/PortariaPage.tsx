import AttendanceHistoryDialog from "@/components/AttendanceHistoryDialog";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import LoadingTruck from "@/components/LoadingTruck";
import { EmptyState, FieldShell, Panel, PanelBody, PanelHeader, StatCard, fieldClass } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
} from "@/lib/attendance";
import { isPortalGate, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { CircleAlert, ClipboardCheck, ClipboardPlus, Clock3, ShieldCheck, Timer, Truck, XCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import PortalLayout from "./PortalLayout";

const emptyForm = {
  driverName: "",
  licensePlate: "",
  carrier: "",
  serviceType: "recebimento" as AttendanceServiceType,
  classification: "amil" as AttendanceClassification,
  classificationDetail: "maternidade" as AttendanceClassificationDetail,
  notes: "",
};

export default function PortariaPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState(emptyForm);
  const [refusal, setRefusal] = useState<{ id: number; protocol: string } | null>(null);
  const [refusalReason, setRefusalReason] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: number; protocol: string } | null>(null);

  // A fila do portão muda enquanto o caminhão está parado no acesso, então ela
  // se atualiza sozinha em vez de depender de o operador recarregar a página.
  const queue = trpc.attendances.list.useQuery({ status: "aguardando" }, { refetchInterval: 20_000 });
  const overview = trpc.attendances.overview.useQuery(undefined, { refetchInterval: 20_000 });

  const role = (auth.data?.role ?? "supplier") as PortalRole;
  const canManage = isPortalGate(role);

  const refreshBoard = () => {
    utils.attendances.list.invalidate();
    utils.attendances.overview.invalidate();
  };

  const create = trpc.attendances.create.useMutation({
    onSuccess: attendance => {
      toast.success(attendance ? `Chegada registrada. Protocolo ${attendance.protocol}.` : "Chegada registrada.");
      setForm(emptyForm);
      refreshBoard();
    },
    onError: error => toast.error(error.message),
  });

  const decide = trpc.attendances.decideEntry.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.decision === "aprovar" ? "Entrada aprovada." : "Recusa registrada com o motivo informado.");
      setRefusal(null);
      setRefusalReason("");
      refreshBoard();
    },
    onError: error => toast.error(error.message),
  });

  // A categoria depende da classificação: trocar de AMIL para LLT deixaria um
  // subtipo inválido selecionado, que o servidor recusaria no envio.
  useEffect(() => {
    const allowed = classificationDetailsFor(form.classification);
    if (!allowed.includes(form.classificationDetail)) {
      setForm(current => ({ ...current, classificationDetail: allowed[0] }));
    }
  }, [form.classification, form.classificationDetail]);

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    if (auth.data?.role === "supplier") setLocation("/fornecedor");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Abrindo a portaria" />;
  if (!auth.data || auth.data.role === "supplier") return <div className="min-h-screen bg-canvas" />;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return toast.error("Seu perfil não pode registrar chegadas.");
    create.mutate({ ...form, notes: form.notes.trim() || undefined });
  }

  const metrics = overview.data;
  const items = queue.data ?? [];

  return (
    <PortalLayout
      user={auth.data}
      title="Portaria"
      subtitle="Registre a chegada do caminhão, classifique o atendimento e decida a entrada."
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aguardando decisão" value={metrics?.awaiting ?? "—"} hint="Caminhões parados no acesso" icon={Clock3} tone="wait" />
          <StatCard label="Entradas aprovadas" value={metrics?.approved ?? "—"} hint="Liberados para o pátio" icon={ShieldCheck} tone="go" />
          <StatCard label="Entradas recusadas" value={metrics?.refused ?? "—"} hint="Registradas com justificativa" icon={XCircle} tone="stop" />
          <StatCard
            label="Espera média"
            value={metrics ? formatWaitMinutes(metrics.averageReleaseWaitMinutes) : "—"}
            hint="Dos atendimentos ainda em curso"
            icon={Timer}
            tone="brand"
          />
        </section>

        {!canManage && (
          <div className="flex items-start gap-3 rounded-xl border border-state-wait/30 bg-state-wait-bg px-4 py-3 text-sm text-state-wait">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Seu perfil acompanha a portaria, mas não registra chegadas nem decide entradas. Fale com o administrador
              para receber o perfil de Portaria.
            </p>
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel>
            <PanelHeader
              eyebrow="Novo protocolo"
              title="Registrar chegada"
              description="Os dados do motorista e da carga abrem o protocolo do atendimento."
              icon={ClipboardPlus}
            />
            <form onSubmit={submit}>
              <PanelBody className="grid gap-4 sm:grid-cols-2">
                <FieldShell label="Motorista" htmlFor="driverName">
                  <input
                    id="driverName"
                    value={form.driverName}
                    onChange={event => update("driverName", event.target.value)}
                    placeholder="Nome completo"
                    required
                    minLength={3}
                    disabled={!canManage}
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
                    disabled={!canManage}
                    className={`${fieldClass} font-mono uppercase tracking-wide`}
                  />
                </FieldShell>
                <FieldShell label="Transportadora" htmlFor="carrier" className="sm:col-span-2">
                  <input
                    id="carrier"
                    value={form.carrier}
                    onChange={event => update("carrier", event.target.value)}
                    placeholder="Empresa responsável pelo transporte"
                    required
                    minLength={2}
                    disabled={!canManage}
                    className={fieldClass}
                  />
                </FieldShell>
                <FieldShell label="Tipo de atendimento" htmlFor="serviceType">
                  <select
                    id="serviceType"
                    value={form.serviceType}
                    onChange={event => update("serviceType", event.target.value as AttendanceServiceType)}
                    disabled={!canManage}
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
                    disabled={!canManage}
                    className={fieldClass}
                  >
                    {(Object.keys(classificationCopy) as AttendanceClassification[]).map(value => (
                      <option key={value} value={value}>
                        {classificationCopy[value]}
                      </option>
                    ))}
                  </select>
                </FieldShell>
                <FieldShell label="Categoria específica" htmlFor="classificationDetail" className="sm:col-span-2">
                  <select
                    id="classificationDetail"
                    value={form.classificationDetail}
                    onChange={event => update("classificationDetail", event.target.value as AttendanceClassificationDetail)}
                    disabled={!canManage}
                    className={fieldClass}
                  >
                    {classificationDetailsFor(form.classification).map(value => (
                      <option key={value} value={value}>
                        {classificationDetailCopy[value]}
                      </option>
                    ))}
                  </select>
                </FieldShell>
                <FieldShell
                  label="Observações"
                  htmlFor="notes"
                  hint="Opcional — informações que a Operação precisa saber antes de receber o caminhão."
                  className="sm:col-span-2"
                >
                  <textarea
                    id="notes"
                    value={form.notes}
                    onChange={event => update("notes", event.target.value)}
                    placeholder="Ex.: carga refrigerada, entrega parcial, documento pendente"
                    maxLength={1000}
                    disabled={!canManage}
                    className={`${fieldClass} min-h-24 resize-y py-2.5`}
                  />
                </FieldShell>
              </PanelBody>
              <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
                <Button
                  type="submit"
                  disabled={!canManage || create.isPending}
                  className="h-11 rounded-xl bg-rvd-plum px-5 text-sm font-bold text-white hover:bg-rvd-plum/90"
                >
                  <Truck className="size-4" />
                  {create.isPending ? "Registrando..." : "Abrir protocolo"}
                </Button>
              </div>
            </form>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Fila do portão"
              title="Aguardando decisão"
              description="Aprovar libera o caminhão para o pátio; recusar exige um motivo."
              icon={ClipboardCheck}
              actions={
                <span className="rounded-lg bg-canvas px-3 py-1.5 font-display text-lg font-extrabold tabular-nums text-ink">
                  {items.length}
                </span>
              }
            />
            {queue.isLoading ? (
              <PanelBody>
                <p className="text-sm text-ink-soft">Consultando a fila...</p>
              </PanelBody>
            ) : items.length ? (
              <ul className="divide-y divide-line">
                {items.map(item => (
                  <li key={item.id} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink-faint">{item.protocol}</span>
                      <AttendanceStatusBadge status={item.status} />
                      <span className="ml-auto text-xs font-bold text-ink-soft">
                        há {formatElapsed(item.arrivalAt)}
                      </span>
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
                    {item.notes && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-ink-soft">{item.notes}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => decide.mutate({ attendanceId: item.id, decision: "aprovar" })}
                        disabled={!canManage || decide.isPending}
                        className="h-9 rounded-lg bg-state-go px-3.5 text-xs font-bold text-white hover:bg-state-go/90"
                      >
                        <ShieldCheck className="size-4" />
                        Aprovar entrada
                      </Button>
                      <Button
                        onClick={() => {
                          setRefusalReason("");
                          setRefusal({ id: item.id, protocol: item.protocol });
                        }}
                        disabled={!canManage || decide.isPending}
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
                icon={ClipboardCheck}
                title="Nenhum caminhão aguardando"
                description="As chegadas registradas aparecem aqui até a Portaria decidir a entrada."
              />
            )}
          </Panel>
        </section>
      </div>

      <Dialog open={Boolean(refusal)} onOpenChange={open => !open && setRefusal(null)}>
        <DialogContent className="max-w-md rounded-2xl border-line bg-surface">
          <DialogHeader className="text-left">
            <p className="eyebrow">Decisão de entrada</p>
            <DialogTitle className="font-display text-xl font-extrabold text-ink">Recusar caminhão</DialogTitle>
            <DialogDescription className="text-sm text-ink-soft">
              Protocolo {refusal?.protocol}. O motivo fica registrado no histórico e é o que será informado ao motorista.
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
                placeholder="Descreva o motivo da recusa"
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
