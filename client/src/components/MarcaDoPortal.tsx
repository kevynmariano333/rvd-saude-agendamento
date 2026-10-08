import { MARCA } from "@shared/marca";

/**
 * A marca do portal: as letras do RVD, e o nome do sistema continuando nelas.
 *
 * O cabeçalho mostrava duas coisas soltas — o logo da empresa de um lado, o
 * nome "RVDlog+" escrito do outro — e ninguém lia aquilo como uma marca só. O
 * RVD do logo e o RVD do nome são as mesmas três letras: aqui elas são as
 * mesmas na tela também, com "log+" continuando a palavra.
 *
 * As letras vêm recortadas da arte original da RVD Saúde, e não redesenhadas.
 * Letra redesenhada "quase igual" é o jeito mais rápido de descaracterizar uma
 * marca.
 */
export default function MarcaDoPortal({
  altura = "h-7",
  tom = "tinta",
  className = "",
  comDescricao = false,
}: {
  /** A altura das letras, em classe do Tailwind. O resto se ajusta a ela. */
  altura?: string;
  /** "branco" para os fundos roxos da entrada e da capa. */
  tom?: "tinta" | "branco";
  className?: string;
  comDescricao?: boolean;
}) {
  const noBranco = tom === "branco";
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className="inline-flex items-baseline gap-[0.08em]" aria-label={MARCA.nome}>
        <img
          src={noBranco ? "/RVD-letras-branco.png" : "/RVD-letras.png"}
          alt=""
          aria-hidden
          className={`${altura} w-auto translate-y-[0.06em] object-contain`}
        />
        {/* O "log+" na mesma tinta das letras: o azul da marca já está no V, e
            o token azul do sistema vira cor de fundo no tema escuro — um sinal
            azul sumiria lá. O "+" fica menor e levantado, como se escreve. */}
        <span className={`font-display text-[1.5em] font-extrabold leading-none tracking-[-0.03em] ${noBranco ? "text-white" : "text-rvd-plum"}`}>
          log<span className="align-super text-[0.62em]">+</span>
        </span>
      </span>
      {comDescricao && (
        <span className={`mt-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] ${noBranco ? "text-on-brand-soft" : "text-ink-faint"}`}>
          {MARCA.descricao}
        </span>
      )}
    </span>
  );
}
