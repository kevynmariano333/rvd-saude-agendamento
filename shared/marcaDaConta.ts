// De qual empresa é cada conta.
//
// O portal é usado por gente de duas casas: a RVD, que opera o recebimento, e a
// Amil, de quem vem o planejamento. Na lista de acessos e no topo da tela as
// duas apareciam iguais — um boneco cinza —, e quem é de qual lado era coisa
// que se descobria lendo o e-mail letra por letra.
//
// O domínio do e-mail já responde isso, e responde sozinho: ninguém precisa
// marcar nada, e conta nova entra com a marca certa no dia em que é criada.

export type MarcaDaConta = "rvd" | "amil";

export type DadosDaMarca = {
  nome: string;
  /** O arquivo em /public, servido na raiz. */
  logo: string;
  /** O logo precisa de fundo claro para ter contraste nos dois temas? */
  fundoClaro: boolean;
};

export const MARCAS_DA_CONTA: Record<MarcaDaConta, DadosDaMarca> = {
  rvd: { nome: "RVD Saúde", logo: "/RVD-Saude.png", fundoClaro: false },
  // O "amil" é azul sobre branco; em tema escuro, sem a plaquinha branca ele
  // encosta no fundo e some.
  amil: { nome: "Amil", logo: "/Amil.png", fundoClaro: true },
};

/**
 * A empresa de uma conta, pelo domínio do e-mail.
 *
 * Só o domínio: "rvd" dentro do nome de alguém não faz dele da RVD, e o
 * fornecedor que se chama "Amil Distribuidora" não é a Amil. Por isso a
 * comparação começa depois do @, e exige o domínio inteiro.
 */
export function marcaDoEmail(email: string | null | undefined): MarcaDaConta | null {
  const endereco = (email ?? "").trim().toLowerCase();
  const arroba = endereco.lastIndexOf("@");
  if (arroba < 0) return null;
  const dominio = endereco.slice(arroba + 1);
  if (!dominio) return null;

  const ehDe = (base: string) => dominio === base || dominio.endsWith(`.${base}`);
  if (ehDe("rvdsaude.com.br") || ehDe("rvdsaude.local")) return "rvd";
  if (ehDe("amil.com.br")) return "amil";
  return null;
}

/**
 * A letra que representa a conta no lugar do retrato.
 *
 * O logo da RVD em toda linha não distingue ninguém: todo mundo de dentro é da
 * RVD. A inicial de quem usa a conta distingue — e é o que se procura numa
 * lista de contas. O logo fica reservado para quem é de fora da casa, que é a
 * informação que de fato muda de linha para linha.
 */
export function inicialDaConta(...candidatos: (string | null | undefined)[]): string {
  for (const candidato of candidatos) {
    const limpo = (candidato ?? "").trim();
    if (!limpo) continue;
    // A primeira letra de verdade: "3M Brasil" começa com um número, e um
    // avatar com "3" não ajuda ninguém a reconhecer a conta.
    const letra = limpo.split("").find(caractere => /[a-zà-ÿ]/i.test(caractere));
    if (letra) return letra.toLocaleUpperCase("pt-BR");
  }
  return "?";
}

/**
 * As duas cores da marca, para o retrato da conta.
 *
 * São as mesmas do logo: o roxo e o azul do RVD. Alternar entre elas dá à
 * lista a variação que faz o olho distinguir uma linha da outra sem ler, e
 * mantém a tela dentro da marca — um arco-íris de avatares faria o portal
 * parecer outra coisa.
 *
 * Os valores vão fixos, e não pelos tokens do tema: a plaquinha leva o próprio
 * fundo, então ela precisa ter contraste por conta própria no claro e no
 * escuro.
 */
export const CORES_DA_CONTA = [
  { fundo: "#782078", letra: "#FFFFFF" },
  { fundo: "#8FBED1", letra: "#5E1A61" },
] as const;

/**
 * Qual das duas cores cabe a esta conta.
 *
 * Sorteada a partir do que identifica a conta, e não da posição na lista: a
 * mesma pessoa tem sempre a mesma cor, em qualquer tela e depois de qualquer
 * reordenação. Cor que muda de lugar para lugar não ajuda a reconhecer
 * ninguém.
 */
export function corDaConta(chave: string | null | undefined): (typeof CORES_DA_CONTA)[number] {
  const texto = (chave ?? "").trim().toLowerCase();
  let soma = 0;
  for (let i = 0; i < texto.length; i += 1) soma = (soma + texto.charCodeAt(i) * (i + 1)) % 1000;
  return CORES_DA_CONTA[soma % CORES_DA_CONTA.length]!;
}
