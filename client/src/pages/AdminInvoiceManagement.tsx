import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { FileWarning, Search, ShieldCheck, Trash2 } from "lucide-react";
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

export default function AdminInvoiceManagement() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [target, setTarget] = useState<Invoice | null>(null);
  const invoices = trpc.appointments.list.useQuery({ invoiceNumber: invoiceNumber || undefined });
  const removeInvoice = trpc.appointments.delete.useMutation({
    onSuccess: () => {
      toast.success("Nota removida com os registros vinculados.");
      setTarget(null);
      utils.appointments.list.invalidate();
      utils.calendar.list.invalidate();
      utils.analytics.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (auth.data === null) setLocation("/");
    else if (auth.data && auth.data.role !== "admin") setLocation("/operador");
  }, [auth.data, setLocation]);

  if (auth.isLoading) return <LoadingTruck label="Preparando a administração de notas" />;
  if (!auth.data || auth.data.role !== "admin") return <div className="min-h-screen bg-white" />;

  return <PortalLayout user={auth.data} title="Administrar notas" subtitle="Exclusão definitiva de notas fiscais e seus registros vinculados.">
    <section className="rounded-3xl border border-rvd-plum-soft bg-[#fafbfc] p-5 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rvd-plum text-white"><ShieldCheck className="size-6" /></span><div><h2 className="font-display text-2xl font-extrabold text-rvd-plum">Área exclusiva do Administrador</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-rvd-plum">A exclusão é definitiva: remove a nota, seu histórico de status, sugestões e mensagens vinculadas. Operadores e fornecedores não têm acesso a esta área.</p></div></div>
        <div className="w-full lg:max-w-sm"><label htmlFor="admin-invoice-search" className="text-xs font-bold uppercase tracking-wide text-rvd-plum">Localizar nota</label><div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-rvd-plum" /><Input id="admin-invoice-search" value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} placeholder="Número da NF" className="border-rvd-plum-soft bg-white pl-9 text-rvd-plum" /></div></div>
      </div>
    </section>

    <section className="mt-6 overflow-hidden rounded-3xl border border-rvd-plum-soft bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="bg-[#fafbfc]"><tr className="text-[11px] font-bold uppercase tracking-[0.1em] text-rvd-plum"><th className="px-6 py-5">Nota fiscal</th><th className="px-6 py-5">Fornecedor</th><th className="px-6 py-5">Status</th><th className="px-6 py-5">Registro</th><th className="px-6 py-5 text-right">Administração</th></tr></thead><tbody>{invoices.isLoading ? <tr><td colSpan={5} className="px-6 py-16 text-center font-bold text-rvd-plum">Carregando notas...</td></tr> : invoices.data?.length ? invoices.data.map(invoice => <tr key={invoice.id} className="border-t border-rvd-plum-soft"><td className="px-6 py-5"><p className="font-display text-lg font-extrabold text-rvd-plum">{invoice.invoiceNumber || "Sem número fiscal"}</p><p className="text-xs text-rvd-plum">{invoice.source === "manual_xml" ? "XML" : "Portal"}</p></td><td className="px-6 py-5"><p className="font-bold text-rvd-plum">{invoice.invoiceSupplierName || invoice.supplierName || "Fornecedor"}</p><p className="mt-1 text-xs text-rvd-plum">{invoice.supplierEmail}</p></td><td className="px-6 py-5"><span className="rounded-full bg-rvd-plum-pale px-3 py-1 text-xs font-bold uppercase tracking-wide text-rvd-plum">{invoice.status}</span></td><td className="px-6 py-5 text-sm text-rvd-plum">{new Date(invoice.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td><td className="px-6 py-5 text-right"><Button onClick={() => setTarget(invoice)} variant="ghost" className="border border-red-200 bg-white font-bold text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 className="size-4" />Excluir nota</Button></td></tr>) : <tr><td colSpan={5} className="px-6 py-16 text-center"><FileWarning className="mx-auto size-8 text-rvd-plum" /><p className="mt-3 font-bold text-rvd-plum">Nenhuma nota encontrada</p><p className="mt-1 text-sm text-rvd-plum">Ajuste o número da nota para localizar outro registro.</p></td></tr>}</tbody></table></div></section>

    <Dialog open={Boolean(target)} onOpenChange={open => !open && setTarget(null)}><DialogContent className="max-w-md rounded-[2rem] border-rvd-plum-soft bg-white p-7"><DialogHeader><div className="flex size-11 items-center justify-center rounded-2xl bg-red-100 text-red-700"><FileWarning className="size-5" /></div><DialogTitle className="mt-4 font-display text-2xl font-extrabold text-rvd-plum">Excluir nota definitivamente?</DialogTitle><DialogDescription className="mt-2 text-rvd-plum">A nota <strong>{target?.invoiceNumber || "sem número fiscal"}</strong> e todos os seus registros vinculados serão removidos. Esta ação não pode ser desfeita.</DialogDescription></DialogHeader><div className="mt-7 flex gap-3"><Button variant="ghost" onClick={() => setTarget(null)} className="flex-1 border border-rvd-plum-soft bg-white font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum">Cancelar</Button><Button onClick={() => target && removeInvoice.mutate({ appointmentId: target.id })} disabled={removeInvoice.isPending} className="flex-1 bg-red-700 font-bold text-white hover:bg-red-800"><Trash2 className="size-4" />{removeInvoice.isPending ? "Excluindo..." : "Excluir nota"}</Button></div></DialogContent></Dialog>
  </PortalLayout>;
}
