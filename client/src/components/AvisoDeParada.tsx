import { avisoDaParada, paradasQueVemAi, type ParadaDoEstoque } from "@shared/paradaDoEstoque";
import { CalendarOff } from "lucide-react";

/**
 * O aviso de que um estoque vai parar de receber.
 *
 * Inventário é o caso: o estoque fecha para contar o que tem, e o caminhão que
 * chega no dia volta carregado. Isso vivia no WhatsApp de quem sabia, e o
 * fornecedor descobria na portaria — com a viagem já paga.
 *
 * Fica junto do formulário de agendamento, que é onde a data é escolhida.
 * Avisar na lista de notas seria avisar depois.
 *
 * Some sozinho quando o último dia passa: aviso vencido na tela ensina a
 * ignorar os avisos.
 */
export default function AvisoDeParada({
  paradas,
  tom = "painel",
  className = "",
}: {
  /** Quais mostrar. Sem isto, todas as que ainda estão por vir. */
  paradas?: ParadaDoEstoque[];
  /** "capa" para os fundos roxos do portal do fornecedor. */
  tom?: "painel" | "capa";
  className?: string;
}) {
  const lista = paradas ?? paradasQueVemAi();
  if (!lista.length) return null;

  const naCapa = tom === "capa";
  return (
    <div
      className={`rounded-2xl border p-5 ${naCapa ? "border-white/45 bg-white/15" : "border-state-stop/25 bg-state-stop-bg"} ${className}`}
    >
      <div className="flex gap-3">
        <CalendarOff className={`mt-0.5 size-5 shrink-0 ${naCapa ? "text-on-brand" : "text-state-stop"}`} />
        <div>
          <p className={`text-sm font-bold ${naCapa ? "text-white" : "text-state-stop"}`}>
            {lista.length > 1 ? "Dias sem recebimento em breve" : "Não teremos recebimento nesses dias"}
          </p>
          {lista.map(parada => (
            <p key={`${parada.cnpj}-${parada.dias[0]}`} className={`mt-1 text-xs leading-5 ${naCapa ? "text-white/90" : "text-ink-soft"}`}>
              {avisoDaParada(parada)}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
