import { describe, expect, it } from "vitest";
import {
  avisoDeHorarioOcupado,
  horaEmSaoPaulo,
  diaDaSemana,
  horarioDaJanela,
  horariosDaJanela,
  janelaDoDia,
  motivoDoOutroHorario,
  horariosDoDia,
  temVaga,
  type EntregaMarcada,
} from "./horariosDaAgenda";

const AMIL = 10;
const OUTRO = 20;

function as(hora: string, supplierId: number, fornecedor?: string): EntregaMarcada {
  return { quando: `2026-11-05T${hora}:00.000-03:00`, supplierId, fornecedor };
}

// 2026-11-05 é quinta; 06, sexta; 07, sábado; 08, domingo.
const QUINTA = "2026-11-05";
const SEXTA = "2026-11-06";
const SABADO = "2026-11-07";
const DOMINGO = "2026-11-08";

describe("a janela de recebimento", () => {
  it("de segunda a quinta vai das 8 às 17, de meia em meia hora", () => {
    for (const dia of ["2026-11-02", "2026-11-03", "2026-11-04", QUINTA]) {
      const janela = horariosDaJanela(dia);
      expect(janela[0]).toBe("08:00");
      expect(janela[1]).toBe("08:30");
      expect(janela[janela.length - 1]).toBe("17:00");
      expect(janela).toHaveLength(19);
    }
  });

  it("na sexta fecha uma hora mais cedo: das 8 às 16", () => {
    const janela = horariosDaJanela(SEXTA);
    expect(janela[0]).toBe("08:00");
    expect(janela[janela.length - 1]).toBe("16:00");
    expect(janela).toHaveLength(17);
    expect(janela).not.toContain("16:30");
    expect(janela).not.toContain("17:00");
  });

  it("sábado e domingo não têm recebimento", () => {
    expect(horariosDaJanela(SABADO)).toEqual([]);
    expect(horariosDaJanela(DOMINGO)).toEqual([]);
    expect(janelaDoDia(SABADO)).toBeNull();
    expect(janelaDoDia(DOMINGO)).toBeNull();
  });

  it("o dia da semana não depende do fuso do servidor", () => {
    // A data já é a de São Paulo. Levada a um instante e lida de volta noutro
    // fuso, 2026-11-06 (sexta) poderia virar quinta e ganhar o horário das 17h.
    expect(diaDaSemana("2026-11-06")).toBe(5);
    expect(diaDaSemana("2026-11-01")).toBe(0);
    expect(diaDaSemana("2026-11-07")).toBe(6);
  });

  it("data inválida não tem janela", () => {
    expect(janelaDoDia("não é data")).toBeNull();
    expect(horariosDaJanela("")).toEqual([]);
  });

  it("recusa hora que não é da janela", () => {
    // Hora digitada à mão é por onde o campo livre voltaria: 07:13 não é um
    // horário da doca, é alguém contornando a lista.
    expect(horarioDaJanela("08:30", QUINTA)).toBe(true);
    expect(horarioDaJanela("07:13", QUINTA)).toBe(false);
    expect(horarioDaJanela("18:00", QUINTA)).toBe(false);
    expect(horarioDaJanela("", QUINTA)).toBe(false);
  });

  it("a mesma hora vale numa quinta e não numa sexta", () => {
    expect(horarioDaJanela("16:30", QUINTA)).toBe(true);
    expect(horarioDaJanela("16:30", SEXTA)).toBe(false);
    expect(horarioDaJanela("17:00", SEXTA)).toBe(false);
  });

  it("não existe horário quebrado entre os de meia em meia hora", () => {
    // "08:05" não é um horário: a doca entra de 30 em 30 minutos.
    expect(horarioDaJanela("08:05", QUINTA)).toBe(false);
    expect(horarioDaJanela("08:15", QUINTA)).toBe(false);
  });
});

describe("a hora de São Paulo", () => {
  it("é a hora daqui, e não a do servidor", () => {
    // O servidor roda em UTC: lido cru, um agendamento das 8h daqui vira 11h e
    // o horário marcado não bate com nenhum da lista.
    expect(horaEmSaoPaulo("2026-11-05T11:00:00.000Z")).toBe("08:00");
    expect(horaEmSaoPaulo("2026-11-05T08:30:00.000-03:00")).toBe("08:30");
  });

  it("data inválida não vira horário nenhum", () => {
    expect(horaEmSaoPaulo("não é data")).toBe("");
  });
});

