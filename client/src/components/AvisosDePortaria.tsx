import { Button } from "@/components/ui/button";
import { avisosJaAtivos, avisosSaoPossiveis, ativarAvisosNoAparelho } from "@/lib/avisosDePortaria";
import { trpc } from "@/lib/trpc";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * O botão que liga o aviso da portaria neste aparelho.
 *
 * Só aparece para quem decide a liberação no portão, e só onde o navegador
 * suporta aviso. Depois de ligado, vira um rótulo: o aviso segue até o usuário
 * negar a permissão no navegador.
 */
export default function AvisosDePortaria({ visivel }: { visivel: boolean }) {
  const chave = trpc.push.chaveDoAviso.useQuery(undefined, { enabled: visivel && avisosSaoPossiveis(), staleTime: Infinity });
  const inscrever = trpc.push.inscrever.useMutation({ onError: erro => toast.error(erro.message) });
  const [ativos, setAtivos] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    void avisosJaAtivos().then(setAtivos).catch(() => setAtivos(false));
  }, [visivel]);

  if (!visivel || !avisosSaoPossiveis() || !chave.data) return null;
  if (ativos) return <span className="hidden text-[11px] font-bold text-ink-soft sm:block">Avisos da portaria ligados</span>;

  async function ligar() {
    try {
      const inscricao = await ativarAvisosNoAparelho(chave.data as string);
      if (!inscricao?.endpoint || !inscricao.keys?.p256dh || !inscricao.keys?.auth) {
        toast.error("O navegador não liberou o aviso. Libere as notificações deste site e tente de novo.");
        return;
      }
      await inscrever.mutateAsync({ endpoint: inscricao.endpoint, p256dh: inscricao.keys.p256dh, auth: inscricao.keys.auth });
      setAtivos(true);
      toast.success("Avisos da portaria ligados neste aparelho.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ligar os avisos.");
    }
  }

  return (
    <Button variant="ghost" onClick={() => void ligar()} disabled={inscrever.isPending} className="hidden h-9 rounded-xl border border-line px-3 text-xs font-bold text-rvd-plum sm:inline-flex">
      <BellRing className="size-4" />
      Ligar avisos da portaria
    </Button>
  );
}
