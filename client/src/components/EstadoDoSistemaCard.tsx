import { trpc } from "@/lib/trpc";
import { GitCommitHorizontal } from "lucide-react";

/**
 * O que está rodando agora, em números conferíveis.
 *
 * "Atualizei e não mudou nada" é impossível de responder de fora: não dá para
 * saber se o deploy entrou, se o banco acompanhou, ou se a tela aberta é outra.
 * Aqui o próprio sistema diz qual versão está no ar, há quanto tempo, quantas
 * migrações o banco tem e quantas notas existem.
 */
export default function EstadoDoSistemaCard() {
  const estado = trpc.manutencao.estadoDoSistema.useQuery(undefined, { refetchInterval: 60000 });
  return (
    <section className="panel p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-rvd-plum-pale p-2.5 text-rvd-plum"><GitCommitHorizontal className="size-5" /></span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-faint">O que está no ar agora</p>
            <p className="mt-0.5 text-sm font-bold text-ink">
              {estado.isLoading
                ? "Consultando o servidor..."
                : estado.data
                  ? `Versão ${estado.data.commit ?? "não informada pelo provedor"}${estado.data.branch ? ` · ${estado.data.branch}` : ""} · no ar há ${Math.max(1, Math.round(estado.data.subidoHaSegundos / 60))} min`
                  : "Não foi possível consultar."}
            </p>
            {estado.data?.mensagemDoCommit && <p className="mt-0.5 max-w-2xl truncate text-xs text-ink-soft">{estado.data.mensagemDoCommit}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-sunken px-4 py-2 text-xs font-bold text-rvd-plum">
            Migrações: {estado.data ? `${estado.data.migracoesRegistradas ?? "?"} de ${estado.data.migracoesEsperadas ?? "?"}` : "—"}
          </span>
          <span className="rounded-full bg-sunken px-4 py-2 text-xs font-bold text-rvd-plum">
            Notas no banco: {estado.data?.notasNoBanco ? estado.data.notasNoBanco.total : "—"}
          </span>
          {/* O que o servidor no ar entende sobre as contas de teste. Descobrir
              isso tentando entrar é o pior jeito: a tela de login não pode
              dizer o motivo sem contar demais a quem não deveria saber. */}
          {estado.data?.contasDeTeste && (
            <span
              title={estado.data.contasDeTeste.ligadas ? "Entram com a senha de SENHA_CONTAS_TESTE" : (estado.data.contasDeTeste.motivo ?? undefined)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${estado.data.contasDeTeste.ligadas ? "bg-state-go-bg text-state-go" : "bg-sunken text-rvd-plum"}`}
            >
              Contas de teste: {estado.data.contasDeTeste.ligadas ? "ligadas" : `desligadas — ${estado.data.contasDeTeste.motivo}`}
            </span>
          )}
          {/* O envio desligado é silencioso por natureza: o agendamento
              funciona e ninguém é avisado. Dito aqui, não vira surpresa. */}
          {estado.data && (
            <span
              title={estado.data.avisoPorEmail ? "O fornecedor recebe o dia, a hora e o local ao ser agendado" : "Falta configurar o envio de e-mail — o agendamento funciona, mas o fornecedor não é avisado"}
              className={`rounded-full px-4 py-2 text-xs font-bold ${estado.data.avisoPorEmail ? "bg-state-go-bg text-state-go" : "bg-sunken text-rvd-plum"}`}
            >
              Aviso ao fornecedor por e-mail: {estado.data.avisoPorEmail ? "ligado" : "desligado"}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
