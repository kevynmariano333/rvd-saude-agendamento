import { trpc } from "@/lib/trpc";
import {
  avisoDeHorarioOcupado,
  DIA_SEM_VAGA,
  temVaga,
  type HorarioDaAgenda,
} from "@shared/horariosDaAgenda";
import { Clock3, Lock } from "lucide-react";
import { useEffect } from "react";

/**
 * Os horários do dia, para escolher um.
 *
 * O campo de hora livre não dizia nada: o fornecedor digitava 10:00 sem ter
 * como saber que outro caminhão já estava marcado para as 10:00. Dois chegavam
 * juntos e a portaria descobria o choque com a carga no pátio.
 *
 * Aqui a agenda aparece inteira. O que está tomado por outro fornecedor vem
 * marcado, e para o fornecedor nem clica — ele não tem como resolver um
 * conflito que não enxerga. Para a mesa clica, com uma pergunta antes: às
 * vezes dois no mesmo horário é o que a operação quer, e quem decide isso
 * precisa estar vendo o que está fazendo.
 */
export default function SeletorDeHorario({
  data,
  valor,
  onEscolher,
  appointmentId,
  podeOcupar = false,
  somenteLeitura = false,
  tom = "painel",
  className = "",
}: {
  /** O dia escolhido, "2026-11-05". Sem ele não há agenda que consultar. */
  data: string;
  valor: string;
  onEscolher: (hora: string) => void;
  /** A nota que vai receber a data, para a agenda do fornecedor dela valer. */
  appointmentId?: number;
  /** A mesa pode marcar por cima de outro fornecedor; o fornecedor, não. */
  podeOcupar?: boolean;
  somenteLeitura?: boolean;
  /** "capa" para os fundos roxos do portal do fornecedor. */
  tom?: "painel" | "capa";
  className?: string;
}) {
  const naCapa = tom === "capa";
  const agenda = trpc.appointments.horariosDoDia.useQuery(
    { data, appointmentId },
    { enabled: Boolean(data) },
  );

  // Trocar de dia pode tornar inválida a hora já escolhida: 10:00 estava livre
  // na terça e está tomada na quarta. Sem isto a pílula continua pintada como
  // escolhida, a pessoa confirma, e só então o servidor recusa — com a culpa
  // parecendo dela. Quem pode marcar por cima mantém a escolha: para a mesa
  // não é erro, é decisão.
  const escolhidoAgora = agenda.data?.find(horario => horario.hora === valor);
  const perdeuAVaga = Boolean(valor) && !podeOcupar && escolhidoAgora?.situacao === "ocupado";
  useEffect(() => {
    if (perdeuAVaga) onEscolher("");
  }, [perdeuAVaga, onEscolher]);

  if (!data) {
    return (
      <p className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${naCapa ? "bg-white/10 text-white/85" : "bg-sunken text-ink-soft"} ${className}`}>
        Escolha a data para ver os horários livres.
      </p>
    );
  }

  if (agenda.isLoading) {
    return (
      <p className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${naCapa ? "bg-white/10 text-white/85" : "bg-sunken text-ink-soft"} ${className}`}>
        Consultando a agenda do dia...
      </p>
    );
  }

  const horarios = agenda.data ?? [];
  if (!horarios.length) {
    return (
      <p className={`rounded-xl bg-state-stop-bg px-3 py-2.5 text-xs font-bold text-state-stop ${className}`}>
        Não foi possível ler a agenda deste dia. Tente de novo.
      </p>
    );
  }

  // O dia cheio é o caso que o campo livre nunca contou: sem isto, a pessoa
  // tenta horário por horário até desistir.
  const lotado = !temVaga(horarios) && !podeOcupar;

  function escolher(horario: HorarioDaAgenda) {
    if (somenteLeitura) return;
    if (horario.situacao !== "ocupado") return onEscolher(horario.hora);
    if (!podeOcupar) return;
    // A pergunta é o pedido do balcão: marcar em cima de outro fornecedor
    // pode, desde que ninguém faça isso sem perceber.
    if (window.confirm(avisoDeHorarioOcupado(horario))) onEscolher(horario.hora);
  }

  return (
    <div className={className}>
      {lotado && (
        <p className={`mb-2 rounded-xl px-3 py-2.5 text-xs font-bold leading-5 ${naCapa ? "bg-state-stop text-white" : "bg-state-stop-bg text-state-stop"}`}>
          {DIA_SEM_VAGA}
        </p>
      )}
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {horarios.map(horario => {
          const escolhido = horario.hora === valor;
          const bloqueado = horario.situacao === "ocupado" && !podeOcupar;
          const titulo = horario.situacao === "ocupado"
            ? horario.fornecedores.length
              ? `Ocupado — ${horario.fornecedores.join(", ")}`
              : "Ocupado por outro fornecedor"
            : horario.situacao === "proprio"
              ? "Você já tem entrega marcada neste horário — a carga vai junto"
              : "Horário livre";
          return (
            <button
              key={horario.hora}
              type="button"
              title={titulo}
              disabled={bloqueado || somenteLeitura}
              onClick={() => escolher(horario)}
              className={`relative rounded-xl border px-2 py-2 text-[13px] font-bold tabular-nums transition ${
                escolhido
                  ? naCapa
                    ? "border-white bg-rvd-blue text-rvd-plum"
                    : "border-rvd-plum bg-brand text-white"
                  : horario.situacao === "ocupado"
                    ? naCapa
                      ? "border-white/25 bg-white/10 text-white/60 line-through"
                      : "border-state-stop/30 bg-state-stop-bg text-state-stop line-through"
                    : horario.situacao === "proprio"
                      ? "border-rvd-blue bg-rvd-blue-pale text-rvd-plum"
                      : naCapa
                        ? "border-white/40 bg-surface text-rvd-plum hover:bg-rvd-blue-pale"
                        : "border-line bg-surface text-rvd-plum hover:bg-rvd-plum-pale"
              } ${bloqueado ? "cursor-not-allowed" : ""}`}
            >
              {horario.hora}
              {horario.situacao === "ocupado" && !escolhido && (
                <Lock aria-hidden className="absolute right-1 top-1 size-2.5" />
              )}
            </button>
          );
        })}
      </div>
      <p className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold ${naCapa ? "text-white/85" : "text-ink-soft"}`}>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3" />
          Das {horarios[0]?.hora} às {horarios[horarios.length - 1]?.hora}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded border ${naCapa ? "border-white/30 bg-white/15" : "border-state-stop/40 bg-state-stop-bg"}`} />
          Indisponível
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded border border-rvd-blue bg-rvd-blue-pale" />
          Sua entrega
        </span>
      </p>
    </div>
  );
}
