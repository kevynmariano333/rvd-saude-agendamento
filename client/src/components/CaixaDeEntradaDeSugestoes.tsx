import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { roleLabel, type PortalRole } from "@/lib/portal";
import { Check, Inbox, Undo2 } from "lucide-react";
import { toast } from "sonner";

const quando = (valor: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));

/**
 * Os recados que chegaram pela caixa de sugestões.
 *
 * O fornecedor esbarra nas arestas do portal e não tem por onde falar: liga
 * para a doca, que não desenvolve nada, e o recado morre num papel. Aqui ele
 * chega inteiro — com quem escreveu, de qual empresa e em que tela estava.
 *
 * O "lido" existe porque a caixa é compartilhada entre quem administra: sem
 * ele, dois leem o mesmo recado sem saber que o outro já viu, e um recado
 * respondido continua parecendo pendente.
 */
export default function CaixaDeEntradaDeSugestoes() {
  const caixa = trpc.feedback.lista.useQuery(undefined, { refetchInterval: 120_000 });
  const utils = trpc.useUtils();

  const marcar = trpc.feedback.marcarLido.useMutation({
    onSuccess: () => void utils.feedback.lista.invalidate(),
    onError: erro => toast.error(erro.message),
  });

  const recados = caixa.data?.recados ?? [];
  const naoLidos = caixa.data?.naoLidos ?? 0;

  return (
    <section className="panel p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-rvd-blue-pale p-3 text-rvd-plum">
          <Inbox className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Quem usa o portal</p>
          <h2 className="mt-1 flex items-center gap-2 font-display text-xl font-extrabold text-ink">
            Sugestões recebidas
            {naoLidos > 0 && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-extrabold text-white">{naoLidos} novo{naoLidos > 1 ? "s" : ""}</span>
            )}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            O que chegou pelo botão de sugestão, no canto da tela. O fornecedor é quem mais esbarra nas arestas do sistema e
            quem menos tem por onde falar — antes disso o recado dele morria num telefonema para a doca.
          </p>
        </div>
      </div>

      {caixa.isLoading ? (
        <p className="mt-6 text-sm text-ink-soft">Carregando sugestões...</p>
      ) : recados.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-canvas px-5 py-10 text-center text-sm text-ink-soft">
          Nenhuma sugestão ainda. O botão fica no canto inferior direito de todas as telas.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {recados.map(recado => {
            const lido = Boolean(recado.lidoEm);
            return (
              <li key={recado.id} className={`rounded-2xl border p-4 ${lido ? "border-line bg-canvas" : "border-rvd-plum bg-rvd-plum-pale/40"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-ink">
                      {recado.autorEmpresa || recado.autorNome || "Conta removida"}
                      {recado.autorPerfil && (
                        <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                          {roleLabel[recado.autorPerfil as PortalRole] ?? recado.autorPerfil}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {recado.autorEmail || "sem e-mail"} · {quando(recado.createdAt)}
                      {recado.pagina ? ` · na tela ${recado.pagina}` : ""}
                    </p>
                  </div>
                  <Button
                    onClick={() => marcar.mutate({ feedbackId: recado.id, lido: !lido })}
                    disabled={marcar.isPending}
                    variant="outline"
                    className="h-9 shrink-0 rounded-xl border-line bg-surface px-3.5 text-xs font-bold text-rvd-plum hover:bg-rvd-plum-pale"
                  >
                    {lido ? <><Undo2 className="size-3.5" />Marcar como novo</> : <><Check className="size-3.5" />Dar por lido</>}
                  </Button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{recado.mensagem}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
