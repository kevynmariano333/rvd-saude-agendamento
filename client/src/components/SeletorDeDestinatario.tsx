import { Label } from "@/components/ui/label";
import { useEmpresaDoUsuario } from "@/lib/empresaDoUsuario";
import { DESTINATARIO_TODOS, gruposDeUnidades, valorDaUnidade, valorDoGrupo } from "@shared/recipients";

/**
 * O filtro de destinatário: escolhe o grupo inteiro ou uma unidade dele.
 *
 * Antes era um campo de texto e a pessoa precisava saber de cor a sigla ou o
 * CNPJ. Como as unidades são uma lista fechada e cada uma pertence a um
 * cliente, a escolha vira uma lista: o grupo no topo, as unidades recuadas
 * embaixo dele.
 */
export default function SeletorDeDestinatario({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  // Quem atende uma empresa só escolhe entre as unidades dela. O servidor corta
  // de qualquer jeito; aqui a tela só não oferece o que não é da pessoa.
  const { empresas } = useEmpresaDoUsuario();
  const grupos = gruposDeUnidades()
    .map(grupo => ({ ...grupo, unidades: grupo.unidades.filter(unidade => !empresas || empresas.includes(unidade.empresa)) }))
    .filter(grupo => grupo.unidades.length);
  return (
    <div className={className}>
      <Label className="text-[10px] font-bold uppercase tracking-wide text-rvd-plum">Destinatário</Label>
      <select
        value={value || DESTINATARIO_TODOS}
        onChange={event => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-rvd-plum focus:outline-none focus:ring-2 focus:ring-rvd-blue"
      >
        <option value={DESTINATARIO_TODOS}>{empresas ? "Todas as unidades" : "Todos os destinatários"}</option>
        {grupos.map(({ grupo, unidades }) => (
          <optgroup key={grupo} label={`Grupo ${grupo}`}>
            {unidades.length > 1 && <option value={valorDoGrupo(grupo)}>Grupo {grupo} — todas as unidades</option>}
            {unidades.map(unidade => (
              <option key={unidade.cnpj} value={valorDaUnidade(unidade.cnpj)}>
                {`  ${unidade.sigla} — ${unidade.nome}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
