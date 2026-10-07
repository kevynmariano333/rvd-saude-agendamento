// A nota que quem usa o portal dá para ele.
//
// A caixa de sugestões recebe texto, e texto só chega de quem está incomodado
// o bastante para escrever. Isso dá uma lista de problemas e nenhuma noção de
// como está o conjunto: trinta reclamações num mês podem ser trinta pessoas
// infelizes ou as mesmas três insistindo enquanto as outras duzentas vão bem.
//
// A nota custa um clique e responde essa parte. As duas juntas servem: a nota
// diz se melhorou, o texto diz o que arrumar.

export const NOTA_MINIMA = 1;
export const NOTA_MAXIMA = 5;

export type ResumoDasNotas = {
  /** Quantos deram nota. Quem só escreveu não entra na média. */
  total: number;
  /** A média, com uma casa. Null quando ninguém deu nota ainda. */
  media: number | null;
  /** Quantas vezes cada nota foi dada, de 1 a 5. */
  porNota: Record<number, number>;
};

export function ehNotaValida(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= NOTA_MINIMA && valor <= NOTA_MAXIMA;
}

/**
 * Como a nota se chama na tela.
 *
 * O número sozinho não diz o que fazer com ele: "3" é bom ou ruim? A palavra
 * ao lado é o que faz quem lê entender sem combinar nada antes.
 */
export function rotuloDaNota(nota: number): string {
  switch (nota) {
    case 1: return "Ruim";
    case 2: return "Fraco";
    case 3: return "Dá para usar";
    case 4: return "Bom";
    default: return "Ótimo";
  }
}

/**
 * A média e a distribuição das notas.
 *
 * A distribuição vai junto porque a média esconde o que importa: 3,0 pode ser
 * todo mundo achando mediano, ou metade achando ótimo e metade achando
 * péssimo — e as duas situações pedem coisas diferentes.
 */
export function resumoDasNotas(notas: (number | null | undefined)[]): ResumoDasNotas {
  const validas = notas.filter(ehNotaValida);
  const porNota: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const nota of validas) porNota[nota] = (porNota[nota] ?? 0) + 1;
  if (!validas.length) return { total: 0, media: null, porNota };
  const soma = validas.reduce((total, nota) => total + nota, 0);
  return { total: validas.length, media: Math.round((soma / validas.length) * 10) / 10, porNota };
}

/**
 * O recado tem alguma coisa dentro?
 *
 * Uma nota sozinha já é um recado — é o clique de quem não ia escrever nada. O
 * que não pode entrar é o vazio: sem nota e sem texto, não há o que ler.
 */
export function temConteudo(entrada: { nota?: number | null; mensagem?: string | null }): boolean {
  return ehNotaValida(entrada.nota) || (entrada.mensagem ?? "").trim().length >= 5;
}
