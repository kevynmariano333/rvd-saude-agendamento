import { inicialDaConta, marcaDoEmail, MARCAS_DA_CONTA } from "@shared/marcaDaConta";
import { useId } from "react";

/**
 * O quanto a letra engrossa.
 *
 * O peso 800 é o mais pesado que a fonte tem, e ainda é mais fino que as
 * letras do logo, que são desenhadas e não digitadas. O traço por cima do
 * próprio contorno fecha essa diferença.
 */
const ENGROSSAR = 2.2;

/** O azul do logo, que corta as letras na diagonal. */
const AZUL_DA_MARCA = "#8FBED1";

/**
 * O que aparece no lugar do retrato de cada conta.
 *
 * A inicial de quem usa, desenhada como as letras do logo: cheia, pesada, e
 * cortada na diagonal pelo azul da marca — é o que o R e o D do RVD fazem. Uma
 * letra qualquer dentro de um quadradinho colorido seria o avatar de qualquer
 * sistema; esta pertence a este.
 *
 * O logo da RVD em toda linha não distinguia ninguém, porque todo mundo de
 * dentro é da RVD. A inicial distingue: o K do Kevyn, o B da Brenna.
 *
 * A exceção é a Amil, que fica com o logo dela. Ali a marca carrega a
 * informação que de fato muda de linha para linha — essa conta é de fora da
 * casa, é de quem planeja —, e trocá-la por um "L" perderia isso.
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
  // Um corte por instância: dois avatares na mesma tela não podem dividir o
  // mesmo recorte, ou o segundo herda o do primeiro.
  const corte = useId().replace(/:/g, "");

  if (marcaDoEmail(email) === "amil") {
    const dados = MARCAS_DA_CONTA.amil;
    return (
      <span title={dados.nome} className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ${className}`}>
        <img src={dados.logo} alt={dados.nome} className="size-full object-contain p-1" />
      </span>
    );
  }

  const letra = inicialDaConta(nome, email);
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label={letra} className={`shrink-0 text-rvd-plum ${className}`}>
      <defs>
        {/* A diagonal que sobe da base, como a que corta o R do logo. */}
        <clipPath id={corte}>
          <polygon points="0,40 40,40 0,9" />
        </clipPath>
      </defs>
      <text
        x="20"
        y="33"
        textAnchor="middle"
        fill="currentColor"
        className="font-display"
        fontSize="38"
        fontWeight="800"
        letterSpacing="-1"
        stroke="currentColor"
        strokeWidth={ENGROSSAR}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {letra}
      </text>
      <text
        x="20"
        y="33"
        textAnchor="middle"
        fill={AZUL_DA_MARCA}
        clipPath={`url(#${corte})`}
        className="font-display"
        fontSize="38"
        fontWeight="800"
        letterSpacing="-1"
        stroke={AZUL_DA_MARCA}
        strokeWidth={ENGROSSAR}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {letra}
      </text>
    </svg>
  );
}
