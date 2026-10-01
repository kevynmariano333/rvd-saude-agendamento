import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { MOTIVOS_DE_BACKLOG, rotuloDoMotivo } from "@shared/backlogReasons";
import { ScrollText, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type NotaComMotivo = {
  id: number;
  invoiceNumber?: string | null;
  invoiceSupplierName?: string | null;
  supplierName?: string | null;
  backlogReasonCode?: string | null;
  backlogReason?: string | null;
};

/**
 * Trocar o motivo de uma nota que já está em backlog.
 *
 * São catorze motivos numa lista, e muito parecidos entre si: "Divergência de
 * quantidade" e "Divergência de quantidade nota x pedido" ficam uma embaixo da
 * outra. Errar o clique é questão de tempo — e sem conserto o erro vira número
 * errado no fim do mês, porque é por esse código que se conta quantas notas
 * travaram por cada coisa.
 *
 * A janela abre com o que está gravado hoje, e não em branco: quem veio
 * corrigir precisa ver o que vai trocar, e metade das vezes o que ele quer é
 * mexer só na descrição.
 *
 * A nota não se move: estava em backlog, continua em backlog. A troca fica no
 * histórico com o motivo velho e o novo, porque correção que não deixa rastro é
 * indistinguível de alguém reescrevendo o passado.
 */
export default function CorrigirMotivoDoBacklogDialog({
  nota,
  aberto,
  onFechar,
  onCorrigido,
}: {
  nota: NotaComMotivo | null;
  aberto: boolean;
  onFechar: () => void;
  onCorrigido?: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setCodigo(nota?.backlogReasonCode ?? "");
    setDescricao(nota?.backlogReason ?? "");
  }, [aberto, nota]);

  // O que o Agiliza tinha dito. Devolver a nota ao backlog escreve por cima do
  // motivo, então para o acervo importado essa é a única memória que sobrou — e
  // é exatamente o que quem abre esta janela costuma querer de volta.
  const original = trpc.appointments.motivoOriginalDoBacklog.useQuery(
    { appointmentId: nota?.id ?? 0 },
    { enabled: aberto && Boolean(nota?.id) },
  );
  const doAgiliza = original.data ?? null;

  const corrigir = trpc.appointments.corrigirMotivoDoBacklog.useMutation({
    onSuccess: () => {
      toast.success("Motivo corrigido. A troca ficou registrada no histórico da nota.");
      onFechar();
      onCorrigido?.();
    },
    onError: erro => toast.error(erro.message),
  });

  const mudou = codigo !== (nota?.backlogReasonCode ?? "") || descricao.trim() !== (nota?.backlogReason ?? "").trim();

  return (
    <Dialog open={aberto} onOpenChange={valor => !valor && onFechar()}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-[1.5rem] !border !border-line !bg-surface p-0 sm:!max-w-lg">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><ScrollText className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-lg font-extrabold text-ink">Corrigir o motivo do backlog</DialogTitle>
              <DialogDescription className="mt-0.5 text-[13px] font-bold text-rvd-plum">
                {nota ? `NF ${nota.invoiceNumber || "não identificada"} · ${nota.invoiceSupplierName || nota.supplierName || "Fornecedor"}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <p className="text-[13px] leading-5 text-ink-soft">
            A nota não se move: está em backlog e continua lá. Muda só o motivo — que é por onde o planejamento filtra a fila e por onde o fim do mês conta quantas notas travaram por cada coisa. A troca fica registrada no histórico da nota.
          </p>
          {nota?.backlogReasonCode && (
            <p className="mt-3 rounded-xl bg-canvas px-3.5 py-2.5 text-[12px] text-ink-soft">
              Hoje está como <strong className="text-ink">{rotuloDoMotivo(nota.backlogReasonCode)}</strong>.
            </p>
          )}
          {doAgiliza && doAgiliza.codigo !== codigo && (
            <button
              type="button"
              onClick={() => setCodigo(doAgiliza.codigo)}
              className="mt-3 flex w-full items-start gap-3 rounded-xl border border-rvd-plum bg-rvd-plum-pale px-3.5 py-3 text-left transition hover:brightness-95"
            >
              <Undo2 className="mt-0.5 size-4 shrink-0 text-rvd-plum" />
              <span>
                <span className="block text-[12px] font-extrabold text-rvd-plum">
                  No Agiliza o motivo era {doAgiliza.rotulo}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-soft">
                  Lido do histórico desta nota (código de origem: {doAgiliza.codigoOriginal}). Clique para usar este.
                </span>
              </span>
            </button>
          )}
          <Label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">Motivo do backlog *</Label>
          <div className="mt-3 grid gap-2">
            {MOTIVOS_DE_BACKLOG.map(motivo => {
              const escolhido = codigo === motivo.codigo;
              return (
                <button
                  key={motivo.codigo}
                  type="button"
                  onClick={() => setCodigo(motivo.codigo)}
                  className={`rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-bold transition ${escolhido ? "border-rvd-plum bg-rvd-plum-pale text-rvd-plum" : "border-line bg-surface text-ink-soft hover:border-rvd-plum"}`}
                >
                  {motivo.rotulo}
                </button>
              );
            })}
          </div>
          <Label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">O que houve</Label>
          <textarea
            value={descricao}
            onChange={evento => setDescricao(evento.target.value)}
            rows={3}
            maxLength={500}
            placeholder="O que o planejamento precisa saber para retomar esta nota..."
            className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-rvd-plum"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onFechar} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button>
          <Button
            onClick={() => nota && corrigir.mutate({ appointmentId: nota.id, backlogReasonCode: codigo, backlogReason: descricao.trim() || undefined })}
            disabled={corrigir.isPending || !codigo || !mudou}
            title={!codigo ? "Escolha o motivo do backlog" : !mudou ? "Nada mudou ainda" : undefined}
            className="h-11 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {corrigir.isPending ? "Corrigindo..." : "Corrigir o motivo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
