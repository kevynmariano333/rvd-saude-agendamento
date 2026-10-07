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
