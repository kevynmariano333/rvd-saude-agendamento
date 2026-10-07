import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { NOTA_MAXIMA, NOTA_MINIMA, rotuloDaNota, temConteudo } from "@shared/notaDoPortal";
import { MessageSquarePlus, Star, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const LIMITE = 1000;
const ESTRELAS = Array.from({ length: NOTA_MAXIMA - NOTA_MINIMA + 1 }, (_, indice) => NOTA_MINIMA + indice);

/**
 * A caixa de sugestões: a nota e o recado.
 *
 * As duas coisas, porque cada uma responde metade da pergunta. Texto só chega
 * de quem está incomodado o bastante para escrever — dá uma lista de problemas
 * e nenhuma noção do conjunto: trinta reclamações num mês podem ser trinta
 * pessoas infelizes ou as mesmas três insistindo enquanto as outras duzentas
 * vão bem. A nota custa um clique e diz se, no geral, melhorou.
 *
 * Nenhuma das duas é obrigatória sozinha: quem só clica nas estrelas já mandou
 * um recado, e quem só escreve também. O que não entra é o vazio.
 *
 * A tela em que a pessoa estava vai junto, sem ela precisar contar: "o botão
 * não funciona" sem a tela é impossível de investigar, e perguntar depois
 * custa dois dias e um e-mail.
 */
export default function CaixaDeSugestao({ aberta, onOpenChange }: { aberta: boolean; onOpenChange: (valor: boolean) => void }) {
  const [mensagem, setMensagem] = useState("");
  const [nota, setNota] = useState<number | null>(null);
  const [emCima, setEmCima] = useState<number | null>(null);

  const enviar = trpc.feedback.enviar.useMutation({
    onSuccess: () => {
      toast.success("Recebido. Obrigado — quem cuida do portal vai ler.");
      setMensagem("");
      setNota(null);
      onOpenChange(false);
    },
    onError: erro => toast.error(erro.message),
  });

  const pode = temConteudo({ nota, mensagem });
  const emDestaque = emCima ?? nota ?? 0;

  return (
    <Dialog open={aberta} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:!max-w-lg">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><MessageSquarePlus className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Como está sendo usar o portal?</DialogTitle>
              <DialogDescription className="mt-0.5 text-[13px] text-ink-soft">
                Dê a nota, escreva o que dá para melhorar, ou as duas coisas. Vai direto para quem cuida do portal.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1" onMouseLeave={() => setEmCima(null)}>
              {ESTRELAS.map(valor => {
                const acesa = valor <= emDestaque;
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setNota(nota === valor ? null : valor)}
                    onMouseEnter={() => setEmCima(valor)}
                    aria-pressed={nota === valor}
                    aria-label={`${valor} — ${rotuloDaNota(valor)}`}
                    title={rotuloDaNota(valor)}
                    className="rounded-lg p-1 transition hover:scale-110"
                  >
                    <Star className={`size-7 ${acesa ? "fill-rvd-plum text-rvd-plum" : "text-ink-faint"}`} />
                  </button>
                );
              })}
            </div>
            <span className="text-[13px] font-bold text-ink-soft">
              {nota ? `${nota} de ${NOTA_MAXIMA} · ${rotuloDaNota(nota)}` : "Toque nas estrelas (opcional)"}
            </span>
          </div>

          <textarea
            value={mensagem}
            onChange={evento => setMensagem(evento.target.value.slice(0, LIMITE))}
            rows={5}
            placeholder="Ex.: na tela de agendamento não dá para corrigir o pedido de compra depois de enviar."
            className="mt-5 w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-rvd-plum"
          />
          <p className="mt-2 text-right text-[11px] text-ink-faint">{mensagem.length}/{LIMITE}</p>
          <p className="mt-1 text-[11px] leading-4 text-ink-faint">
            Vai junto o seu nome e a tela em que você está agora, para dar para procurar o que aconteceu. Não escreva senha
            nem dado de paciente aqui.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">
            <X className="size-4" />
            Fechar
          </Button>
          <Button
            onClick={() => enviar.mutate({ mensagem: mensagem.trim() || undefined, nota: nota ?? undefined, pagina: window.location.pathname })}
            disabled={enviar.isPending || !pode}
            title={pode ? undefined : "Dê a nota ou escreva o que dá para melhorar"}
            className="h-11 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviar.isPending ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
