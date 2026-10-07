import { trpc } from "@/lib/trpc";
import { NOTA_MAXIMA, rotuloDaNota } from "@shared/notaDoPortal";
import { Star } from "lucide-react";

const ESTRELAS = [1, 2, 3, 4, 5];

/**
 * A nota que quem usa dá para o portal.
 *
 * Fica no fim do painel porque não é um número da operação: não muda o que
 * fazer amanhã de manhã. Mas é o único que diz se o trabalho de melhorar a
 * ferramenta está chegando em alguém — e, sem ele, a única medida do portal
 * eram as reclamações, que só aparecem quando algo quebra.
 *
 * A distribuição vai junto da média porque a média esconde o que importa: 3,0
 * pode ser todo mundo achando mediano, ou metade achando ótimo e metade
 * achando péssimo, e as duas situações pedem coisas diferentes.
 */
export default function NotaDoPortalCard() {
  const resumo = trpc.feedback.nota.useQuery();
  const dados = resumo.data;
  const media = dados?.media ?? null;
  const total = dados?.total ?? 0;
  const maior = Math.max(1, ...ESTRELAS.map(valor => dados?.porNota?.[valor] ?? 0));

  return (
    <section className="panel p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">Quem usa o portal</p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-ink">A nota do RVDlog+</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
            Dada por quem usa, pelo botão de sugestão. Não muda o que fazer amanhã de manhã — diz se o trabalho de
            melhorar a ferramenta está chegando em alguém.
          </p>
        </div>
        <span className="rounded-xl bg-rvd-plum-pale p-2.5 text-rvd-plum"><Star className="size-5" /></span>
      </div>

      {media === null ? (
        <p className="mt-6 rounded-2xl bg-canvas px-5 py-10 text-center text-sm text-ink-soft">
          Ninguém deu nota ainda. O botão de sugestão fica no canto da tela do fornecedor e no menu da conta de quem é
          de dentro.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="shrink-0 text-center sm:text-left">
            <p className="font-display text-5xl font-extrabold text-ink">
              {media.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
              <span className="ml-1 text-xl font-bold text-ink-faint">/ {NOTA_MAXIMA}</span>
            </p>
            <div className="mt-2 flex justify-center gap-0.5 sm:justify-start">
              {ESTRELAS.map(valor => (
                <Star key={valor} className={`size-5 ${valor <= Math.round(media) ? "fill-rvd-plum text-rvd-plum" : "text-ink-faint"}`} />
              ))}
            </div>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
              {total} {total === 1 ? "nota dada" : "notas dadas"}
            </p>
          </div>

          <ul className="min-w-0 flex-1 space-y-1.5">
            {[...ESTRELAS].reverse().map(valor => {
              const quantas = dados?.porNota?.[valor] ?? 0;
              return (
                <li key={valor} className="flex items-center gap-3 text-[12px]">
                  <span className="w-24 shrink-0 text-ink-soft">{valor} · {rotuloDaNota(valor)}</span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas">
                    <span className="block h-full rounded-full bg-rvd-plum" style={{ width: `${(quantas / maior) * 100}%` }} />
                  </span>
                  <span className="w-6 shrink-0 text-right font-bold text-ink">{quantas}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
