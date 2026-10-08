/** O azul da marca, em componentes, para entrar com opacidade. */
const AZUL = "143, 190, 209";

/**
 * Onde o corte atravessa a capa.
 *
 * A mesma diagonal passa longe do texto numa capa larga e no meio da frase
 * numa capa alta — é a forma do quadro que decide, e não a tela. Por isso são
 * duas medidas, e não uma com ajuste fino.
 */
const CORTES = {
  alto: { altura: "62%", base: "-18%", giro: 9 },
  baixo: { altura: "34%", base: "-20%", giro: 9 },
  // A porta da frente no celular: uma faixa curta de texto, sem folga nenhuma
  // entre a última linha e o fim da capa. O corte passa rente à base e quase
  // deitado — com a inclinação dos outros, ele subiria dentro do parágrafo
  // antes de chegar à margem direita.
  rasante: { altura: "26%", base: "-20%", giro: 4 },
} as const;

function Diagonal({ altura, base, giro, className = "" }: { altura: string; base: string; giro: number; className?: string }) {
  return (
    <div
      className={`absolute -left-[15%] origin-bottom-left ${className}`}
      style={{
        bottom: base,
        height: altura,
        width: "135%",
        transform: `rotate(-${giro}deg)`,
        borderTop: `2px solid rgba(${AZUL},0.55)`,
        background: `linear-gradient(90deg, rgba(${AZUL},0.24) 0%, rgba(${AZUL},0.06) 68%, rgba(${AZUL},0) 100%)`,
      }}
    />
  );
}

/**
 * O fundo das duas capas do portal: a porta da frente e a tela de entrada.
 *
 * Antes era um roxo chapado com duas bolas claras por cima — o arranjo que
 * qualquer gerador de página entrega, e que de fato apareceu igual em outro
 * lugar. Chapado, o roxo também puxava para o cinza: sem variação de tom, o
 * olho lê a cor como suja em vez de profunda.
 *
 * Aqui o roxo tem corpo, com o tom descendo para os cantos, e o azul da marca
 * entra como luz, e não como área: em área, o azul claro apagaria o texto
 * branco que vive em cima dele. São dois focos — um alto, que abre a capa, e
 * um rente à base, onde o caminhão anda.
 *
 * O que faz a capa ser desta casa é o corte: a mesma diagonal que atravessa o
 * R e o D do logo, subindo da base. Ela já é o gesto da marca nas iniciais das
 * contas e no recorte das letras — é a forma mais difícil de alguém copiar sem
 * copiar o logo junto.
 */
export default function FundoDaCapa({ corte = "baixo" }: { corte?: "baixo" | "altoQuandoLarga" }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "linear-gradient(152deg, #5E1A61 0%, #782078 44%, #3B1046 100%)" }} />
      <div className="absolute inset-0" style={{ background: `radial-gradient(135% 105% at 100% -12%, rgba(${AZUL},0.55) 0%, rgba(${AZUL},0.14) 38%, rgba(${AZUL},0) 66%)` }} />
      <div className="absolute inset-0" style={{ background: `radial-gradient(80% 58% at 88% 108%, rgba(${AZUL},0.34) 0%, rgba(${AZUL},0) 62%)` }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(85% 65% at -12% 112%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 60%)" }} />
      {/* No celular, a capa da porta da frente vira uma faixa estreita: o
          corte alto atravessava o título, e dá lugar ao rasante até a capa
          abrir. */}
      {corte === "altoQuandoLarga" ? (
        <>
          <Diagonal {...CORTES.rasante} className="lg:hidden" />
          <Diagonal {...CORTES.alto} className="hidden lg:block" />
        </>
      ) : (
        <Diagonal {...CORTES.baixo} />
      )}
    </div>
  );
}
