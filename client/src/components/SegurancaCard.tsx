import { trpc } from "@/lib/trpc";
import { CheckCircle2, ShieldAlert, TriangleAlert } from "lucide-react";

/**
 * O que ainda está aberto na segurança, e o que fazer com cada coisa.
 *
 * As pendências viviam numa conversa — "no sábado troca o banco para a rede
 * interna", "confere o segredo da sessão". Conversa se perde, e meses depois
 * ninguém sabe se foi feito. Aqui elas ficam à vista, respondidas pelo próprio
 * servidor que está no ar: o que está verde já foi, o que está laranja tem o
 * passo escrito do lado.
 */
export default function SegurancaCard() {
  const estado = trpc.manutencao.estadoDeSeguranca.useQuery(undefined, { refetchInterval: 120_000 });
  const itens = estado.data ?? [];
  const abertos = itens.filter(item => !item.ok);

  return (
    <section className="panel p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className={`rounded-xl p-2.5 ${abertos.length ? "bg-state-wait-bg text-state-wait" : "bg-state-go-bg text-state-go"}`}>
          {abertos.length ? <ShieldAlert className="size-5" /> : <CheckCircle2 className="size-5" />}
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">Segurança</p>
          <h2 className="mt-0.5 font-display text-base font-extrabold text-ink">
            {estado.isLoading ? "Conferindo..." : abertos.length ? `${abertos.length} ${abertos.length === 1 ? "ponto aberto" : "pontos abertos"}` : "Nada pendente"}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-soft">
            O que o servidor no ar está vendo agora. Nenhum valor de senha ou chave aparece aqui — só o que dá para concluir deles.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-3 lg:grid-cols-2">
        {itens.map(item => (
          <li key={item.chave} className={`rounded-2xl border p-4 ${item.ok ? "border-line bg-surface" : "border-state-wait/40 bg-state-wait-bg/40"}`}>
            <div className="flex items-start gap-2.5">
              {item.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-state-go" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-state-wait" />}
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-ink">{item.titulo}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-soft">{item.situacao}</p>
                {item.comoResolver && (
                  <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-[12px] leading-5 text-rvd-plum">
                    <span className="font-bold">Como resolver: </span>
                    {item.comoResolver}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