describe("os horários do dia", () => {
  it("sem nada marcado, o dia inteiro está livre", () => {
    const dia = horariosDoDia({ dia: QUINTA, entregas: [], supplierIds: [AMIL] });
    expect(dia.every(horario => horario.situacao === "livre")).toBe(true);
    expect(temVaga(dia)).toBe(true);
  });

  it("o horário de outro fornecedor fica ocupado", () => {
    const dia = horariosDoDia({ dia: QUINTA, entregas: [as("10:00", OUTRO, "Cremer")], supplierIds: [AMIL] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("ocupado");
    expect(dia.find(horario => horario.hora === "10:30")?.situacao).toBe("livre");
  });

  it("o horário do próprio fornecedor continua escolhível: é um caminhão só", () => {
    // É a regra que o balcão pediu: duas notas da mesma empresa na mesma hora
    // é um caminhão com duas notas, não dois caminhões disputando a doca.
    const dia = horariosDoDia({ dia: QUINTA, entregas: [as("10:00", AMIL, "CM Hospitalar")], supplierIds: [AMIL] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("proprio");
    expect(temVaga(dia)).toBe(true);
  });

  it("quando a mesa olha sem fornecedor nenhum, tudo que está marcado é ocupado", () => {
    const dia = horariosDoDia({ dia: QUINTA, entregas: [as("10:00", AMIL, "CM Hospitalar")] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("ocupado");
  });

  it("a entrega fora da janela não derruba nem ocupa nada", () => {
    // Agendamento antigo das 19h continua existindo no banco; ele não aparece
    // na lista, e também não pode quebrar o cálculo dos horários que aparecem.
    const dia = horariosDoDia({ dia: QUINTA, entregas: [as("19:00", OUTRO, "Cremer")], supplierIds: [AMIL] });
    expect(dia).toHaveLength(19);
    expect(dia.every(horario => horario.situacao === "livre")).toBe(true);
  });

  it("diz quem está no horário, sem repetir a mesma empresa", () => {
    const dia = horariosDoDia({
      dia: QUINTA,
      entregas: [as("09:00", OUTRO, "Cremer"), as("09:00", OUTRO, "Cremer")],
      supplierIds: [AMIL],
    });
    expect(dia.find(horario => horario.hora === "09:00")?.fornecedores).toEqual(["Cremer"]);
  });

  it("o dia todo tomado não deixa vaga nenhuma", () => {
    const entregas = horariosDaJanela(QUINTA).map(hora => as(hora, OUTRO, "Cremer"));
    const dia = horariosDoDia({ entregas, supplierIds: [AMIL] });
    expect(temVaga(dia)).toBe(false);
  });
});

describe("o aviso do operador", () => {
  it("diz a hora e de quem é o horário", () => {
    const horario = { hora: "10:00", situacao: "ocupado" as const, fornecedores: ["Cremer"] };
    expect(avisoDeHorarioOcupado(horario)).toContain("10:00");
    expect(avisoDeHorarioOcupado(horario)).toContain("Cremer");
    expect(avisoDeHorarioOcupado(horario)).toContain("Tem certeza");
  });

  it("sem o nome, o aviso ainda faz sentido", () => {
    const horario = { hora: "10:00", situacao: "ocupado" as const, fornecedores: [] };
    expect(avisoDeHorarioOcupado(horario)).toBe("Já temos fornecedor marcado para as 10:00. Tem certeza que quer marcar outro no mesmo horário?");
  });
});

describe("as contas da mesma empresa", () => {
  it("dividem o horário entre si", () => {
    // Dois logins do mesmo fornecedor são a mesma empresa: o horário que um
    // marcou não pode aparecer bloqueado para o outro.
    const irmao = 11;
    const dia = horariosDoDia({ dia: QUINTA, entregas: [as("10:00", irmao, "CM Hospitalar")], supplierIds: [AMIL, irmao] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("proprio");
  });
});

describe("a agenda de sexta, sábado e domingo", () => {
  it("na sexta não existe o horário das 17:00 nem o das 16:30", () => {
    const dia = horariosDoDia({ dia: SEXTA, entregas: [], supplierIds: [AMIL] });
    expect(dia[dia.length - 1]?.hora).toBe("16:00");
    expect(dia.map(horario => horario.hora)).not.toContain("17:00");
  });

  it("no fim de semana não há horário para escolher", () => {
    expect(horariosDoDia({ dia: SABADO, entregas: [], supplierIds: [AMIL] })).toEqual([]);
    expect(horariosDoDia({ dia: DOMINGO, entregas: [], supplierIds: [AMIL] })).toEqual([]);
  });
});

describe("o fornecedor que já tem horário no dia", () => {
  const dele = (hora: string, appointmentId = 5) => ({ ...as(hora, AMIL, "CM Hospitalar"), appointmentId });
  const agenda = (entregas: EntregaMarcada[], extra: object = {}) =>
    horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], soNoHorarioDele: true, ...extra });
  const situacao = (dia: ReturnType<typeof agenda>, hora: string) => dia.find(horario => horario.hora === hora)?.situacao;

  it("só pode pedir esse mesmo horário", () => {
    const dia = agenda([dele("10:00")]);
    expect(situacao(dia, "10:00")).toBe("proprio");
    expect(situacao(dia, "10:30")).toBe("outro_horario");
    expect(situacao(dia, "08:00")).toBe("outro_horario");
  });

  it("outro dia continua livre", () => {
    // As entregas dele são de quinta; na sexta ele não tem nada.
    const sexta = horariosDoDia({ dia: SEXTA, entregas: [], supplierIds: [AMIL], soNoHorarioDele: true });
    expect(sexta.every(horario => horario.situacao === "livre")).toBe(true);
  });

  it("com duas entregas no dia, as duas horas são dele", () => {
    const dia = agenda([dele("10:00", 5), dele("14:30", 6)]);
    expect(situacao(dia, "10:00")).toBe("proprio");
    expect(situacao(dia, "14:30")).toBe("proprio");
    expect(situacao(dia, "11:00")).toBe("outro_horario");
  });

  it("o que é de outro fornecedor continua ocupado, e não \"outro horário\"", () => {
    const dia = agenda([dele("10:00"), as("13:00", OUTRO, "Cremer")]);
    expect(situacao(dia, "13:00")).toBe("ocupado");
  });

  it("mover a própria nota não conta como um segundo horário", () => {
    // A nota 5 está às 10h. Quem a move para as 11h está trocando o único
    // horário que tem, e o dia inteiro fica livre para ele.
    const dia = agenda([dele("10:00", 5)], { ignorar: 5 });
    expect(situacao(dia, "10:00")).toBe("livre");
    expect(situacao(dia, "11:00")).toBe("livre");
  });

  it("mas outra nota dele no mesmo dia continua prendendo o horário", () => {
    const dia = agenda([dele("10:00", 5), dele("14:00", 6)], { ignorar: 5 });
    expect(situacao(dia, "14:00")).toBe("proprio");
    expect(situacao(dia, "11:00")).toBe("outro_horario");
    expect(situacao(dia, "10:00")).toBe("outro_horario");
  });

  it("a mesa não é presa: abre outro horário, e vê o mesmo como livre", () => {
    const dia = horariosDoDia({ dia: QUINTA, entregas: [dele("10:00")], supplierIds: [AMIL] });
    expect(situacao(dia, "10:30")).toBe("livre");
  });

  it("as contas da mesma empresa dividem o horário: é o mesmo caminhão", () => {
    const irmao = 11;
    const dia = horariosDoDia({ dia: QUINTA, entregas: [{ ...as("10:00", irmao), appointmentId: 7 }], supplierIds: [AMIL, irmao], soNoHorarioDele: true });
    expect(situacao(dia, "10:00")).toBe("proprio");
    expect(situacao(dia, "10:30")).toBe("outro_horario");
  });

  it("o dia com horário dele ainda tem vaga, mesmo com o resto fechado para ele", () => {
    expect(temVaga(agenda([dele("10:00")]))).toBe(true);
  });

  it("sem nenhuma vaga livre nem dele, o dia está cheio", () => {
    const outros = horariosDaJanela(QUINTA).map(hora => as(hora, OUTRO, "Cremer"));
    expect(temVaga(agenda(outros))).toBe(false);
  });

  it("diz as horas dele na frase", () => {
    expect(motivoDoOutroHorario(["10:00"])).toContain("às 10:00");
    expect(motivoDoOutroHorario(["10:00", "14:30"])).toContain("às 10:00 e 14:30");
    expect(motivoDoOutroHorario(["10:00"])).toContain("outro dia");
  });
});

describe("uma doca por empresa", () => {
  const HOSPITAL = "06033403000113";
  const RVD = "39283469000110";
  const LLT = "45295469000133";
  const naDoca = (hora: string, supplierId: number, cnpj: string, fornecedor = "Fornecedor") => ({
    ...as(hora, supplierId, fornecedor),
    recipientCnpj: cnpj,
  });
  const situacao = (dia: { hora: string; situacao: string }[], hora: string) => dia.find(horario => horario.hora === hora)?.situacao;

  it("o horário ocupado na doca da Amil continua livre na da RVD", () => {
    // Amil, RVD e LLT recebem ao mesmo tempo, cada uma com o seu fornecedor.
    const entregas = [naDoca("10:00", OUTRO, HOSPITAL, "Cremer")];
    expect(situacao(horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], doca: "amil" }), "10:00")).toBe("ocupado");
    expect(situacao(horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], doca: "rvd" }), "10:00")).toBe("livre");
    expect(situacao(horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], doca: "llt" }), "10:00")).toBe("livre");
  });

  it("as três docks recebem no mesmo horário, cada uma com um fornecedor", () => {
    const entregas = [naDoca("10:00", 21, HOSPITAL), naDoca("10:00", 22, RVD), naDoca("10:00", 23, LLT)];
    for (const doca of ["amil", "rvd", "llt"] as const) {
      expect(situacao(horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], doca }), "10:00")).toBe("ocupado");
    }
    // E um quarto fornecedor da RVD não entra: a doca dela já tem um.
    const rvd = horariosDoDia({ dia: QUINTA, entregas: [naDoca("10:00", 22, RVD)], supplierIds: [AMIL], doca: "rvd" });
    expect(situacao(rvd, "10:00")).toBe("ocupado");
    expect(situacao(rvd, "10:30")).toBe("livre");
  });

  it("sem saber a doca, qualquer entrega ocupa: a conta conservadora", () => {
    const entregas = [naDoca("10:00", OUTRO, HOSPITAL, "Cremer")];
    expect(situacao(horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL] }), "10:00")).toBe("ocupado");
  });

  it("o fornecedor com entrega da Amil fica no mesmo horário para a RVD", () => {
    // É o mesmo caminhão: o horário que ele já tem no dia é o dele para todas as docas.
    const entregas = [{ ...naDoca("10:00", AMIL, HOSPITAL, "CM Hospitalar"), appointmentId: 5 }];
    const dia = horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], soNoHorarioDele: true, doca: "rvd" });
    expect(situacao(dia, "10:00")).toBe("proprio");
    expect(situacao(dia, "10:30")).toBe("outro_horario");
    expect(situacao(dia, "08:00")).toBe("outro_horario");
  });

  it("e o contrário: a entrega da RVD o prende também na Amil", () => {
    const entregas = [{ ...naDoca("14:00", AMIL, RVD, "CM Hospitalar"), appointmentId: 5 }];
    const dia = horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], soNoHorarioDele: true, doca: "amil" });
    expect(situacao(dia, "14:00")).toBe("proprio");
    expect(situacao(dia, "15:00")).toBe("outro_horario");
  });

  it("o próprio fornecedor não ocupa a doca contra si mesmo", () => {
    const entregas = [naDoca("10:00", AMIL, HOSPITAL, "CM Hospitalar")];
    const dia = horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], doca: "rvd" });
    expect(situacao(dia, "10:00")).toBe("proprio");
  });

  it("o nome de quem entrega em outra doca não aparece", () => {
    const entregas = [naDoca("10:00", OUTRO, HOSPITAL, "Fornecedor da Amil"), naDoca("10:00", 22, RVD, "Fornecedor da RVD")];
    const dia = horariosDoDia({ dia: QUINTA, entregas, supplierIds: [AMIL], doca: "rvd" });
    expect(dia.find(horario => horario.hora === "10:00")?.fornecedores).toEqual(["Fornecedor da RVD"]);
  });

  it("a nota sem destinatário é da doca da Amil, como o acervo antigo", () => {
    const entregas = [naDoca("10:00", OUTRO, "", "Cremer")];
    expect(situacao(horariosDoDia({ dia: QUINTA, entregas: [{ ...entregas[0], recipientCnpj: null }], supplierIds: [AMIL], doca: "amil" }), "10:00")).toBe("ocupado");
    expect(situacao(horariosDoDia({ dia: QUINTA, entregas: [{ ...entregas[0], recipientCnpj: null }], supplierIds: [AMIL], doca: "rvd" }), "10:00")).toBe("livre");
  });
});
