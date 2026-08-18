import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { FileWarning, Upload, X } from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const receipt = trpc.appointments.registerUnscheduledReceipt.useMutation({
    onSuccess: () => { toast.success("Recebimento registrado com sucesso."); setFile(null); onOpenChange(false); onRegistered(); },
    onError: error => toast.error(error.message),
  });
  const register = async () => {
    if (!file) return toast.error("Selecione o XML da nota fiscal.");
    if (!file.name.toLowerCase().endsWith(".xml")) return toast.error("Envie apenas um arquivo XML.");
    if (file.size > 2 * 1024 * 1024) return toast.error("O XML deve ter até 2 MB.");
    try { receipt.mutate({ fileName: file.name, xmlBase64: await readAsBase64(file) }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível preparar o XML."); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl overflow-hidden rounded-[2rem] border-0 p-0"><DialogHeader className="border-b border-rvd-plum-soft px-7 py-6"><DialogTitle className="font-display text-2xl font-extrabold text-rvd-plum">Recebimento sem agendamento</DialogTitle><DialogDescription className="text-rvd-plum">Registre uma nota que chegou sem agendamento prévio.</DialogDescription></DialogHeader><div className="p-7"><button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-44 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-rvd-plum-soft bg-rvd-plum-pale/40 p-6 text-center transition hover:bg-rvd-plum-pale"><span className="rounded-2xl bg-white p-3 text-rvd-plum"><Upload className="size-6" /></span><p className="mt-4 font-bold text-rvd-plum">{file ? file.name : "Clique para carregar o XML da nota"}</p><p className="mt-1 text-sm text-rvd-plum">O XML preenche todos os campos automaticamente.</p><input ref={inputRef} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={event => setFile(event.target.files?.[0] ?? null)} /></button><div className="mt-4 flex items-center gap-2 rounded-2xl border border-rvd-plum-soft px-4 py-3 text-sm font-semibold text-rvd-plum"><FileWarning className="size-4" />Não possui o XML da nota? Solicite-o ao fornecedor antes de registrar o recebimento.</div><div className="mt-7 flex justify-end gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={register} disabled={!file || receipt.isPending} className="h-12 rounded-2xl bg-rvd-plum px-6 font-bold text-white hover:bg-rvd-plum">{receipt.isPending ? "Registrando..." : "Registrar recebimento"}</Button></div></div></DialogContent></Dialog>;
}
