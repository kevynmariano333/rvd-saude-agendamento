import { corDaConta, inicialDaConta, marcaDoEmail, MARCAS_DA_CONTA } from "@shared/marcaDaConta";

/**
 * O que aparece no lugar do retrato de cada conta.
 *
 * A letra de quem usa, e não o logo da RVD. O logo em toda linha não distingue
 * ninguém — todo mundo de dentro é da RVD —, enquanto a inicial é o que o olho
 * procura numa lista de contas: o K do Kevyn, o B da Brenna.
 *
 * A exceção é a Amil, que fica com o logo dela. Aí a marca carrega a
 * informação que de fato muda de linha para linha: essa conta é de fora da
 * casa, é de quem planeja. Trocá-la por um "L" perderia isso.
 */
export default function AvatarDaConta({
  email,
  nome,
  className = "size-8",
}: {
  email: string | null | undefined;
  /** O nome de quem usa a conta — ou a razão social, para o fornecedor. */
  nome?: string | null;
  className?: string;
}) {
  const marca = marcaDoEmail(email);

  if (marca === "amil") {
    const dados = MARCAS_DA_CONTA.amil;
    return (
      <span title={dados.nome} className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ${className}`}>
        <img src={dados.logo} alt={dados.nome} className="size-full object-contain p-1" />
      </span>
    );
  }

  // As duas cores do logo, sorteadas pelo que identifica a conta: a mesma
  // pessoa fica sempre com a mesma, em qualquer tela.
  const cor = corDaConta(email || nome);
  return (
    <span
      aria-hidden
      style={{ backgroundColor: cor.fundo, color: cor.letra }}
      className={`flex shrink-0 items-center justify-center rounded-lg font-display font-extrabold leading-none ${className}`}
    >
      {inicialDaConta(nome, email)}
    </span>
  );
}
