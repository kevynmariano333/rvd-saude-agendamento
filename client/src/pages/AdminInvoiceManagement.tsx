import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CalendarClock, FileWarning, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import LoadingTruck from "../components/LoadingTruck";
import PortalLayout from "./PortalLayout";

type Invoice = {
  id: number;
  invoiceNumber: string | null;
  invoiceSupplierName: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  source: "portal" | "manual_xml";
  status: string;
  createdAt: Date;
};

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  scheduled: "Agendado",
  received: "Recebida",
  completed: "Concluída",
  rejected: "Rejeitada",
  backlog: "Backlog",
};

export default function AdminInvoiceManagement() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<Invoice | null>(null);
  const invoices = trpc.appointments.list.useQuery({ invoiceNumber: invoiceNumber || undefined });
  const refreshOperationalData = () => {
    utils.appointments.list.invalidate();
    utils.calendar.list.invalidate();
    utils.analytics.dashboard.invalidate();
  };
  const removeInvoice = trpc.appointments.delete.useMutation({
    onSuccess: () => {
      toast.success("Nota removida com os registros vinculados.");
      setDeleteTarget(null);
      refreshOperationalData();
    },
    onError: error => toast.error(error.message),
  });
  const returnForRescheduling = trpc.appointments.returnForRescheduling.useMutation({
    onSuccess: () => {
      toast.success("Nota retornada para Agendado. O operador já pode definir um novo horário.");
      setCorrectionTarget(null);
      refreshOperationalData();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    else if (auth.data && auth.data.role !== "admin") setLocation("/operador");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Preparando a administração de notas" />;
  if (!auth.data || auth.data.role !== "admin") return <div className="min-h-screen bg-canvas" />;

  return (
    <PortalLayout user={auth.data} title="Administrar notas" subtitle="Correção auditável de status e exclusão definitiva de notas fiscais.">
      <section className="rounded-3xl border border-line bg-[#fafbfc] p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rvd-plum text-white"><ShieldCheck className="size-6" /></span>
            <div>
              <h2 className="font-display text-2xl font-extrabold text-ink">Área exclusiva do Administrador</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">A exclusão é definitiva. Caso uma nota seja marcada como Recebida ou Concluída por engano, use <strong>Voltar para agendar</strong> para retornar o status a Agendado e permitir um novo horário. Todas as correções ficam registradas no histórico.</p>
            </div>
          </div>
          <div className="w-full lg:max-w-sm">
            <label htmlFor="admin-invoice-search" className="text-xs font-bold uppercase tracking-wide text-rvd-plum">Localizar nota</label>
            <div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-rvd-plum" /><Input id="admin-invoice-search" value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} placeholder="Número da NF" className="border-line bg-surface pl-9 text-rvd-plum" /></div>
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-[#fafbfc]"><tr className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint"><th className="px-6 py-5">Nota fiscal</th><th className="px-6 py-5">Fornecedor</th><th className="px-6 py-5">Status</th><th className="px-6 py-5">Registro</th><th className="px-6 py-5 text-right">Administração</th></tr></thead>
            <tbody>
              {invoices.isLoading ? <tr><td colSpan={5} className="px-6 py-16 text-center font-bold text-rvd-plum">Carregando notas...</td></tr> : invoices.data?.length ? invoices.data.map(invoice => {
                const canReturnForRescheduling = invoice.status === "received" || invoice.status === "completed";
                return <tr key={invoice.id} className="border-t border-line"><td className="px-6 py-5"><p className="font-display text-lg font-extrabold text-ink">{invoice.invoiceNumber || "Sem número fiscal"}</p><p className="text-xs text-ink-soft">{invoice.source === "manual_xml" ? "XML" : "Portal"}</p></td><td className="px-6 py-5"><p className="font-bold text-rvd-plum">{invoice.invoiceSupplierName || invoice.supplierName || "Fornecedor"}</p><p className="mt-1 text-xs text-ink-soft">{invoice.supplierEmail}</p></td><td className="px-6 py-5"><span className="rounded-full bg-rvd-plum-pale px-3 py-1 text-xs font-bold uppercase tracking-wide text-rvd-plum">{statusLabel[invoice.status] || invoice.status}</span></td><td className="px-6 py-5 text-sm text-ink-soft">{new Date(invoice.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td><td className="px-6 py-5"><div className="flex justify-end gap-2">{canReturnForRescheduling && <Button onClick={() => setCorrectionTarget(invoice)} variant="ghost" className="border border-rvd-blue bg-surface font-bold text-rvd-plum hover:bg-rvd-blue-pale hover:text-rvd-plum"><RotateCcw className="size-4" />Voltar para agendar</Button>}<Button onClick={() => setDeleteTarget(invoice)} variant="ghost" className="border border-red-200 bg-surface font-bold text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 className="size-4" />Excluir nota</Button></div></td></tr>;
              }) : <tr><td colSpan={5} className="px-6 py-16 text-center"><FileWarning className="mx-auto size-8 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Nenhuma nota encontrada</p><p className="mt-1 text-sm text-ink-soft">Ajuste o número da nota para localizar outro registro.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={Boolean(correctionTarget)} onOpenChange={open => !open && setCorrectionTarget(null)}>
        <DialogContent className="max-w-md rounded-[2rem] border-line bg-surface p-7">
          <DialogHeader><div className="flex size-11 items-center justify-center rounded-2xl bg-rvd-blue-pale text-rvd-plum"><CalendarClock className="size-5" /></div><DialogTitle className="mt-4 font-display text-2xl font-extrabold text-ink">Retornar nota para Agendado?</DialogTitle><DialogDescription className="mt-2 text-rvd-plum">A nota <strong>{correctionTarget?.invoiceNumber || "sem número fiscal"}</strong> será corrigida de <strong>{correctionTarget ? statusLabel[correctionTarget.status] : ""}</strong> para <strong>Agendado</strong>. A confirmação de recebimento e a pré-nota serão removidas para que um novo horário seja definido. O histórico registrará esta correção administrativa.</DialogDescription></DialogHeader>
          <div className="mt-7 flex gap-3"><Button variant="ghost" onClick={() => setCorrectionTarget(null)} className="flex-1 border border-line bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={() => correctionTarget && returnForRescheduling.mutate({ appointmentId: correctionTarget.id })} disabled={returnForRescheduling.isPending} className="flex-1 bg-rvd-plum font-bold text-white hover:bg-rvd-plum"><RotateCcw className="size-4" />{returnForRescheduling.isPending ? "Corrigindo..." : "Voltar para agendar"}</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-[2rem] border-line bg-surface p-7">
          <DialogHeader><div className="flex size-11 items-center justify-center rounded-2xl bg-red-100 text-red-700"><FileWarning className="size-5" /></div><DialogTitle className="mt-4 font-display text-2xl font-extrabold text-ink">Excluir nota definitivamente?</DialogTitle><DialogDescription className="mt-2 text-rvd-plum">A nota <strong>{deleteTarget?.invoiceNumber || "sem número fiscal"}</strong> e todos os seus registros vinculados serão removidos. Esta ação não pode ser desfeita.</DialogDescription></DialogHeader>
          <div className="mt-7 flex gap-3"><Button variant="ghost" onClick={() => setDeleteTarget(null)} className="flex-1 border border-line bg-surface font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={() => deleteTarget && removeInvoice.mutate({ appointmentId: deleteTarget.id })} disabled={removeInvoice.isPending} className="flex-1 bg-red-700 font-bold text-white hover:bg-red-800"><Trash2 className="size-4" />{removeInvoice.isPending ? "Excluindo..." : "Excluir nota"}</Button></div>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
