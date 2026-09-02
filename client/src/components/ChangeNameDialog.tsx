import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fieldClass } from "@/components/PortalKit";
import { trpc } from "@/lib/trpc";
import { UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * O nome da conta aparece no topo da tela e assina cada evento do histórico do
 * portão. Quem usa a conta corrige o próprio nome aqui, sem depender do
 * administrador.
 */
export default function ChangeNameDialog({
  open,
  onOpenChange,
  currentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  const utils = trpc.useUtils();

  // Reabrir o diálogo mostra o nome que está valendo, não o que foi digitado e
  // abandonado da vez anterior.
  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const update = trpc.auth.updateName.useMutation({
    onSuccess: async () => {
      toast.success("Nome atualizado.");
      await utils.auth.me.invalidate();
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return toast.error("Informe o nome.");
    if (trimmed === currentName.trim()) return onOpenChange(false);
    update.mutate({ name: trimmed });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl">
        <form onSubmit={submit} className="bg-surface p-7">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rvd-blue-pale text-rvd-plum">
              <UserRound className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-display text-xl font-extrabold text-ink">Alterar nome</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-ink-soft">
                É o nome que aparece no topo da tela e no histórico de cada atendimento.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-6 grid gap-1.5">
            <label htmlFor="displayName" className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
              Nome
            </label>
            <input
              id="displayName"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Ex.: Kevyn Mariano"
              required
              minLength={2}
              maxLength={255}
              autoFocus
              className={fieldClass}
            />
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
              type="submit"
              disabled={update.isPending}
              className="h-10 rounded-xl bg-rvd-plum px-4 text-sm font-bold text-white hover:bg-rvd-plum/90"
            >
              {update.isPending ? "Salvando..." : "Salvar nome"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
