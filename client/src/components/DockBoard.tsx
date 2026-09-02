import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/PortalKit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fieldClass } from "@/components/PortalKit";
import { trpc } from "@/lib/trpc";
import { Ban, Forklift, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type Dock = {
  number: number;
  status: "disponivel" | "indisponivel";
  reason: string | null;
  updatedAt: Date | string;
};

function formatUpdatedAt(value: Date | string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * O quadro das duas docas. A Portaria abre e fecha porque é ela que vê o
 * movimento do pátio; a Operação lê o mesmo quadro para saber onde encostar,
 * sem poder mexer — em `readOnly` os botões não existem.
 */
export default function DockBoard({ readOnly = false }: { readOnly?: boolean }) {
  const utils = trpc.useUtils();
  const docks = trpc.docks.list.useQuery(undefined, { refetchInterval: 30_000 });
  const [blocking, setBlocking] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const setStatus = trpc.docks.setStatus.useMutation({
    onSuccess: dock => {
      toast.success(
        dock.status === "disponivel" ? `Doca ${dock.number} liberada.` : `Doca ${dock.number} marcada como indisponível.`
      );
      setBlocking(null);
      setReason("");
      utils.docks.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const list = (docks.data ?? []) as Dock[];
  const available = list.filter(dock => dock.status === "disponivel").length;

  function submitBlock(event: FormEvent) {
    event.preventDefault();
    if (blocking === null) return;
    setStatus.mutate({ number: blocking, status: "indisponivel", reason: reason.trim() || undefined });
  }

  return (
    <>
      <Panel>
        <PanelHeader
          eyebrow="Docas"
          title={readOnly ? "Situação das docas" : "Disponibilidade das docas"}
          description={
            readOnly
              ? "Quem controla é a Portaria, que vê o pátio. Aqui é só para saber onde encostar."
              : "Marque a doca como indisponível quando ela não puder receber caminhão. A Operação vê na hora."
          }
          icon={Forklift}
          actions={
            <span className="rounded-lg bg-canvas px-3 py-1.5 font-display text-sm font-extrabold text-ink">
              {available} de {list.length} livre{available === 1 ? "" : "s"}
            </span>
          }
        />
        {docks.isLoading ? (
          <PanelBody>
            <p className="text-sm text-ink-soft">Consultando as docas...</p>
          </PanelBody>
        ) : list.length ? (
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map(dock => {
                const free = dock.status === "disponivel";
                return (
                  <div
                    key={dock.number}
                    className={`rounded-2xl border p-4 ${
                      free ? "border-state-go/30 bg-state-go-bg/50" : "border-state-stop/30 bg-state-stop-bg/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-extrabold text-ink">Doca {dock.number}</p>
                        <p className={`mt-0.5 text-sm font-bold ${free ? "text-state-go" : "text-state-stop"}`}>
                          {free ? "Disponível" : "Indisponível"}
                        </p>
                      </div>
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                          free ? "bg-state-go text-white" : "bg-state-stop text-white"
                        }`}
                      >
                        {free ? <ShieldCheck className="size-5" /> : <Ban className="size-5" />}
                      </span>
                    </div>

                    {!free && dock.reason && (
                      <p className="mt-2 text-xs text-state-stop">Motivo: {dock.reason}</p>
                    )}
                    <p className="mt-2 text-[11px] text-ink-faint">Atualizado em {formatUpdatedAt(dock.updatedAt)}</p>

                    {!readOnly && (
                      <div className="mt-3">
                        {free ? (
                          <Button
                            onClick={() => {
                              setReason("");
                              setBlocking(dock.number);
                            }}
                            disabled={setStatus.isPending}
                            variant="outline"
                            className="h-9 rounded-xl border-line px-3.5 text-xs font-bold text-state-stop hover:bg-state-stop-bg"
                          >
                            <Ban className="size-4" />
                            Marcar indisponível
                          </Button>
                        ) : (
                          <Button
                            onClick={() => setStatus.mutate({ number: dock.number, status: "disponivel" })}
                            disabled={setStatus.isPending}
                            className="h-9 rounded-xl bg-state-go px-3.5 text-xs font-bold text-white hover:bg-state-go/90"
                          >
                            <ShieldCheck className="size-4" />
                            Liberar doca
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </PanelBody>
        ) : (
          <EmptyState
            icon={Forklift}
            title="Nenhuma doca cadastrada"
            description="As docas 1 e 2 aparecem aqui assim que o banco receber a atualização."
          />
        )}
      </Panel>

      <Dialog open={blocking !== null} onOpenChange={open => !open && setBlocking(null)}>
        <DialogContent className="max-w-md overflow-hidden rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl">
          <form onSubmit={submitBlock} className="bg-surface p-7">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-state-stop-bg text-state-stop">
                <Ban className="size-5" />
              </span>
              <div>
                <DialogTitle className="font-display text-xl font-extrabold text-ink">
                  Doca {blocking} indisponível
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-ink-soft">
                  A Operação vai ler este motivo para saber por quanto tempo contar sem a doca.
                </DialogDescription>
              </div>
            </div>

            <div className="mt-6 grid gap-1.5">
              <label htmlFor="dockReason" className="text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
                Motivo (opcional)
              </label>
              <input
                id="dockReason"
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="Ex.: carreta parada, em manutenção"
                maxLength={255}
                autoFocus
                className={fieldClass}
              />
            </div>

            <div className="mt-7 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBlocking(null)}
                className="h-10 rounded-xl border-line"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={setStatus.isPending}
                className="h-10 rounded-xl bg-state-stop px-4 text-sm font-bold text-white hover:bg-state-stop/90"
              >
                {setStatus.isPending ? "Salvando..." : "Marcar indisponível"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
