// Quem está no sistema agora, e em que pé.
//
// A pergunta aparece o dia inteiro: dá para pedir ao planejamento agora, ou a
// pessoa não está? O WhatsApp responde isso hoje, e mal — "oi, tá aí?" seguido
// de vinte minutos de silêncio é o custo de não ter esta linha na tela.
//
// São duas coisas somadas, e nenhuma das duas sozinha serve. O automático sabe
// se a pessoa está no sistema, mas não sabe que ela está na doca resolvendo
// outra coisa. O manual sabe disso, mas apodrece: quem marca "ocupado" na
// terça esquece de voltar, e na sexta o rótulo mente. Então o que a pessoa
// escolhe só vale enquanto ela estiver de fato ali; parou de usar, o sistema
// diz a verdade simples — quando foi vista pela última vez.

export const SITUACOES = ["disponivel", "ocupado", "ausente"] as const;
export type Situacao = (typeof SITUACOES)[number];
export const SITUACAO_PADRAO: Situacao = "disponivel";

export function ehSituacao(valor: unknown): valor is Situacao {
  return typeof valor === "string" && (SITUACOES as readonly string[]).includes(valor);
}

/**
 * Quanto tempo sem dar sinal até a conta deixar de contar como presente.
 *
 * Cinco minutos: tempo de atender um telefonema ou ir até a doca sem a tela
 * apagar a pessoa, e curto o bastante para "disponível" não sobreviver ao fim
 * do expediente.
 */
export const JANELA_DE_PRESENCA_MS = 5 * 60 * 1000;

/** De quanto em quanto tempo o sinal de "ainda estou aqui" é gravado. */
export const INTERVALO_DO_SINAL_MS = 2 * 60 * 1000;

export type EstadoDaPresenca = Situacao | "desconectado";

export const ROTULO_DA_SITUACAO: Record<Situacao, { rotulo: string; explica: string }> = {
  disponivel: { rotulo: "Disponível", explica: "Pode chamar." },
  ocupado: { rotulo: "Ocupado", explica: "Está no sistema, mas no meio de outra coisa." },
  ausente: { rotulo: "Ausente", explica: "Saiu, volta depois." },
};

export type Presenca = {
  estado: EstadoDaPresenca;
  rotulo: string;
  /** A linha de baixo: "ativo agora", "visto há 12 min", "nunca entrou". */
  detalhe: string;
  presente: boolean;
};

function paraData(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Há quanto tempo, escrito como alguém falaria.
 *
 * "Visto às 14:32" obriga quem lê a fazer a conta; "visto há 12 minutos" já é
 * a resposta. Passado o dia, a hora volta a ser o que importa — "há 19 horas"
 * não diz se foi ontem à tarde ou hoje de madrugada.
 */
export function quandoFoiVisto(vistoEm: Date | string | null | undefined, agora: Date = new Date()): string {
  const visto = paraData(vistoEm);
  if (!visto) return "nunca entrou";

  const minutos = Math.floor((agora.getTime() - visto.getTime()) / 60_000);
  if (minutos < 1) return "visto agora há pouco";
  if (minutos < 60) return `visto há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 12) return `visto há ${horas} h`;

  const hora = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(visto);
  const mesmoDia = visto.toDateString() === agora.toDateString();
  if (mesmoDia) return `visto às ${hora}`;

  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  if (visto.toDateString() === ontem.toDateString()) return `visto ontem, ${hora}`;

  return `visto em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(visto)}`;
}

/**
 * Em que pé está uma conta.
 *
 * O que a pessoa escolheu só vale enquanto ela estiver de fato no sistema.
 * Fora da janela, o rótulo escolhido não aparece — alguém que marcou "ocupado"
 * e foi embora às seis não pode continuar "ocupado" às onze da noite, porque
 * aí ninguém mais acredita em nenhum dos rótulos.
 */
export function presencaDe(
  entrada: { situacao?: string | null; vistoEm?: Date | string | null; saiuEm?: Date | string | null },
  agora: Date = new Date(),
): Presenca {
  const visto = paraData(entrada.vistoEm);
  const saiu = paraData(entrada.saiuEm);
  // Quem encerrou a sessão sai da lista na hora, e não ao fim da janela: a
  // tela não pode dizer que dá para chamar alguém que já fechou o navegador.
  const jaSaiu = Boolean(saiu && visto && saiu.getTime() >= visto.getTime());
  const presente = Boolean(visto && !jaSaiu && agora.getTime() - visto.getTime() <= JANELA_DE_PRESENCA_MS);

  if (!presente) {
    return { estado: "desconectado", rotulo: "Desconectado", detalhe: quandoFoiVisto(visto, agora), presente: false };
  }

  const situacao = ehSituacao(entrada.situacao) ? entrada.situacao : SITUACAO_PADRAO;
  return {
    estado: situacao,
    rotulo: ROTULO_DA_SITUACAO[situacao].rotulo,
    detalhe: situacao === "disponivel" ? "no sistema agora" : ROTULO_DA_SITUACAO[situacao].explica,
    presente: true,
  };
}

/**
 * Está na hora de gravar outro sinal?
 *
 * O sinal é uma escrita no banco a cada requisição, e requisição tem muitas.
 * Gravar de dois em dois minutos dá a mesma resposta na tela e troca milhares
 * de escritas por algumas dezenas.
 */
export function precisaGravarSinal(ultimo: Date | string | null | undefined, agora: Date = new Date()): boolean {
  const anterior = paraData(ultimo);
  if (!anterior) return true;
  return agora.getTime() - anterior.getTime() >= INTERVALO_DO_SINAL_MS;
}
