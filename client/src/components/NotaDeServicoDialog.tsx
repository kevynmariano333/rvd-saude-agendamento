import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { UNIDADES } from "@shared/recipients";
import { CheckCircle2, Paperclip, Plus, Trash2, Wrench } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

const PEDIDO_DIGITOS = 10;

function lerBase64(arquivo: File) {
  return new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
    leitor.onerror = () => reject(new Error(`Não foi possível ler ${arquivo.name}.`));
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * Registro de uma nota de serviço.
 *
 * Serviço não emite nota com XML de produto: chega um PDF, às vezes só um
 * e-mail. Antes disso essas entregas ficavam fora do portal — combinadas por
 * fora e conferidas de memória. Aqui elas entram na mesma agenda, com pedido de
 * compra e data, e passam pelo mesmo recebimento das outras.
 */
export default function NotaDeServicoDialog({ open, onOpenChange, onCriada }: { open: boolean; onOpenChange: (open: boolean) => void; onCriada: () => void }) {
  const fornecedores = trpc.appointments.fornecedores.useQuery(undefined, { enabled: open });
  const [supplierId, setSupplierId] = useState("");
  const [recipientCnpj, setRecipientCnpj] = useState(UNIDADES[0]?.cnpj ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [pedidos, setPedidos] = useState<string[]>([""]);
  const [pdf, setPdf] = useState<File | null>(null);

  const registrar = trpc.appointments.createServiceNote.useMutation({
    onSuccess: () => {
      toast.success("Nota de serviço registrada.");
      setSupplierId("");
      setInvoiceNumber("");
      setScheduledFor("");
      setPedidos([""]);
      setPdf(null);
      onCriada();
      onOpenChange(false);
    },
    onError: erro => toast.error(erro.message),
  });

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!supplierId) return toast.error("Escolha o fornecedor.");
    if (!invoiceNumber.trim()) return toast.error("Informe o número da nota.");
    if (!scheduledFor) return toast.error("Informe a data de agendamento.");
    const limpos = pedidos.map(pedido => pedido.replace(/\D/g, "")).filter(Boolean);
    if (!limpos.length) return toast.error("Informe ao menos um pedido de compra.");
    const curto = limpos.find(pedido => pedido.length !== PEDIDO_DIGITOS);
    if (curto) return toast.error(`O pedido ${curto} não tem ${PEDIDO_DIGITOS} dígitos.`);
    try {
      registrar.mutate({
        supplierId: Number(supplierId),
        recipientCnpj,
        invoiceNumber: invoiceNumber.trim(),
        // O campo entrega hora local; o servidor guarda o instante.
        scheduledFor: new Date(scheduledFor).toISOString(),
        purchaseOrders: limpos,
        documentBase64: pdf ? await lerBase64(pdf) : null,
        documentFileName: pdf?.name ?? null,
      });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível preparar o arquivo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.75rem] !border !border-line !bg-surface p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-rvd-plum-pale text-rvd-plum"><Wrench className="size-5" /></span>
            <div>
              <DialogTitle className="font-display text-xl font-extrabold text-ink">Nota de Serviço</DialogTitle>
              <DialogDescription className="text-sm text-ink-soft">Registre uma nota de serviço (sem XML).</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-5 px-6 py-6">
          <div>
            <Label htmlFor="servico-fornecedor" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Fornecedor *</Label>
            <select
              id="servico-fornecedor"
              value={supplierId}
              onChange={evento => setSupplierId(evento.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-rvd-plum focus:outline-none focus:ring-2 focus:ring-rvd-blue"
            >
              <option value="">Selecione um fornecedor...</option>
              {(fornecedores.data ?? []).map(fornecedor => (
                <option key={fornecedor.id} value={fornecedor.id}>
                  {fornecedor.companyName || fornecedor.name || `Fornecedor ${fornecedor.id}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-faint">O CNPJ é puxado do cadastro.</p>
          </div>

          <div>
            <Label htmlFor="servico-unidade" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Unidade de destino *</Label>
            <select
              id="servico-unidade"
              value={recipientCnpj}
              onChange={evento => setRecipientCnpj(evento.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-rvd-plum focus:outline-none focus:ring-2 focus:ring-rvd-blue"
            >
              {UNIDADES.map(unidade => (
                <option key={unidade.cnpj} value={unidade.cnpj}>{unidade.sigla} — {unidade.nome}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="servico-nota" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Número da nota fiscal *</Label>
              <Input id="servico-nota" value={invoiceNumber} onChange={evento => setInvoiceNumber(evento.target.value)} maxLength={100} placeholder="Ex.: 123456" className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
            </div>
            <div>
              <Label htmlFor="servico-data" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Data de agendamento *</Label>
              <Input id="servico-data" type="datetime-local" value={scheduledFor} onChange={evento => setScheduledFor(evento.target.value)} className="mt-2 h-11 border-line bg-surface text-rvd-plum" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Pedidos * <span className="font-normal normal-case text-ink-faint">({PEDIDO_DIGITOS} dígitos cada)</span></Label>
              <Button type="button" variant="ghost" onClick={() => setPedidos(atual => [...atual, ""])} className="h-8 text-xs font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">
                <Plus className="size-3.5" />Adicionar
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {pedidos.map((pedido, indice) => (
                <div key={indice} className="flex items-center gap-2">
                  <Input
                    value={pedido}
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="0000000000"
                    onChange={evento => setPedidos(atual => atual.map((valor, posicao) => (posicao === indice ? evento.target.value : valor)))}
                    className="h-11 border-line bg-surface font-mono text-rvd-plum"
                  />
                  {pedidos.length > 1 && (
                    <button type="button" title="Remover pedido" onClick={() => setPedidos(atual => atual.filter((_, posicao) => posicao !== indice))} className="rounded-lg p-2 text-ink-faint hover:bg-rvd-plum-pale hover:text-rvd-plum">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="servico-pdf" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">PDF da nota <span className="font-normal normal-case text-ink-faint">(opcional)</span></Label>
            <div className="mt-2 flex items-center gap-3">
              <Paperclip className="size-4 text-rvd-plum" />
              <Input id="servico-pdf" type="file" accept="application/pdf,.pdf" onChange={evento => setPdf(evento.target.files?.[0] ?? null)} className="h-11 cursor-pointer border-line bg-surface text-rvd-plum" />
            </div>
            {pdf && <p className="mt-1 truncate text-[11px] font-bold text-rvd-plum">{pdf.name}</p>}
          </div>
        </form>

        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-ink-soft hover:bg-sunken">Cancelar</Button>
          <Button type="button" onClick={enviar} disabled={registrar.isPending} className="h-11 rounded-xl bg-brand px-6 font-bold text-white hover:bg-brand">
            <CheckCircle2 className="size-4" />
            {registrar.isPending ? "Registrando..." : "Registrar"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
