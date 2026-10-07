import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type LinkDeSenha = {
  url: string;
  expiraEm: Date | string;
  email: string | null;
  precisaAprovar: boolean;
};

const hora = (valor: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(valor));

/**
 * O link de redefinição para o administrador copiar e mandar.
 *
 * Existe porque o caminho normal — o usuário pede e recebe por e-mail — falha
 * de três jeitos que acontecem toda semana: o e-mail cai no spam da empresa, o
 * endereço cadastrado tem um erro de digitação, ou a pessoa que abria aquela
 * caixa saiu da empresa. Em qualquer um deles a conta ficava trancada para
 * sempre.
 *
 * A janela mostra o link uma vez e não o guarda em lugar nenhum: ele é a
 * credencial, e um link de senha aberto na tela de quem não ia usá-lo é tão
 * ruim quanto a senha escrita num papel.
 */
export default function LinkDeSenhaDialog({ link, onFechar }: { link: LinkDeSenha | null; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
      toast.success("Link copiado. Mande pelo canal em que você já fala com essa pessoa.");
    } catch {
      // Sem permissão de área de transferência o link continua na tela para
      // ser selecionado à mão — o que não pode é o clique não dizer nada.
      toast.error("Não consegui copiar sozinho. Selecione o link e copie à mão.");
    }
  };

  return (
    <Dialog open={Boolean(link)} onOpenChange={valor => !valor && (setCopiado(false), onFechar())}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:!max-w-lg">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><KeyRound className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Link para criar uma senha nova</DialogTitle>
              <DialogDescription className="mt-0.5 text-[13px] font-bold text-rvd-plum">
                {link?.email || "Conta sem e-mail"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">
          <p className="text-[13px] leading-5 text-ink-soft">
            É o mesmo link do e-mail de redefinição: vale até as <strong className="text-ink">{link ? hora(link.expiraEm) : ""}</strong> de
            hoje e só funciona uma vez. Mande pelo WhatsApp ou pelo e-mail em que você já fala com essa pessoa — ela abre,
            escolhe a senha e entra pela tela de sempre.
          </p>
          {link?.precisaAprovar && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-state-wait-bg px-3.5 py-3 text-[12px] font-bold text-state-wait">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Esta conta ainda não está liberada. Senha nova não resolve sozinha: aprove o acesso aqui na tela, senão ela
              continua barrada na entrada.
            </p>
          )}
          <textarea
            readOnly
            value={link?.url ?? ""}
            rows={3}
            onFocus={evento => evento.currentTarget.select()}
            className="mt-4 w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-2.5 font-mono text-[12px] leading-5 text-ink outline-none focus:border-rvd-plum"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onFechar} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Fechar</Button>
          <Button onClick={copiar} className="h-11 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand">
            <Copy className="size-4" />
            {copiado ? "Copiado" : "Copiar o link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
