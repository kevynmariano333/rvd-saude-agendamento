import { describe, expect, it } from "vitest";
import {
  avisoDeHorarioOcupado,
  horaEmSaoPaulo,
  horarioDaJanela,
  horariosDaJanela,
  horariosDoDia,
  temVaga,
  type EntregaMarcada,
} from "./horariosDaAgenda";

const AMIL = 10;
const OUTRO = 20;

function as(hora: string, supplierId: number, fornecedor?: string): EntregaMarcada {
  return { quando: `2026-11-05T${hora}:00.000-03:00`, supplierId, fornecedor };
}

describe("a janela de recebimento", () => {
  it("vai das 8 às 17, de meia em meia hora", () => {
    const janela = horariosDaJanela();
    expect(janela[0]).toBe("08:00");
    expect(janela[1]).toBe("08:30");
    expect(janela[janela.length - 1]).toBe("17:00");
    expect(janela).toHaveLength(19);
  });

  it("recusa hora que não é da janela", () => {
    // Hora digitada à mão é por onde o campo livre voltaria: 07:13 não é um
    // horário da doca, é alguém contornando a lista.
    expect(horarioDaJanela("08:30")).toBe(true);
    expect(horarioDaJanela("07:13")).toBe(false);
    expect(horarioDaJanela("18:00")).toBe(false);
    expect(horarioDaJanela("")).toBe(false);
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
    const dia = horariosDoDia({ entregas: [], supplierIds: [AMIL] });
    expect(dia.every(horario => horario.situacao === "livre")).toBe(true);
    expect(temVaga(dia)).toBe(true);
  });

  it("o horário de outro fornecedor fica ocupado", () => {
    const dia = horariosDoDia({ entregas: [as("10:00", OUTRO, "Cremer")], supplierIds: [AMIL] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("ocupado");
    expect(dia.find(horario => horario.hora === "10:30")?.situacao).toBe("livre");
  });

  it("o horário do próprio fornecedor continua escolhível: é um caminhão só", () => {
    // É a regra que o balcão pediu: duas notas da mesma empresa na mesma hora
    // é um caminhão com duas notas, não dois caminhões disputando a doca.
    const dia = horariosDoDia({ entregas: [as("10:00", AMIL, "CM Hospitalar")], supplierIds: [AMIL] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("proprio");
    expect(temVaga(dia)).toBe(true);
  });

  it("quando a mesa olha sem fornecedor nenhum, tudo que está marcado é ocupado", () => {
    const dia = horariosDoDia({ entregas: [as("10:00", AMIL, "CM Hospitalar")] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("ocupado");
  });

  it("a entrega fora da janela não derruba nem ocupa nada", () => {
    // Agendamento antigo das 19h continua existindo no banco; ele não aparece
    // na lista, e também não pode quebrar o cálculo dos horários que aparecem.
    const dia = horariosDoDia({ entregas: [as("19:00", OUTRO, "Cremer")], supplierIds: [AMIL] });
    expect(dia).toHaveLength(19);
    expect(dia.every(horario => horario.situacao === "livre")).toBe(true);
  });

  it("diz quem está no horário, sem repetir a mesma empresa", () => {
    const dia = horariosDoDia({
      entregas: [as("09:00", OUTRO, "Cremer"), as("09:00", OUTRO, "Cremer")],
      supplierIds: [AMIL],
    });
    expect(dia.find(horario => horario.hora === "09:00")?.fornecedores).toEqual(["Cremer"]);
  });

  it("o dia todo tomado não deixa vaga nenhuma", () => {
    const entregas = horariosDaJanela().map(hora => as(hora, OUTRO, "Cremer"));
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
    const dia = horariosDoDia({ entregas: [as("10:00", irmao, "CM Hospitalar")], supplierIds: [AMIL, irmao] });
    expect(dia.find(horario => horario.hora === "10:00")?.situacao).toBe("proprio");
  });
});
