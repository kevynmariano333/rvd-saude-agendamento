import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { KeyRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  // Never leave a typed password sitting in state behind a closed dialog.
  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
    }
  }, [open]);

  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso.");
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 6) return toast.error("A nova senha deve conter pelo menos 6 caracteres.");
    if (newPassword !== confirmation) return toast.error("A confirmação não confere com a nova senha.");
    change.mutate({ currentPassword, newPassword });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-[2rem] !border !border-rvd-plum-soft !bg-white p-0 shadow-2xl">
        <div className="bg-white p-7">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rvd-blue-pale text-rvd-plum">
              <KeyRound className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-display text-xl font-extrabold text-rvd-plum">
                Alterar senha
              </DialogTitle>
              <DialogDescription className="mt-1 text-rvd-plum">
                Confirme a senha atual e escolha a nova.
              </DialogDescription>
            </div>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="current-password" className="font-bold text-rvd-plum">Senha atual</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                className="mt-2 h-12 border-rvd-plum-soft bg-white text-rvd-plum"
              />
            </div>
            <div>
              <Label htmlFor="change-new-password" className="font-bold text-rvd-plum">Nova senha</Label>
              <Input
                id="change-new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                className="mt-2 h-12 border-rvd-plum-soft bg-white text-rvd-plum"
              />
            </div>
            <div>
              <Label htmlFor="change-confirmation" className="font-bold text-rvd-plum">Repita a nova senha</Label>
              <Input
                id="change-confirmation"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                className="mt-2 h-12 border-rvd-plum-soft bg-white text-rvd-plum"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-11 flex-1 rounded-xl border border-rvd-plum-soft bg-white font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={change.isPending}
                className="h-11 flex-1 rounded-xl bg-rvd-plum font-bold text-white hover:bg-rvd-plum"
              >
                {change.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
