// Os horários que o estoque tem para receber, e quem já está em cada um.
//
// Antes a hora era um campo livre: o fornecedor digitava 10:00 sem ter como
// saber que outro caminhão já estava marcado para as 10:00. Dois chegavam
// juntos, um esperava na rua, e a portaria descobria o choque com a carga no
// pátio. A agenda sabia do conflito desde o começo e não contava para ninguém.
//
// A lista é fechada porque a doca é uma só: um fornecedor por horário. O mesmo
// fornecedor pode juntar quantas notas quiser na mesma hora — é um caminhão só,
// e separar as notas dele em horários diferentes só faria o motorista esperar.
//
// O cálculo mora aqui, e não na tela, porque as duas pontas precisam da mesma
// resposta: a tela, para mostrar o que dá para escolher; o servidor, para
// recusar o que não dá. Tela que decide sozinha é tela que pode ser contornada.

/** Quando a doca abre e fecha num dia, em horas de São Paulo. */
export type JanelaDoDia = { abre: number; fecha: number };

/**
 * A janela de recebimento de cada dia da semana (0 = domingo).
 *
 * De segunda a quinta a doca recebe das 8 às 17; na sexta fecha uma hora mais
 * cedo, às 16; sábado e domingo não há recebimento. O último horário é o do
 * fechamento: quem marca as 17:00 chega na hora de fechar, e é assim que a
 * operação conta.
 *
 * Feriado não está aqui: ele não tem regra fixa, e a parada de um dia avulso
 * já tem o seu lugar (shared/paradaDoEstoque.ts).
 */
const JANELA_DA_SEMANA: Record<number, JanelaDoDia | null> = {
  0: null,
  1: { abre: 8, fecha: 17 },
  2: { abre: 8, fecha: 17 },
  3: { abre: 8, fecha: 17 },
  4: { abre: 8, fecha: 17 },
  5: { abre: 8, fecha: 16 },
  6: null,
};
/** De quanto em quanto tempo um caminhão entra. */
export const PASSO_EM_MINUTOS = 30;
/** Quantos fornecedores diferentes cabem no mesmo horário. */
export const CABEM_POR_HORARIO = 1;

export type SituacaoDoHorario =
  /** Ninguém marcado: pode agendar. */
  | "livre"
  /** Quem está marcado é o próprio fornecedor: pode juntar a carga. */
  | "proprio"
  /** Outro fornecedor ocupou: o fornecedor não escolhe, o operador escolhe avisado. */
  | "ocupado"
  /**
   * Livre, mas o fornecedor já tem entrega neste dia em outro horário: ele junta
   * a carga naquele ou escolhe outro dia. Dois caminhões do mesmo fornecedor no
   * mesmo dia ocupam a doca duas vezes para entregar o que cabia em uma.
   */
  | "outro_horario";

export type HorarioDaAgenda = {
  /** "08:30" — o mesmo formato que o input type="time" usa. */
  hora: string;
  situacao: SituacaoDoHorario;
  /** Quem já está neste horário, para a tela dizer de quem é a vaga. */
  fornecedores: string[];
};

/** Uma entrega já marcada, do jeito mínimo que o cálculo precisa. */
export type EntregaMarcada = {
  /** A nota. Serve para não contar contra o fornecedor a que ele está movendo. */
  appointmentId?: number;
  /** O instante combinado. */
  quando: Date | string;
  supplierId: number;
  fornecedor?: string | null;
};

