import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { MessageSquarePlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const LIMITE = 1000;

/**
 * A caixa de sugestões, no canto da tela.
 *
 * Quem mais esbarra nas arestas do sistema é o fornecedor, e é quem menos tem
 * por onde falar: ele não está no grupo da operação nem senta ao lado de
 * ninguém daqui. O que ele faz hoje é ligar para a doca para reclamar de uma
 * tela — e a doca, que não desenvolve nada, anota num papel que se perde.
 *
 * Fica no canto e é pequena de propósito. Um banner no meio da tela pedindo
 * opinião atrapalha quem veio agendar uma carga; o botão discreto só é
 * procurado por quem tem o que dizer, que é exatamente quem vale a pena ouvir.
 *
 * A tela em que a pessoa estava vai junto, sem ela precisar contar: "o botão
 * não funciona" sem a tela é impossível de investigar, e perguntar depois
 * custa dois dias e um e-mail.
 */
export default function CaixaDeSugestao() {
  const [aberta, setAberta] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const enviar = trpc.feedback.enviar.useMutation({
    onSuccess: () => {
      toast.success("Recado enviado. Obrigado — quem cuida do portal vai ler.");
      setMensagem("");
      setAberta(false);
    },
    onError: erro => toast.error(erro.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        title="Mandar uma sugestão sobre o portal"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3.5 py-2.5 text-xs font-bold text-ink-soft shadow-lg backdrop-blur transition hover:border-rvd-plum hover:text-rvd-plum sm:bottom-6 sm:right-6"
      >
        <MessageSquarePlus className="size-4" />
        <span className="hidden sm:inline">Sugestão</span>
      </button>

      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:!max-w-lg">
          <DialogHeader className="border-b border-line px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><MessageSquarePlus className="size-5" /></span>
              <div>
                <DialogTitle className="font-display text-lg font-extrabold text-ink">O que dá para melhorar aqui?</DialogTitle>
                <DialogDescription className="mt-0.5 text-[13px] text-ink-soft">
                  Uma tela confusa, um campo que falta, algo que não funcionou. Vai direto para quem cuida do portal.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="px-6 py-5">
            <textarea
              autoFocus
              value={mensagem}
              onChange={evento => setMensagem(evento.target.value.slice(0, LIMITE))}
              rows={5}
              placeholder="Ex.: na tela de agendamento não dá para corrigir o pedido de compra depois de enviar."
              className="w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-rvd-plum"
            />
            <p className="mt-2 text-right text-[11px] text-ink-faint">{mensagem.length}/{LIMITE}</p>
            <p className="mt-1 text-[11px] leading-4 text-ink-faint">
              Vai junto o seu nome e a tela em que você está agora, para dar para procurar o que aconteceu. Não escreva senha
              nem dado de paciente aqui.
            </p>
          </div>
          <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
            <Button variant="ghost" onClick={() => setAberta(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">
              <X className="size-4" />
              Fechar
            </Button>
            <Button
              onClick={() => enviar.mutate({ mensagem: mensagem.trim(), pagina: window.location.pathname })}
              disabled={enviar.isPending || mensagem.trim().length < 5}
              title={mensagem.trim().length < 5 ? "Escreva um pouco mais para dar para entender" : undefined}
              className="h-11 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviar.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
