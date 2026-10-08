/**
 * O caminhão do portal, com a marca na lateral do baú.
 *
 * O desenho anterior era feito de quatro caixinhas de CSS empilhadas: um
 * retângulo com o logo dentro, outro menor do lado e dois círculos embaixo. De
 * longe parecia um caminhão; de perto, não parecia nada.
 *
 * Este é um só desenho, em vetor, com as proporções de um caminhão de entrega:
 * o baú alto atrás, a cabine mais baixa à frente, o chassi atravessando os
 * dois. O baú é branco com as letras na cor original — é assim que a marca
 * aparece num veículo de verdade, e é o único jeito de ela não virar uma
 * mancha quando o desenho fica pequeno.
 *
 * O contorno roxo do baú trabalha nos dois fundos: no claro é a linha que
 * fecha o desenho; no roxo é a folga que separa o baú branco da cabine branca,
 * que sem ela virariam uma massa só.
 */
export default function CaminhaoDaMarca({
  tom = "tinta",
  className = "",
}: {
  /** "branco" para os fundos roxos: cabine, chassi e rodas em branco. */
  tom?: "tinta" | "branco";
  className?: string;
}) {
  const noBranco = tom === "branco";
  const corpo = noBranco ? "#ffffff" : "#782078";
  const vidro = noBranco ? "#C9A8CC" : "#8FBED1";
  const miolo = noBranco ? "#782078" : "#ffffff";
  const chao = noBranco ? "rgba(255,255,255,0.4)" : "rgba(120,32,120,0.28)";

  return (
    <svg viewBox="0 0 210 116" className={className} role="img" aria-label="Caminhão da RVD">
      <path d="M6 106 H204" stroke={chao} strokeWidth="3.5" strokeLinecap="round" strokeDasharray="11 10" />
      {/* O baú: cantos redondos só na traseira, para encostar na cabine. */}
      <path
        d="M20 12 H118 V78 H20 a10 10 0 0 1 -10 -10 V22 a10 10 0 0 1 10 -10 z"
        fill="#ffffff"
        stroke="#782078"
        strokeWidth="2.5"
      />
      <image href="/RVD-letras.png" x="24" y="29" width="86" height="31" preserveAspectRatio="xMidYMid meet" />
      {/* A cabine, com o teto mais baixo que o baú. */}
      <path d="M118 78 V50 a8 8 0 0 1 8 -8 h18 a9 9 0 0 1 7 3.4 L166 58 a10 10 0 0 1 2 6 v14 z" fill={corpo} />
      <path d="M144 50 a2 2 0 0 1 1.6 .8 L155 58.6 a1.5 1.5 0 0 1 -1.2 2.4 H132 a2 2 0 0 1 -2 -2 V52 a2 2 0 0 1 2 -2 z" fill={vidro} />
      <path d="M16 80 H166 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 H16 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z" fill={corpo} />
      <rect x="164" y="70" width="6" height="7" rx="2" fill={vidro} />
      <circle cx="48" cy="92" r="13.5" fill={corpo} />
      <circle cx="48" cy="92" r="5.5" fill={miolo} />
      <circle cx="142" cy="92" r="13.5" fill={corpo} />
      <circle cx="142" cy="92" r="5.5" fill={miolo} />
    </svg>
  );
}
