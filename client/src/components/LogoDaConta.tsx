import { marcaDoEmail, MARCAS_DA_CONTA } from "@shared/marcaDaConta";

/**
 * O logo da empresa de quem está usando a conta.
 *
 * O portal é usado por gente de duas casas: a RVD, que opera o recebimento, e a
 * Amil, de quem vem o planejamento. As duas apareciam como o mesmo boneco
 * cinza, e saber quem era de qual lado exigia ler o e-mail letra por letra.
 *
 * Quem não é de nenhuma das duas — o fornecedor — não ganha logo nenhum: a
 * marca é um fato sobre a conta, não um enfeite, e inventar uma para quem não
 * tem seria pior do que não mostrar.
 *
 * Devolve null quando não há marca, para quem chama decidir o que pôr no lugar.
 */
export default function LogoDaConta({ email, className = "size-8" }: { email: string | null | undefined; className?: string }) {
  const marca = marcaDoEmail(email);
  if (!marca) return null;
  const dados = MARCAS_DA_CONTA[marca];
  return (
    <span
      title={dados.nome}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${dados.fundoClaro ? "bg-white" : "bg-rvd-plum-pale/60"} ${className}`}
    >
      <img src={dados.logo} alt={dados.nome} className="size-full object-contain p-1" />
    </span>
  );
}
