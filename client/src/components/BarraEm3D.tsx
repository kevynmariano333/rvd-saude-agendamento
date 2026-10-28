import type { CSSProperties } from "react";

/** A cor que vale quando a série não traz uma cor própria. */
const COR_PADRAO = "#782078";

/** Quanto a barra "sai" para trás, em pixels: é isso que dá a cara de 3D. */
export const PROFUNDIDADE_3D = 7;

type Rgb = [number, number, number];

function hexParaRgb(cor: string): Rgb | null {
  const casou = /^#([0-9a-f]{6})$/i.exec(cor);
  if (!casou) return null;
  const numero = parseInt(casou[1], 16);
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255];
}

/** Puxa a cor na direção de `alvo` (255 para o claro, 0 para o escuro), em `peso`. */
function misturar([r, g, b]: Rgb, alvo: number, peso: number): string {
  const canal = (valor: number) => Math.round(valor + (alvo - valor) * peso).toString(16).padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/** Os três tons de uma barra: a frente (a cor da série), a tampa e a lateral. */
function tonsDaCor(cor: string) {
  const rgb = hexParaRgb(cor) ?? hexParaRgb(COR_PADRAO) ?? [120, 32, 120];
  return { frente: cor, topo: misturar(rgb, 255, 0.25), lateral: misturar(rgb, 0, 0.25) };
}

/**
 * Uma barra com volume, para o gráfico de colunas: a face da frente na cor da
 * série, a tampa de cima mais clara e a lateral mais escura, saindo para trás.
 *
 * O Recharts não desenha 3D de verdade. Esta forma imita: a face é a barra, e
 * os polígonos de cima e do lado dão a profundidade.
 */
export function BarraEm3D(entrada: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, fill } = entrada as { x?: number; y?: number; width?: number; height?: number; fill?: string };
  if (!width || !height || height <= 0) return null;
  const tom = tonsDaCor(typeof fill === "string" ? fill : COR_PADRAO);
  const d = PROFUNDIDADE_3D;
  return (
    <g>
      <polygon points={`${x},${y} ${x + d},${y - d} ${x + width + d},${y - d} ${x + width},${y}`} fill={tom.topo} />
      <polygon points={`${x + width},${y} ${x + width + d},${y - d} ${x + width + d},${y + height - d} ${x + width},${y + height}`} fill={tom.lateral} />
      <rect x={x} y={y} width={width} height={height} fill={tom.frente} />
    </g>
  );
}

/**
 * O mesmo volume para uma barra horizontal, em HTML: o topo mais claro, a base
 * escura e uma sombra embaixo.
 */
export function barraEm3DStyle(cor: string): CSSProperties {
  return {
    background: `linear-gradient(180deg, ${cor}ff 0%, ${cor}cc 55%, ${cor}99 100%)`,
    boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.35), 0 3px 4px rgba(0,0,0,0.35)",
  };
}
