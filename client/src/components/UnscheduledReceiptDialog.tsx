import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { CalendarClock, ClipboardCheck, FileWarning, ShieldAlert, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Não foi possível ler o XML."));
    reader.readAsDataURL(file);
  });
}

export default function UnscheduledReceiptDialog({ open, onOpenChange, onRegistered }: { open: boolean; onOpenChange: (open: boolean) => void; onRegistered: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  /**
   * Em que fila a nota entra. São duas situações diferentes entrando pela mesma
   * porta — a carga que já está na doca e a nota que chegou antes do caminhão —,
   * e só quem está registrando sabe qual é.
   */
  const [situacao, setSituacao] = useState<"recebida" | "pendente">("recebida");
  const inputRef = useRef<HTMLInputElement>(null);
  const receipt = trpc.appointments.registerUnscheduledReceipt.useMutation({
    onSuccess: nota => {
      toast.success(
        nota?.status === "received"
          ? "Recebimento registrado. A nota entrou em Recebido."
          : "Nota registrada. Ela está em Pendente, esperando o agendamento.",
      );
      setFile(null);
      onOpenChange(false);
      onRegistered();
    },
    onError: error => toast.error(error.message),
  });
  // A recusa de nota repetida fica escrita na janela, e não só no aviso que
  // some sozinho: é uma informação que a pessoa precisa reler enquanto decide
  // o que fazer com a mercadoria que está na mão dela.
  const recusa = receipt.error?.message ?? null;
  const cartao = (ativo: boolean) =>
    `flex flex-1 flex-col items-start gap-1.5 rounded-2xl border px-4 py-4 text-left text-sm transition ${
      ativo ? "border-rvd-plum bg-brand text-white" : "border-line bg-sunken text-ink-soft hover:bg-rvd-plum-pale hover:text-rvd-plum"
    }`;
  const trocarArquivo = (novo: File | null) => {
    receipt.reset();
    setFile(novo);
  };
  const register = async () => {
    if (!file) return toast.error("Selecione o XML da nota fiscal.");
    if (!file.name.toLowerCase().endsWith(".xml")) return toast.error("Envie apenas um arquivo XML.");
    if (file.size > 2 * 1024 * 1024) return toast.error("O XML deve ter até 2 MB.");
    try { receipt.mutate({ fileName: file.name, xmlBase64: await readAsBase64(file), situacao }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível preparar o XML."); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent style={{ backgroundColor: "#ffffff", opacity: 1 }} className="max-w-2xl overflow-hidden rounded-[2rem] !border !border-line !bg-surface p-0 opacity-100 shadow-2xl"><DialogHeader className="border-b border-line bg-surface px-7 py-6"><DialogTitle className="font-display text-2xl font-extrabold text-ink">Recebimento sem agendamento</DialogTitle><DialogDescription className="text-rvd-plum">Registre uma nota que não passou pelo agendamento.</DialogDescription></DialogHeader><div className="bg-surface p-7"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Em que situação a nota entra</p><div className="mt-3 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => setSituacao("recebida")} aria-pressed={situacao === "recebida"} className={cartao(situacao === "recebida")}><span className="flex items-center gap-2 font-bold"><ClipboardCheck className="size-5" />Recebida sem agendamento</span><span className={`text-[12px] leading-5 ${situacao === "recebida" ? "text-white/85" : "text-ink-soft"}`}>A carga já chegou e foi conferida. A nota entra em <strong>Recebido</strong>, com a data de agora.</span></button><button type="button" onClick={() => setSituacao("pendente")} aria-pressed={situacao === "pendente"} className={cartao(situacao === "pendente")}><span className="flex items-center gap-2 font-bold"><CalendarClock className="size-5" />Pendente de agendamento</span><span className={`text-[12px] leading-5 ${situacao === "pendente" ? "text-white/85" : "text-ink-soft"}`}>A nota chegou antes do caminhão. Entra em <strong>Pendente</strong>, esperando data.</span></button></div><div className="mt-6" /><button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-44 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line bg-[#f5ecf5] p-6 text-center shadow-inner transition hover:bg-rvd-plum-pale"><span className="rounded-2xl bg-surface p-3 text-rvd-plum shadow-sm"><Upload className="size-6" /></span><p className="mt-4 font-bold text-rvd-plum">{file ? file.name : "Clique para carregar o XML da nota"}</p><p className="mt-1 text-sm text-ink-soft">O XML preenche todos os campos automaticamente.</p><input ref={inputRef} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={event => trocarArquivo(event.target.files?.[0] ?? null)} /></button>{recusa && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-state-stop bg-state-stop-bg px-4 py-3 text-sm font-bold leading-6 text-state-stop"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span>{recusa}</span></div>}<div className="mt-4 flex items-center gap-2 panel px-4 py-3 text-sm font-semibold text-rvd-plum"><FileWarning className="size-4" />Não possui o XML da nota? Solicite-o ao fornecedor antes de registrar.</div><div className="mt-7 flex justify-end gap-3 bg-surface"><Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={register} disabled={!file || receipt.isPending} className="h-12 rounded-2xl bg-brand px-6 font-bold text-white hover:bg-brand">{receipt.isPending ? "Registrando..." : situacao === "recebida" ? "Registrar recebimento" : "Registrar nota pendente"}</Button></div></div></DialogContent></Dialog>;
}