export function horaDoTexto(hora: string): { h: number; m: number } | null {
  const casou = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!casou) return null;
  const h = Number(casou[1]);
  const m = Number(casou[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function comoTexto(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * O dia da semana de uma data "2026-11-05", sem passar por fuso.
 *
 * A data já é a de São Paulo; levá-la a um instante e lê-la de volta no fuso do
 * servidor poderia empurrá-la para o dia anterior.
 */
export function diaDaSemana(dia: string): number | null {
  const casou = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!casou) return null;
  const data = new Date(Date.UTC(Number(casou[1]), Number(casou[2]) - 1, Number(casou[3])));
  return Number.isNaN(data.getTime()) ? null : data.getUTCDay();
}

/** A doca recebe neste dia? E até que horas? Nulo é dia sem recebimento. */
export function janelaDoDia(dia: string): JanelaDoDia | null {
  const semana = diaDaSemana(dia);
  return semana === null ? null : JANELA_DA_SEMANA[semana] ?? null;
}

/** Os horários do dia, do primeiro ao último, sem olhar a agenda. Vazio quando não há recebimento. */
export function horariosDaJanela(dia: string): string[] {
  const janela = janelaDoDia(dia);
  if (!janela) return [];
  const horarios: string[] = [];
  for (let minuto = janela.abre * 60; minuto <= janela.fecha * 60; minuto += PASSO_EM_MINUTOS) {
    horarios.push(comoTexto(Math.floor(minuto / 60), minuto % 60));
  }
  return horarios;
}

/** Este horário existe na janela deste dia? */
export function horarioDaJanela(hora: string, dia: string): boolean {
  return horariosDaJanela(dia).includes(hora);
}

/** O que a pessoa lê quando escolhe um dia sem recebimento. */
export const DIA_SEM_RECEBIMENTO = "Não recebemos aos sábados e domingos. Escolha um dia de segunda a sexta.";

/** A regra dita em uma frase, para quem erra o horário. */
export const JANELA_POR_EXTENSO = "de segunda a quinta das 08:00 às 17:00 e na sexta das 08:00 às 16:00";

/**
 * A hora de São Paulo de um instante, como "08:30".
 *
 * O servidor roda em UTC e o banco guarda instante. Ler a hora com
 * `getHours()` devolveria a hora de Londres e espalharia as entregas por
 * horários que ninguém marcou.
 */
export function horaEmSaoPaulo(quando: Date | string): string {
  const data = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(data.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(data);
}

/**
 * Como está cada horário do dia para este fornecedor.
 *
 * `supplierIds` são os logins de quem está agendando — a conta e as irmãs da
 * mesma empresa. As entregas delas aparecem como "proprio", e não como
 * obstáculo: é a mesma empresa, é o mesmo caminhão. Sem fornecedor nenhum — a
 * mesa olhando a agenda do dia — qualquer ocupação é "ocupado".
 */
export function horariosDoDia(input: {
  /** O dia, "2026-11-05": é ele que diz até que horas a doca recebe. */
  dia: string;
  entregas: EntregaMarcada[];
  supplierIds?: number[] | null;
  /**
   * Quem pede só pode ficar no horário que já tem no dia (o fornecedor). A mesa
   * não: ela decide com o aviso na mão e pode abrir outro horário.
   */
  soNoHorarioDele?: boolean;
  /**
   * A nota que está recebendo a data. A entrega dela não conta: o fornecedor que
   * move a nota das 10h para as 11h não está abrindo um segundo horário, está
   * trocando o único que tem.
   */
  ignorar?: number;
}): HorarioDaAgenda[] {
  const proprios = new Set(input.supplierIds ?? []);
  const doDia = input.ignorar === undefined ? input.entregas : input.entregas.filter(entrega => entrega.appointmentId !== input.ignorar);
  // Os horários em que o fornecedor já tem entrega marcada neste dia.
  const horasDele = new Set(
    doDia.filter(entrega => proprios.has(entrega.supplierId)).map(entrega => horaEmSaoPaulo(entrega.quando)).filter(Boolean),
  );
  const fixoNoDele = Boolean(input.soNoHorarioDele) && horasDele.size > 0;
  const porHorario = new Map<string, EntregaMarcada[]>();
  for (const entrega of doDia) {
    const hora = horaEmSaoPaulo(entrega.quando);
    if (!hora) continue;
    const lista = porHorario.get(hora);
    if (lista) lista.push(entrega);
    else porHorario.set(hora, [entrega]);
  }

  return horariosDaJanela(input.dia).map(hora => {
    const marcadas = porHorario.get(hora) ?? [];
    const deOutros = marcadas.filter(entrega => !proprios.has(entrega.supplierId));
    const temOProprio = marcadas.length > deOutros.length;
    const situacao: SituacaoDoHorario = deOutros.length >= CABEM_POR_HORARIO
      ? "ocupado"
      : temOProprio
        ? "proprio"
        : fixoNoDele
          ? "outro_horario"
          : "livre";
    // Nome repetido é a mesma empresa com duas notas: a tela diria "Amil, Amil".
    const fornecedores = Array.from(new Set(marcadas.map(entrega => entrega.fornecedor?.trim()).filter((nome): nome is string => Boolean(nome))));
    return { hora, situacao, fornecedores };
  });
}

/** Sobrou algum horário para este fornecedor marcar neste dia? */
export function temVaga(horarios: HorarioDaAgenda[]): boolean {
  return horarios.some(horario => horario.situacao === "livre" || horario.situacao === "proprio");
}

/** Os horários em que quem pede já tem entrega no dia, em ordem. */
export function horariosDoProprio(horarios: HorarioDaAgenda[]): string[] {
  return horarios.filter(horario => horario.situacao === "proprio").map(horario => horario.hora);
}

/** O que o fornecedor lê quando já tem horário no dia e tenta abrir outro. */
export function motivoDoOutroHorario(horariosDele: string[]): string {
  const quando = horariosDele.length === 1 ? `às ${horariosDele[0]}` : `às ${horariosDele.join(" e ")}`;
  return `Você já tem entrega neste dia ${quando}. Junte a carga nesse horário ou escolha outro dia.`;
}

/** O recado de quando o dia inteiro está tomado. */
export const DIA_SEM_VAGA = "Todos os horários deste dia já estão ocupados por outros fornecedores. Escolha outro dia.";

/** O que o operador lê antes de marcar por cima de outro fornecedor. */
export function avisoDeHorarioOcupado(horario: HorarioDaAgenda): string {
  const quem = horario.fornecedores.length ? ` com ${horario.fornecedores.join(", ")}` : "";
  return `Já temos fornecedor marcado para as ${horario.hora}${quem}. Tem certeza que quer marcar outro no mesmo horário?`;
}

/** O que o fornecedor lê quando tenta um horário que não é dele. */
export function motivoDoHorarioOcupado(hora: string): string {
  return `O horário das ${hora} já está ocupado por outro fornecedor. Escolha um dos horários livres.`;
}
