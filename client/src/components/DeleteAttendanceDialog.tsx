import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Apagar um protocolo é definitivo e leva o histórico junto, então a confirmação
 * mostra a placa e o número do protocolo: o administrador precisa reconhecer o
 * registro antes de apagá-lo, e não só acertar a linha da tabela.
 */
export default function DeleteAttendanceDialog({
  attendance,
  onOpenChange,
  onDeleted,
}: {
  attendance: { id: number; protocol: string; licensePlate: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const remove = trpc.attendances.remove.useMutation({
    onSuccess: result => {
      toast.success(`Registro ${result.protocol} excluído.`);
      onOpenChange(false);
      onDeleted();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Dialog open={Boolean(attendance)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl">
        <div className="bg-surface p-7">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-state-stop-bg text-state-stop">
              <Trash2 className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-display text-xl font-extrabold text-ink">Excluir registro</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-ink-soft">
                O protocolo <span className="font-mono font-bold text-ink">{attendance?.protocol}</span> da placa{" "}
                <span className="font-mono font-bold text-ink">{attendance?.licensePlate}</span> sai do registro do dia
                junto com todo o histórico dele. Não dá para desfazer.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-7 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl border-line"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={remove.isPending || !attendance}
              onClick={() => attendance && remove.mutate({ attendanceId: attendance.id })}
              className="h-10 rounded-xl bg-state-stop px-4 text-sm font-bold text-white hover:bg-state-stop/90"
            >
              {remove.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
