import { describe, expect, it } from "vitest";
import {
  avisoDeHorarioOcupado,
  horaEmSaoPaulo,
  diaDaSemana,
  horarioDaJanela,
  horariosDaJanela,
  janelaDoDia,
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
