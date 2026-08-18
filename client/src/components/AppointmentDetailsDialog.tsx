import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type PortalStatus, statusCopy } from "@/lib/portal";
import { CalendarDays, ClipboardList, FileText, Package, Users } from "lucide-react";

export type AppointmentDetail = {
  id: number;
  supplierId: number;
  supplierName: string | null;
  supplierEmail: string | null;
  serviceType: string;
  scheduledFor: Date;
  notes: string | null;
  source: "portal" | "manual_xml";
  preNoteConfirmedAt: Date | null;
  preNoteConfirmedBy: number | null;
  xmlUrl: string | null;
  xmlFileName: string | null;
  invoiceNumber: string | null;
  invoiceAccessKey: string | null;
  purchaseOrder: string | null;
  invoiceSupplierName: string | null;
  recipientCnpj: string | null;
  invoiceIssuedAt: Date | null;
  rejectionReason: string | null;
  status: PortalStatus;
  createdAt: Date;
};

const statusStyle: Record<PortalStatus, string> = {
  pending: "bg-rvd-blue-pale text-rvd-plum",
  scheduled: "bg-rvd-plum-pale text-rvd-plum",
  received: "bg-rvd-lilac-blue text-rvd-plum",
  completed: "bg-rvd-blue text-rvd-plum",
  backlog: "bg-rvd-plum-pale text-rvd-plum",
  rejected: "bg-rvd-lilac-blue text-rvd-plum",
};

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function timeLabel(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function cnpjLabel(value: string | null) {
  if (!value) return "Não informado";
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : value;
}

function DetailStat({ label, children }: { label: string; children: React.ReactNode }) {
  return <article className="rounded-2xl bg-[#fafbfc] px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-rvd-plum">{label}</p><div className="mt-2 font-display text-lg font-extrabold text-rvd-plum">{children}</div></article>;
}

export default function AppointmentDetailsDialog({ appointment, open, onOpenChange, onHistory }: { appointment: AppointmentDetail | null; open: boolean; onOpenChange: (open: boolean) => void; onHistory: () => void }) {
  if (!appointment) return null;
  const displaySupplier = appointment.invoiceSupplierName || appointment.supplierName || "Fornecedor não informado";

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-6xl overflow-y-auto rounded-[2rem] !border !border-rvd-plum-soft !bg-white p-0 shadow-2xl"><DialogHeader className="border-b border-rvd-plum-soft bg-white px-6 py-5 sm:px-8"><div className="flex flex-wrap items-start justify-between gap-4 pr-8"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rvd-plum-pale text-rvd-plum"><FileText className="size-5" /></span><div><DialogTitle className="font-display text-2xl font-extrabold text-rvd-plum">Detalhes do agendamento</DialogTitle><DialogDescription className="mt-1 text-rvd-plum">NF {appointment.invoiceNumber || "não identificada"} · criada em {dateLabel(appointment.createdAt)}</DialogDescription></div></div><Button type="button" variant="ghost" onClick={onHistory} className="rounded-xl border border-rvd-plum-soft bg-white font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><CalendarDays className="size-4" />Histórico de datas</Button></div></DialogHeader><div className="bg-white px-6 py-6 sm:px-8"><section className="grid gap-3 md:grid-cols-3"><DetailStat label="Status atual"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusStyle[appointment.status]}`}>{statusCopy[appointment.status]}</span></DetailStat><DetailStat label="Data agendada"><span className="inline-flex items-center gap-2"><CalendarDays className="size-4" />{dateLabel(appointment.scheduledFor)}</span></DetailStat><DetailStat label="Horário"><span className="inline-flex items-center gap-2"><ClipboardList className="size-4" />{timeLabel(appointment.scheduledFor)}</span></DetailStat></section><section className="mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]"><article><h3 className="flex items-center gap-2 text-lg font-extrabold text-rvd-plum"><FileText className="size-5" />Informações da nota</h3><div className="mt-4 grid gap-4 border-t border-rvd-plum-soft pt-4 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum">Número NF</p><p className="mt-1 font-display text-lg font-extrabold text-rvd-plum">{appointment.invoiceNumber || "Não informado"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum">Pedido</p><p className="mt-1 font-bold text-rvd-plum">{appointment.purchaseOrder || "Não informado"}</p></div><div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum">Chave de acesso</p><p className="mt-2 break-all rounded-xl bg-[#fafbfc] px-3 py-2 font-mono text-xs text-rvd-plum">{appointment.invoiceAccessKey || "Não disponível para esta nota"}</p></div></div></article><article><h3 className="flex items-center gap-2 text-lg font-extrabold text-rvd-plum"><Users className="size-5" />Participantes</h3><div className="mt-4 space-y-4 border-t border-rvd-plum-soft pt-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum">Fornecedor</p><p className="mt-1 font-bold text-rvd-plum">{displaySupplier}</p><p className="text-sm text-rvd-plum">{appointment.supplierEmail || "E-mail não informado"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum">Destinatário</p><p className="mt-1 font-bold text-rvd-plum">RVD Saúde</p><p className="text-sm text-rvd-plum">CNPJ: {cnpjLabel(appointment.recipientCnpj)}</p></div></div></article></section><section className="mt-7"><h3 className="flex items-center gap-2 text-lg font-extrabold text-rvd-plum"><Package className="size-5" />Itens da nota</h3><div className="mt-4 overflow-hidden rounded-2xl border border-rvd-plum-soft"><table className="w-full text-left"><thead className="bg-[#fafbfc]"><tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-rvd-plum"><th className="px-4 py-3">Descrição registrada</th><th className="px-4 py-3">Origem</th></tr></thead><tbody><tr className="border-t border-rvd-plum-soft"><td className="px-4 py-4 font-semibold text-rvd-plum">{appointment.serviceType}</td><td className="px-4 py-4 text-sm text-rvd-plum">{appointment.source === "manual_xml" ? "XML da nota fiscal" : "Solicitação pelo portal"}</td></tr></tbody></table></div></section><section className="mt-7"><h3 className="text-lg font-extrabold text-rvd-plum">Observações</h3><div className="mt-4 rounded-2xl bg-[#fafbfc] p-4 text-sm leading-6 text-rvd-plum">{appointment.rejectionReason ? `Motivo da recusa: ${appointment.rejectionReason}` : appointment.notes || "Nenhuma observação registrada para este agendamento."}</div></section></div><footer className="flex flex-col-reverse gap-3 border-t border-rvd-plum-soft bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p className="text-xs font-semibold uppercase tracking-wide text-rvd-plum">{appointment.xmlFileName ? `Documento processado: ${appointment.xmlFileName}` : "Agendamento registrado no portal RVD Saúde"}</p><Button type="button" onClick={() => onOpenChange(false)} className="rounded-xl bg-rvd-plum px-6 font-bold text-white hover:bg-rvd-plum">Fechar</Button></footer></DialogContent></Dialog>;
}
