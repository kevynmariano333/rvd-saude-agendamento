import { EmptyState } from "@/components/PortalKit";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attendanceEventCopy, formatArrival } from "@/lib/attendance";
import { roleLabel, type PortalRole } from "@/lib/portal";
import { trpc } from "@/lib/trpc";
import { History } from "lucide-react";

/**
 * Rastreabilidade do protocolo: cada marco em um cartão próprio, com quem
 * respondeu por ele. A consulta só sai quando o operador abre a janela — a fila
 * lista dezenas de caminhões e nenhum deles precisa do histórico até ser aberto.
 */
export default function AttendanceHistoryDialog({
  attendanceId,
  protocol,
  open,
  onOpenChange,
}: {
  attendanceId: number;
  protocol: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const history = trpc.attendances.history.useQuery({ attendanceId }, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-2xl border-line bg-surface p-0">
        <DialogHeader className="border-b border-line px-6 py-5 text-left">
          <p className="eyebrow">Rastreabilidade do atendimento</p>
          <DialogTitle className="mt-1 font-display text-xl font-extrabold tracking-tight text-ink">
            Protocolo {protocol}
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">
            Todos os marcos registrados neste atendimento, do portão à conclusão.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
          {history.isLoading ? (
            <p className="text-sm text-ink-soft">Carregando histórico...</p>
          ) : history.data?.length ? (
            <ol className="space-y-3">
              {history.data.map(event => (
                <li key={event.id} className="rounded-xl border border-line bg-canvas/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{attendanceEventCopy[event.eventType]}</p>
                    <p className="text-xs text-ink-faint">{formatArrival(event.createdAt)}</p>
                  </div>
                  {event.description && <p className="mt-1.5 text-sm text-ink-soft">{event.description}</p>}
                  <p className="mt-2 text-xs text-ink-faint">
                    {event.performedByName || "Equipe RVD"}
                    {event.performedByRole ? ` · ${roleLabel[event.performedByRole as PortalRole]}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={History}
              title="Nenhum evento registrado"
              description="Os marcos aparecerão aqui conforme a Portaria e a Operação avançarem com o atendimento."
              className="py-8"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
