import { trpc } from "@/lib/trpc";
import { statusCopy, type PortalStatus } from "@/lib/portal";
import { CheckCircle2, Copy } from "lucide-react";

const dia = (valor: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));

/**
 * As notas que estão duas vezes no banco.
 *
 * O sistema passou a recusar nota repetida, mas a recusa só vale daqui para a
 * frente: o que entrou antes continua lá. Sem esta lista, qualquer repetição
 * que aparecer na tela parece falha da trava — e ninguém consegue distinguir
 * herança de problema novo. A data de cada registro responde isso sozinha.
 */
export default function NotasRepetidasCard() {
  const repetidas = trpc.manutencao.notasRepetidas.useQuery();
  const grupos = repetidas.data ?? [];

  return (
    <section className="panel p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum">
          <Copy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Manutenção</p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-ink">Notas repetidas</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            O sistema recusa uma nota que já esteja cadastrada, pela chave de acesso ou pelo CNPJ do
            emitente com o número. Esta lista mostra as que entraram <strong>antes</strong> dessa
            trava existir — pela data de cada registro dá para saber se é herança ou coisa nova.
          </p>

          {repetidas.isLoading && <p className="mt-4 text-sm font-bold text-rvd-plum">Procurando...</p>}

          {!repetidas.isLoading && !grupos.length && (
            <p className="mt-4 flex items-center gap-2 text-[13px] font-bold text-state-go">
              <CheckCircle2 className="size-4" />
              Nenhuma nota repetida no banco.
            </p>
          )}

          {grupos.map(grupo => (
            <div key={grupo.identidade} className="mt-4 overflow-hidden rounded-2xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-sunken px-4 py-2.5">
                <p className="break-all font-mono text-xs font-bold text-ink">{grupo.identidade}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  {grupo.notas.length} registros · mesma {grupo.porQue}
                </p>
              </div>
              <table className="w-full text-left text-[13px]">
                <tbody>
                  {grupo.notas.map(nota => (
                    <tr key={nota.id} className="border-t border-line">
                      <td className="px-4 py-2 font-bold text-rvd-plum">NF {nota.invoiceNumber || "sem número"}</td>
                      <td className="px-4 py-2 text-ink-soft">{nota.invoiceSupplierName || "fornecedor não informado"}</td>
                      <td className="px-4 py-2 text-ink-soft">{statusCopy[nota.status as PortalStatus] ?? nota.status}</td>
                      <td className="px-4 py-2 text-ink-soft">{nota.source}</td>
                      <td className="px-4 py-2 text-right text-ink-soft">{dia(nota.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
