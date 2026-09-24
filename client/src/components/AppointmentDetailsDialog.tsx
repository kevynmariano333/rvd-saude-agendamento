import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hasConfirmedAppointmentMoment, type PortalSource, type PortalStatus, statusCopy } from "@/lib/portal";
import { AlertTriangle, Banknote, CalendarDays, CheckCircle2, ClipboardList, FileText, Package, ShoppingCart, Users } from "lucide-react";
import { unidadePorCnpj } from "@shared/recipients";
import { cnpjDoRemetente } from "@/lib/reports";
import UrgenciaBadge from "./UrgenciaBadge";
import { trpc } from "@/lib/trpc";
import { casarItensComPedido, pedidoDeCadaLinhaDaNota } from "@shared/casamentoDePedido";
import { useState } from "react";

export type AppointmentDetail = { id: number; supplierId: number; supplierName: string | null; supplierEmail: string | null; serviceType: string; scheduledFor: Date; notes: string | null; source: PortalSource; preNoteConfirmedAt: Date | null; preNoteConfirmedBy: number | null; xmlUrl: string | null; xmlFileName: string | null; invoiceNumber: string | null; invoiceAccessKey: string | null; purchaseOrder: string | null; invoiceSupplierName: string | null; invoiceSupplierCnpj: string | null; supplierCnpj: string | null; recipientCnpj: string | null; invoiceIssuedAt: Date | null; invoiceTotalCents: number | null; invoiceVolumeCount: number | null; receivedAt: Date | null; miroNumber: string | null; quotationNumber: string | null; memorizedOrder: string | null; hisEntryDocument: string | null; hisExitDocument: string | null; backlogReasonCode: string | null; backlogReason: string | null; treatedAt: Date | null; rejectionReason: string | null; status: PortalStatus; createdAt: Date; updatedAt: Date };

const statusStyle: Record<PortalStatus, string> = { pending: "bg-rvd-blue-pale text-rvd-plum", scheduled: "bg-rvd-plum-pale text-rvd-plum", received: "bg-rvd-lilac-blue text-rvd-plum", completed: "bg-rvd-blue text-rvd-plum", backlog: "bg-rvd-plum-pale text-rvd-plum", rejected: "bg-rvd-lilac-blue text-rvd-plum" };
const dateLabel = (value: Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
const timeLabel = (value: Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const cnpjLabel = (value: string | null) => { if (!value) return "Não informado"; const digits = value.replace(/\D/g, ""); return digits.length === 14 ? digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : value; };
const currencyLabel = (value: number | null) => value === null ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
// O sapCode vem preenchido nas notas do acervo importado, que trouxeram o
// código do material junto. Nas notas de XML ele não existe — ali o código sai
// do pedido de compra, casando a linha pelo preço.
type InvoiceItem = { description: string; quantity: number | null; unitPriceCents: number | null; totalCents: number | null; sapCode?: string | null };
const readInvoiceItems = (value: string | null): InvoiceItem[] => { if (!value) return []; try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is InvoiceItem => Boolean(item && typeof item === "object" && "description" in item)).slice(0, 50) : []; } catch { return []; } };


/**
 * O número MIRO, e o que a falta dele significa.
 *
 * Nota lançada no SAP tem MIRO, e é o que fecha o ciclo: verde. Nota sem MIRO
 * não fechou — ou está em backlog agora, ou já passou por um —, e isso precisa
 * saltar da tela em vermelho, porque é a única pendência que o financeiro
 * enxerga depois. A cor não fica sozinha: a palavra "Backlog" vai escrita, para
 * quem não distingue as duas cores ler a mesma informação.
 */
function MiroDoDetalhe({ miroNumber, status, backlogReasonCode, treatedAt }: { miroNumber: string | null; status: PortalStatus; backlogReasonCode: string | null; treatedAt: Date | null }) {
  if (miroNumber) {
    return (
      <p className="mt-1 inline-flex items-center gap-2 rounded-lg bg-state-go-bg px-2.5 py-1 font-mono text-sm font-extrabold text-state-go">
        <CheckCircle2 className="size-4" />
        {miroNumber}
      </p>
    );
  }
  const passouPeloBacklog = status === "backlog" || Boolean(backlogReasonCode) || Boolean(treatedAt);
  return (
    <p className={`mt-1 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide ${passouPeloBacklog ? "bg-state-stop-bg text-state-stop" : "bg-sunken text-ink-soft"}`}>
      <AlertTriangle className="size-4" />
      {passouPeloBacklog ? "Backlog" : "Ainda não lançado"}
    </p>
  );
}

