import AttendanceHistoryDialog from "@/components/AttendanceHistoryDialog";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import LoadingTruck from "@/components/LoadingTruck";
import { EmptyState, FieldShell, Panel, PanelBody, PanelHeader, StatCard, fieldClass } from "@/components/PortalKit";
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
} from "@/lib/attendance";
import { homePathFor, isPortalGate, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { CircleAlert, ClipboardList, ClipboardPlus, Clock3, SendHorizontal, ShieldCheck, Timer, Truck, XCircle } from "lucide-react";
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

/**
 * Tela da Portaria. Aqui se registra a chegada do caminhão e ela segue para a
 * Operação decidir se aceita o recebimento — a Portaria não decide, ela envia e
 * acompanha a resposta para saber o que dizer ao motorista no portão.
 */
export default function PortariaPage() {
  const [, setLocation] = useLocation();
  const auth = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState(emptyForm);
  const [historyFor, setHistoryFor] = useState<{ id: number; protocol: string } | null>(null);

  // A resposta da Operação chega enquanto o caminhão está parado no acesso,
  // então a lista se atualiza sozinha em vez de depender de recarregar a página.
  const sent = trpc.attendances.list.useQuery(undefined, { refetchInterval: 20_000 });
  const overview = trpc.attendances.overview.useQuery(undefined, { refetchInterval: 20_000 });

  const role = (auth.data?.role ?? "supplier") as PortalRole;
  const canManage = isPortalGate(role);

  const create = trpc.attendances.create.useMutation({
    onSuccess: attendance => {
      toast.success(
        attendance
          ? `Enviado para a Operação. Protocolo ${attendance.protocol}.`
          : "Chegada enviada para a Operação."
      );
      setForm(emptyForm);
      utils.attendances.list.invalidate();
      utils.attendances.overview.invalidate();
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
    if (auth.data?.role === "supplier") setLocation(homePathFor("supplier"));
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
  const items = sent.data ?? [];
  const waiting = items.filter(item => item.status === "aguardando");

  return (
    <PortalLayout
      user={auth.data}
      title="Portaria"
      subtitle="Registre a chegada do caminhão e envie para a Operação decidir o recebimento."
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aguardando a Operação" value={metrics?.awaiting ?? "—"} hint="Enviados e sem resposta" icon={Clock3} tone="wait" />
          <StatCard label="Recebimentos aceitos" value={metrics?.approved ?? "—"} hint="Liberados para entrar" icon={ShieldCheck} tone="go" />
          <StatCard label="Recebimentos recusados" value={metrics?.refused ?? "—"} hint="Com o motivo registrado" icon={XCircle} tone="stop" />
          <StatCard
            label="Espera média"
            value={metrics ? formatWaitMinutes(metrics.averageReleaseWaitMinutes) : "—"}
            hint="Dos caminhões ainda em curso"
            icon={Timer}
            tone="brand"
          />
        </section>

        {!canManage && (
          <div className="flex items-start gap-3 rounded-xl border border-state-wait/30 bg-state-wait-bg px-4 py-3 text-sm text-state-wait">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Seu perfil acompanha a portaria, mas não registra chegadas. Fale com o administrador para receber o perfil
              de Portaria.
            </p>
          </div>
        )}

        <Panel>
          <PanelHeader
            eyebrow="Nova chegada"
            title="Registrar e enviar para a Operação"
            description="Os dados do motorista e da carga abrem o protocolo e vão para a decisão de quem recebe."
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
              <FieldShell label="Transportadora" htmlFor="carrier">
                <input
                  id="carrier"
                  value={form.carrier}
                  onChange={event => update("carrier", event.target.value)}
                  placeholder="Empresa do transporte"
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
              <FieldShell label="Categoria específica" htmlFor="classificationDetail">
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
                  disabled={!canManage}
                  className={`${fieldClass} min-h-20 resize-y py-2.5`}
                />
              </FieldShell>
            </PanelBody>
            <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
              <Button
                type="submit"
                disabled={!canManage || create.isPending}
                className="h-11 rounded-xl bg-rvd-plum px-5 text-sm font-bold text-white hover:bg-rvd-plum/90"
              >
                <SendHorizontal className="size-4" />
                {create.isPending ? "Enviando..." : "Enviar para a Operação"}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Acompanhamento do portão"
            title="Enviados para a Operação"
            description="A resposta da Operação aparece aqui — é o que você informa ao motorista."
            icon={ClipboardList}
            actions={
              <span className="rounded-lg bg-canvas px-3 py-1.5 text-xs font-bold text-ink-soft">
                {waiting.length} sem resposta
              </span>
            }
          />
          {sent.isLoading ? (
            <PanelBody>
              <p className="text-sm text-ink-soft">Consultando os envios...</p>
            </PanelBody>
          ) : items.length ? (
            <ul className="divide-y divide-line">
              {items.map(item => (
                <li key={item.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-ink-faint">{item.protocol}</span>
                    <AttendanceStatusBadge status={item.status} />
                    {item.status === "aguardando" && (
                      <span className="ml-auto text-xs font-bold text-ink-soft">há {formatElapsed(item.arrivalAt)}</span>
                    )}
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
                  {item.status === "recusado" && item.refusalReason && (
                    <p className="mt-2 rounded-lg border border-state-stop/20 bg-state-stop-bg px-3 py-2 text-sm text-state-stop">
                      <span className="font-bold">Motivo da recusa: </span>
                      {item.refusalReason}
                    </p>
                  )}
                  <div className="mt-3">
                    <Button
                      onClick={() => setHistoryFor({ id: item.id, protocol: item.protocol })}
                      variant="outline"
                      className="h-9 rounded-lg border-line bg-surface px-3.5 text-xs font-bold text-ink-soft hover:text-ink"
                    >
                      Histórico do protocolo
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Truck}
              title="Nenhuma chegada registrada"
              description="Ao registrar uma chegada, ela aparece aqui até a Operação responder se aceita o recebimento."
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
