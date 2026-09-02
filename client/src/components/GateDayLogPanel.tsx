import AttendanceHistoryDialog from "@/components/AttendanceHistoryDialog";
import AttendanceStatusBadge from "@/components/AttendanceStatusBadge";
import DeleteAttendanceDialog from "@/components/DeleteAttendanceDialog";
import { DataTable, EmptyState, Panel, PanelBody, PanelHeader } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import {
  classificationLabel,
  formatArrival,
  parseInvoiceNumbers,
  serviceTypeCopy,
  stayDuration,
} from "@/lib/attendance";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * O registro do dia é a mesma verdade para os dois lados do portão: a Portaria
 * confere o que passou e a Operação confere o que recebeu. Uma tabela só, usada
 * pelas duas telas, para as colunas e a permanência não divergirem com o tempo.
 */
export default function GateDayLogPanel({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const dayLog = trpc.attendances.dayLog.useQuery(undefined, { refetchInterval: 60_000 });
  const [historyFor, setHistoryFor] = useState<{ id: number; protocol: string } | null>(null);
  // Só o administrador apaga, e apaga um registro de teste ou um lançamento
  // errado — por isso passa por uma confirmação antes.
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; protocol: string; licensePlate: string } | null>(
    null
  );

  const today = dayLog.data ?? [];

  const refreshBoard = () => {
    utils.attendances.dayLog.invalidate();
    utils.attendances.list.invalidate();
    utils.attendances.overview.invalidate();
  };

  return (
    <>
      <Panel>
        <PanelHeader
          eyebrow="Registro do dia"
          title="Tudo que passou pelo portão hoje"
          description="Fica aqui mesmo depois de concluído, com as notas, o motivo da recusa e o histórico."
          icon={ClipboardList}
          actions={
            <span className="rounded-lg bg-canvas px-3 py-1.5 font-display text-lg font-extrabold tabular-nums text-ink">
              {today.length}
            </span>
          }
        />
        {dayLog.isLoading ? (
          <PanelBody>
            <p className="text-sm text-ink-soft">Consultando o registro...</p>
          </PanelBody>
        ) : today.length ? (
          <DataTable
            head={
              <>
                <th>Caminhão</th>
                <th>Atendimento</th>
                <th>Notas</th>
                <th>Doca</th>
                <th>Chegada</th>
                <th>Saída</th>
                <th>Permanência</th>
                <th>Status</th>
                <th className="text-right">Registro</th>
              </>
            }
          >
            {today.map(item => {
              const invoices = parseInvoiceNumbers(item.invoiceNumbersJson);
              return (
                <tr key={item.id} className="align-top transition-colors hover:bg-canvas/70 [&>td]:px-5 [&>td]:py-4 sm:[&>td]:px-6">
                  <td>
                    <p className="font-mono text-sm font-bold text-ink">{item.licensePlate}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {item.driverName}
                      {item.driverDocument ? ` · RG ${item.driverDocument}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">{item.carrier}</p>
                  </td>
                  <td>
                    <p className="text-sm font-bold text-ink">{serviceTypeCopy[item.serviceType]}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {classificationLabel(item.classification, item.classificationDetail)}
                    </p>
                  </td>
                  <td>
                    {invoices.length ? (
                      <p className="font-mono text-xs text-ink">{invoices.join(", ")}</p>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                  <td>
                    {item.dockNumber ? (
                      <p className="text-sm font-bold text-ink">{item.dockNumber}</p>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                  <td>
                    <p className="text-xs text-ink-soft">{formatArrival(item.arrivalAt)}</p>
                  </td>
                  <td>
                    {item.concludedAt ? (
                      <p className="text-xs text-ink-soft">{formatArrival(item.concludedAt)}</p>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                  <td>
                    {(() => {
                      const stay = stayDuration(item);
                      if (!stay) return <span className="text-xs text-ink-faint">—</span>;
                      return (
                        <>
                          <p className="text-sm font-bold text-ink">{stay.text}</p>
                          {stay.ongoing && <p className="mt-0.5 text-xs text-ink-faint">em curso</p>}
                        </>
                      );
                    })()}
                  </td>
                  <td>
                    <AttendanceStatusBadge status={item.status} />
                    {item.status === "recusado" && item.refusalReason && (
                      <p className="mt-1.5 max-w-xs text-xs text-state-stop">{item.refusalReason}</p>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        onClick={() => setHistoryFor({ id: item.id, protocol: item.protocol })}
                        variant="ghost"
                        className="h-8 rounded-lg px-2.5 text-xs font-bold text-ink-soft hover:text-ink"
                      >
                        Histórico
                      </Button>
                      {isAdmin && (
                        <Button
                          onClick={() =>
                            setDeleteTarget({ id: item.id, protocol: item.protocol, licensePlate: item.licensePlate })
                          }
                          variant="ghost"
                          aria-label={`Excluir registro ${item.protocol}`}
                          className="h-8 rounded-lg px-2 text-xs font-bold text-ink-faint hover:bg-state-stop-bg hover:text-state-stop"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma chegada hoje"
            description="Cada caminhão registrado hoje aparece aqui e continua aparecendo depois de sair."
          />
        )}
      </Panel>

      {historyFor && (
        <AttendanceHistoryDialog
          attendanceId={historyFor.id}
          protocol={historyFor.protocol}
          open
          onOpenChange={open => !open && setHistoryFor(null)}
        />
      )}

      <DeleteAttendanceDialog
        attendance={deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
        onDeleted={refreshBoard}
      />
    </>
  );
}