/**
 * O código do material no SAP, ao lado do que o fornecedor escreveu.
 *
 * Vem de duas fontes, nesta ordem: o código que a própria nota trouxe (o acervo
 * importado guardou), e, quando ela não trouxe, o do item do pedido de compra
 * que casa com a linha. Quando nenhuma das duas responde, a tela diz "não
 * mapeado" em vez de deixar a célula vazia: célula vazia parece falha de
 * carregamento, e aqui a ausência é a informação — aquela linha ainda não tem
 * material do SAP correspondente, e alguém precisa olhar.
 */
function CodigoSapDaLinha({ sapCode }: { sapCode: string | null }) {
  if (!sapCode) return <span className="text-[12px] italic text-ink-faint">não mapeado</span>;
  return <span className="font-mono text-[12px] font-bold text-ink">{sapCode}</span>;
}

/**
 * A conferência contra o pedido do SAP, desligada.
 *
 * O cruzamento entre a nota e o pedido de compra saiu errado em notas de
 * verdade, e informação errada ao lado do número certo é pior do que informação
 * nenhuma: quem confere passa a desconfiar da tela inteira. Fica fora da tela
 * até os dados serem conferidos.
 *
 * Nada foi apagado — a importação dos pedidos, o casamento das linhas e os
 * testes seguem de pé, e os pedidos continuam sendo gravados, que é o que
 * permite conferir com calma. Voltar é trocar este `false` por `true`.
 */
const MOSTRAR_CODIGO_SAP: boolean = false;

function DetailStat({ label, children }: { label: string; children: React.ReactNode }) { return <article className="rounded-2xl bg-sunken px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">{label}</p><div className="mt-1.5 font-display text-base font-extrabold text-ink">{children}</div></article>; }

