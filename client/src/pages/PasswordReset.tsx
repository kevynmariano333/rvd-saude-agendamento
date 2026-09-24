import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, KeyRound, TriangleAlert } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { MARCA } from "@shared/marca";

export default function PasswordReset() {
  const [, setLocation] = useLocation();
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
    []
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [done, setDone] = useState(false);

  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 6) return toast.error("A senha deve conter pelo menos 6 caracteres.");
    if (password !== confirmation) return toast.error("As senhas não conferem.");
    reset.mutate({ token, password });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rvd-plum-pale px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-surface p-7 shadow-xl sm:p-9">
        <div className="flex items-center gap-3">
          <img src="/RVD-Saude.png" alt="RVD Saúde" className="size-12 rounded-2xl object-contain" />
          <div>
            <p className="font-display text-lg font-extrabold text-ink">{MARCA.nome}</p>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-faint">
              Sistema de Agendamento
            </p>
          </div>
        </div>

        {!token ? (
          <div className="mt-8 text-center">
            <TriangleAlert className="mx-auto size-9 text-rvd-plum" />
            <h1 className="mt-4 font-display text-xl font-extrabold text-ink">Link inválido</h1>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Este endereço não traz um código de redefinição. Peça um novo e-mail pela tela de acesso.
            </p>
            <Button
              onClick={() => setLocation("/entrar")}
              className="mt-6 h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand"
            >
              Voltar para o login
            </Button>
          </div>
        ) : done ? (
          <div className="mt-8 text-center">
            <CheckCircle2 className="mx-auto size-9 text-emerald-600" />
            <h1 className="mt-4 font-display text-xl font-extrabold text-ink">Senha alterada</h1>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Sua nova senha já está valendo. Entre no portal com ela.
            </p>
            <Button
              onClick={() => setLocation("/entrar")}
              className="mt-6 h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand"
            >
              Ir para o login
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-8 flex items-center gap-3">
              <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum">
                <KeyRound className="size-5" />
              </span>
              <div>
                <h1 className="font-display text-xl font-extrabold text-ink">Definir nova senha</h1>
                <p className="mt-1 text-sm text-ink-soft">Escolha uma senha com pelo menos 6 caracteres.</p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-5">
              <div>
                <Label htmlFor="new-password" className="font-bold text-rvd-plum">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  minLength={6}
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="Sua nova senha"
                  className="mt-2 h-12 border-line bg-surface text-rvd-plum"
                />
              </div>
              <div>
                <Label htmlFor="new-password-confirmation" className="font-bold text-rvd-plum">
                  Repita a nova senha
                </Label>
                <Input
                  id="new-password-confirmation"
                  type="password"
                  minLength={6}
                  required
                  value={confirmation}
                  onChange={event => setConfirmation(event.target.value)}
                  placeholder="Repita a senha"
                  className="mt-2 h-12 border-line bg-surface text-rvd-plum"
                />
              </div>
              <Button
                type="submit"
                disabled={reset.isPending}
                className="h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand"
              >
                {reset.isPending ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs leading-5 text-ink-soft">
              O link vale por 1 hora e só pode ser usado uma vez.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
