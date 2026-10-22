import { empresaDoCnpj, nomeDaEmpresa } from "@shared/empresas";
import { apenasDigitos, formatarCnpj, unidadePorCnpj } from "@shared/recipients";
import { AlertTriangle, Building2 } from "lucide-react";

/**
 * Para quem a carga vai: a empresa e a unidade que a nota diz.
 *
 * O fornecedor agenda para mais de um cliente pelo mesmo portal, e a única coisa
 * que separa uma entrega da outra é o destinatário dentro do XML — que ele não
 * lê. Sem isto, mandar a nota da LLT esperando que fosse da Amil só aparecia
 * quando a mesa errada a recebia.
 *
 * Um CNPJ que não é de cliente nenhum não é tratado como "mais uma": o aviso
 * diz que não reconhece, porque a nota cai na Amil por padrão e o fornecedor
 * precisa saber que talvez não seja ali que ela devia estar.
 *
 * `tom="capa"` é para os fundos roxos do portal do fornecedor.
 */
export default function DestinoDaNota({ cnpj, tom = "painel", className = "" }: { cnpj: string | null | undefined; tom?: "painel" | "capa"; className?: string }) {
  const digitos = apenasDigitos(cnpj);
  if (!digitos) return null;
  const naCapa = tom === "capa";
  const unidade = unidadePorCnpj(digitos);

  if (!unidade) {
    return (
      <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 ${naCapa ? "border-white/50 bg-state-stop text-white" : "border-state-stop/25 bg-state-stop-bg text-state-stop"} ${className}`}>
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="text-sm font-bold">Não reconhecemos o destinatário desta nota</p>
          <p className={`mt-0.5 text-xs leading-5 ${naCapa ? "text-white/90" : "text-ink-soft"}`}>
            O CNPJ {formatarCnpj(digitos)} não é de nenhum cliente que recebe por aqui. Confira o XML antes de enviar.
          </p>
        </div>
      </div>
    );
  }

  const empresa = nomeDaEmpresa(empresaDoCnpj(digitos));
  // A unidade só entra quando diz algo que o nome da empresa não diz: o
  // Hospital e a Maternidade são da Amil, e a LLT é uma unidade só.
  const detalhe = unidade.nome !== empresa ? `${unidade.sigla} — ${unidade.nome}` : null;
  return (
    <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${naCapa ? "border-white/45 bg-white/15 text-white" : "border-line bg-sunken text-ink"} ${className}`}>
      <Building2 className={`size-4 shrink-0 ${naCapa ? "text-on-brand" : "text-rvd-plum"}`} />
      <p className="text-sm">
        <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${naCapa ? "text-white/80" : "text-ink-faint"}`}>Entrega para </span>
        <strong className="font-bold">{empresa}</strong>
        {detalhe && <span className={naCapa ? "text-white/90" : "text-ink-soft"}> · {detalhe}</span>}
      </p>
    </div>
  );
}