export default function AppointmentDetailsDialog({ appointment, open, onOpenChange, onHistory }: { appointment: AppointmentDetail | null; open: boolean; onOpenChange: (open: boolean) => void; onHistory: () => void }) {
  // Todo hook antes de qualquer saída antecipada. Um useQuery depois do return
  // muda a quantidade de hooks entre renderizações e derruba a tela inteira.
  // Os itens são o dado mais pesado da nota e só interessam aqui dentro:
  // chegam quando alguém abre esta janela, e não antes, para todas as notas.
  const notaCompleta = trpc.appointments.byId.useQuery({ appointmentId: appointment?.id ?? 0 }, { enabled: open && Boolean(appointment) });
  // O que a compra esperava. Vem do relatório do SAP, por pedido — e só é
  // buscado quando alguém abre a nota, como os itens.
  const doPedido = trpc.appointments.pedidosDaNota.useQuery({ appointmentId: appointment?.id ?? 0 }, { enabled: MOSTRAR_CODIGO_SAP && open && Boolean(appointment), retry: false });
  const [verPedidoInteiro, setVerPedidoInteiro] = useState(false);
  if (!appointment) return null;
  const displaySupplier = appointment.invoiceSupplierName || appointment.supplierName || "Fornecedor não informado";
  const unidadeDaNota = unidadePorCnpj(appointment.recipientCnpj);
  const confirmed = hasConfirmedAppointmentMoment(appointment.status);
  const received = appointment.status === "received" && Boolean(appointment.receivedAt);
  const shownAt = received ? appointment.receivedAt! : appointment.scheduledFor;
  const dateHeading = received ? "Data de recebimento" : "Data agendada";
  const timeHeading = received ? "Hora do recebimento" : "Horário";
  const invoiceItems = readInvoiceItems(notaCompleta.data?.invoiceItemsJson ?? null);
  // Do pedido inteiro, as linhas que esta nota está entregando. Quando nada
  // casa, a lista vem vazia e a tela mostra o pedido todo — melhor do que
  // esconder a linha certa atrás de um palpite.
  const itensDoPedido = doPedido.data?.itens ?? [];
  const casados = casarItensComPedido(invoiceItems, itensDoPedido);
  // O código SAP de cada linha da nota, para a conferência não depender de
  // ler a descrição do fornecedor e adivinhar qual material do SAP é.
  const pedidoDaLinha = pedidoDeCadaLinhaDaNota(invoiceItems, itensDoPedido);
  const casadosPorItem = new Map(casados.map(casamento => [casamento.item.item, casamento.motivo]));
  const mostrarTudo = verPedidoInteiro || casados.length === 0;
  const itensVisiveis = mostrarTudo ? itensDoPedido : casados.map(casamento => casamento.item);
  // Nota trazida do sistema anterior não tem XML: dizer que o valor saiu de um
  // manda a operação procurar um arquivo que não existe.
  const daImportacao = appointment.source === "importado";

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-1rem)] !max-w-7xl overflow-y-auto rounded-[2rem] !border !border-line !bg-surface p-0 shadow-2xl sm:!max-w-7xl"><DialogHeader className="border-b border-line bg-surface px-6 py-5 sm:px-8"><div className="flex flex-wrap items-start justify-between gap-4 pr-8"><div className="flex items-start gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rvd-plum-pale text-rvd-plum"><FileText className="size-5" /></span><div><DialogTitle className="font-display text-xl font-extrabold text-ink">Detalhamento da nota</DialogTitle><DialogDescription className="mt-0.5 text-[13px] text-rvd-plum">NF {appointment.invoiceNumber || "não identificada"} · criada em {dateLabel(appointment.createdAt)}</DialogDescription></div></div><Button type="button" variant="ghost" onClick={onHistory} className="h-9 rounded-xl border border-line bg-surface text-[13px] font-bold text-rvd-plum hover:bg-rvd-plum-pale hover:text-rvd-plum"><CalendarDays className="size-4" />Histórico de datas</Button></div></DialogHeader><div className="bg-surface px-6 py-6 text-[13px] sm:px-8"><section className="grid gap-4 md:grid-cols-3"><DetailStat label="Status atual"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusStyle[appointment.status]}`}>{statusCopy[appointment.status]}</span></DetailStat><DetailStat label={confirmed ? dateHeading : "Agendamento"}>{confirmed ? <span className="inline-flex items-center gap-2"><CalendarDays className="size-4" />{dateLabel(shownAt)}</span> : <span className="text-sm font-bold">Aguardando confirmação</span>}</DetailStat><DetailStat label={confirmed ? timeHeading : "Horário"}>{confirmed ? <span className="inline-flex items-center gap-2"><ClipboardList className="size-4" />{timeLabel(shownAt)}</span> : <span className="text-sm font-bold">—</span>}</DetailStat></section><section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]"><article><h3 className="flex items-center gap-2 text-base font-extrabold text-rvd-plum"><FileText className="size-5" />Informações da nota</h3><div className="mt-4 grid gap-5 border-t border-line pt-5 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Número NF</p><p className="mt-1 font-display text-base font-extrabold text-ink">{appointment.invoiceNumber || "Não informado"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Pedido</p><p className="mt-1 flex flex-wrap items-center gap-2 font-bold text-rvd-plum">{appointment.purchaseOrder || "Não informado"}<UrgenciaBadge purchaseOrder={appointment.purchaseOrder} /></p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Número MIRO (SAP)</p><MiroDoDetalhe miroNumber={appointment.miroNumber} status={appointment.status} backlogReasonCode={appointment.backlogReasonCode} treatedAt={appointment.treatedAt} /></div>{appointment.treatedAt && <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Tratativa do backlog</p><p className="mt-1 text-sm leading-6 text-ink-soft">{[appointment.quotationNumber && `Cotação ${appointment.quotationNumber}`, appointment.memorizedOrder && `Pedido memorizado ${appointment.memorizedOrder}`, appointment.hisEntryDocument && `Entrada HIS ${appointment.hisEntryDocument}`, appointment.hisExitDocument && `Saída HIS ${appointment.hisExitDocument}`].filter(Boolean).join(" · ") || "Sem documentos auxiliares."}</p></div>}<div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Quantidade de volumes</p><p className="mt-1 font-display text-base font-extrabold text-ink">{appointment.invoiceVolumeCount === null ? "Não informado" : `${appointment.invoiceVolumeCount} volume${appointment.invoiceVolumeCount === 1 ? "" : "s"}`}</p></div><div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Chave de acesso</p><p className="mt-2 break-all rounded-xl bg-sunken px-3 py-2 font-mono text-xs text-ink-soft">{appointment.invoiceAccessKey || (daImportacao ? "O acervo do sistema anterior não trouxe a chave — ela só existe nas notas enviadas com XML." : "Não disponível para esta nota")}</p></div></div></article><article><h3 className="flex items-center gap-2 text-base font-extrabold text-rvd-plum"><Users className="size-5" />Participantes</h3><div className="mt-4 space-y-5 border-t border-line pt-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Fornecedor</p><p className="mt-1 font-bold text-rvd-plum">{displaySupplier}</p><p className="text-sm text-ink-soft">CNPJ: {cnpjLabel(cnpjDoRemetente(appointment))}</p><p className="text-sm text-ink-soft">{appointment.supplierEmail || "E-mail não informado"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Destinatário</p><p className="mt-1 font-bold text-rvd-plum">{unidadeDaNota ? `${unidadeDaNota.sigla} — ${unidadeDaNota.nome}` : "Unidade não identificada"}</p><p className="text-sm text-ink-soft">CNPJ: {cnpjLabel(appointment.recipientCnpj)}</p></div></div></article></section><section className="mt-6 rounded-3xl border border-line bg-canvas p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-faint"><Banknote className="size-4" />Resumo financeiro da nota</p><p className="mt-1.5 text-[13px] text-ink-soft">{daImportacao ? "Valores do acervo importado do sistema anterior." : "Valores extraídos diretamente do XML enviado."}</p></div><div className="rounded-2xl bg-surface px-5 py-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">Valor total da NF</p><p className="mt-1 font-display text-lg font-extrabold text-ink">{currencyLabel(appointment.invoiceTotalCents)}</p></div></div></section><section className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-extrabold text-rvd-plum"><Package className="size-5" />Itens da nota</h3><p className="text-[13px] text-ink-soft">{invoiceItems.length ? `${invoiceItems.length} item(ns) ${daImportacao ? "do acervo importado" : "extraído(s) do XML"}` : daImportacao ? "Itens não vieram no acervo importado" : "Itens não disponíveis no XML"}</p></div><div className="mt-4 overflow-x-auto rounded-2xl border border-line"><table className={`${MOSTRAR_CODIGO_SAP ? "min-w-[760px]" : "min-w-[700px]"} w-full text-left`}><thead className="bg-sunken"><tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{MOSTRAR_CODIGO_SAP && <th className="px-4 py-2.5">Cód. SAP</th>}<th className="px-4 py-2.5">Descrição</th><th className="px-4 py-2.5 text-right">Quantidade</th><th className="px-4 py-2.5 text-right">Valor unitário</th><th className="px-4 py-2.5 text-right">Valor total</th></tr></thead><tbody>{invoiceItems.length ? invoiceItems.map((item, index) => <tr key={`${item.description}-${index}`} className="border-t border-line">{MOSTRAR_CODIGO_SAP && <td className="px-4 py-2.5"><CodigoSapDaLinha sapCode={item.sapCode || pedidoDaLinha[index]?.sapCode || null} /></td>}<td className="px-4 py-2.5 font-semibold text-rvd-plum">{item.description}</td><td className="px-4 py-2.5 text-right text-rvd-plum">{item.quantity ?? "—"}</td><td className="px-4 py-2.5 text-right font-bold text-rvd-plum">{currencyLabel(item.unitPriceCents)}</td><td className="px-4 py-2.5 text-right font-bold text-rvd-plum">{currencyLabel(item.totalCents)}</td></tr>) : <tr className="border-t border-line">{MOSTRAR_CODIGO_SAP && <td className="px-4 py-3"><CodigoSapDaLinha sapCode={null} /></td>}<td className="px-4 py-3 font-semibold text-rvd-plum">{appointment.serviceType}</td><td className="px-4 py-3 text-right text-rvd-plum">—</td><td className="px-4 py-3 text-right text-rvd-plum">Não disponível</td><td className="px-4 py-3 text-right text-rvd-plum">{currencyLabel(appointment.invoiceTotalCents)}</td></tr>}</tbody></table></div></section>{MOSTRAR_CODIGO_SAP && itensDoPedido.length > 0 && <section className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-extrabold text-rvd-plum"><ShoppingCart className="size-5" />{mostrarTudo ? "O pedido inteiro, no SAP" : "O item deste pedido que a nota entrega"}</h3>
        <p className="text-[13px] text-ink-soft">{mostrarTudo
          ? `${itensDoPedido.length} item(ns)${casados.length ? " · vendo o pedido todo" : " · nenhum casou com os itens da nota"}`
          : `${casados.length} de ${itensDoPedido.length} item(ns) do pedido`}
          {itensDoPedido.length > casados.length && casados.length > 0 && <button type="button" onClick={() => setVerPedidoInteiro(valor => !valor)} className="ml-2 font-bold text-rvd-plum underline">{mostrarTudo ? "ver só o da nota" : "ver o pedido inteiro"}</button>}
        </p></div>
      {doPedido.data?.unidadeDivergente && <p className="mt-2 inline-flex items-center gap-2 rounded-xl bg-state-stop-bg px-3 py-2 text-[13px] font-bold text-state-stop"><AlertTriangle className="size-4" />O pedido é de outra unidade. Confira o destino antes de receber.</p>}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line"><table className="w-full min-w-[700px] text-left"><thead className="bg-sunken"><tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint"><th className="px-4 py-2.5">Pedido · item</th><th className="px-4 py-2.5">Cód. SAP</th><th className="px-4 py-2.5">Material</th><th className="px-4 py-2.5 text-right">Pedido</th><th className="px-4 py-2.5 text-right">Valor unit.</th></tr></thead><tbody>
        {itensVisiveis.map(item => {
          // A descrição do SAP e a da nota quase nunca são a mesma frase — o
          // fornecedor escreve "COLETOR PERFURO CORTANTE 03L" onde o SAP
          // cadastrou "CAIXA PERF-CORT RET PAP M-PERF AM 3L". A quantidade,
          // essa, é a mesma: quando ela bate com a soma da nota, é quase
          // certamente a mesma linha. Fica como pista, não como afirmação.
          const motivo = casadosPorItem.get(item.item);
          const bate = Boolean(motivo);
          return <tr key={`${item.purchaseOrder}-${item.item}`} className={`border-t border-line ${bate ? "bg-state-go-bg/50" : ""}`}>
            <td className="px-4 py-2.5 font-mono text-[12px] text-rvd-plum">{item.purchaseOrder} · {item.item}</td>
            <td className="px-4 py-2.5 font-mono text-[12px] font-bold text-ink">{item.sapCode || "—"}</td>
            <td className="px-4 py-2.5 text-[12px] text-rvd-plum">{bate && <span title={`Casou por ${motivo}. O SAP e o fornecedor descrevem o mesmo material com palavras diferentes; o número é que não muda.`} className="mr-1.5 rounded bg-state-go-bg px-1.5 py-0.5 text-[10px] font-bold uppercase text-state-go">{motivo}</span>}{item.description || "—"}{item.missingSince && <span title="Não veio no último relatório: provavelmente já foi entregue por completo." className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink-faint">Encerrado</span>}</td>
            <td className="px-4 py-2.5 text-right text-[12px] text-rvd-plum">{item.orderedQuantity ? Number(item.orderedQuantity).toLocaleString("pt-BR") : "—"}</td>
            <td className="px-4 py-2.5 text-right text-[12px] text-rvd-plum">{currencyLabel(item.unitPriceCents)}</td>
          </tr>;
        })}
      </tbody></table></div></section>}
      <section className="mt-6"><h3 className="text-base font-extrabold text-rvd-plum">Observações</h3><div className="mt-4 rounded-2xl bg-sunken p-5 text-sm leading-6 text-ink-soft">{appointment.rejectionReason ? `Motivo da recusa: ${appointment.rejectionReason}` : appointment.notes || "Nenhuma observação registrada para este agendamento."}</div></section></div><footer className="flex flex-col-reverse gap-3 border-t border-line bg-surface px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p className="text-xs font-semibold uppercase tracking-wide text-rvd-plum">{appointment.xmlFileName ? `Documento processado: ${appointment.xmlFileName}` : "Agendamento registrado no portal RVD Saúde"}</p><Button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-xl bg-brand px-6 text-sm font-bold text-white hover:bg-brand">Fechar</Button></footer></DialogContent></Dialog>;
}
