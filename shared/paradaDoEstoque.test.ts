import { describe, expect, it } from "vitest";
import {
  avisoDaParada,
  motivoDaRecusa,
  diasPorExtenso,
  paradaAindaVale,
  paradaDaUnidade,
  paradaNoDia,
  paradasQueVemAi,
  PARADAS_DO_ESTOQUE,
  unidadeDaParada,
  type ParadaDoEstoque,
} from "./paradaDoEstoque";

const HOSPITAL = "06033403000113";
const MATERNIDADE = "43293604002120";

const inventario: ParadaDoEstoque = {
  cnpj: HOSPITAL,
  dias: ["2026-11-11", "2026-11-12", "2026-11-13"],
  motivo: "Inventário no estoque",
};

describe("o dia fechado", () => {
  it("barra a entrega da unidade que parou", () => {
    expect(paradaNoDia(HOSPITAL, "2026-11-11T08:00:00.000-03:00")).toBeTruthy();
    expect(paradaNoDia(HOSPITAL, "2026-11-12T14:00:00.000-03:00")).toBeTruthy();
    expect(paradaNoDia(HOSPITAL, "2026-11-13T18:00:00.000-03:00")).toBeTruthy();
  });

  it("a hora não salva ninguém: o estoque fica fechado o dia todo", () => {
    expect(paradaNoDia(HOSPITAL, "2026-11-11T23:30:00.000-03:00")).toBeTruthy();
  });

  it("a véspera e o dia seguinte continuam livres", () => {
    expect(paradaNoDia(HOSPITAL, "2026-11-10T08:00:00.000-03:00")).toBeNull();
    expect(paradaNoDia(HOSPITAL, "2026-11-14T08:00:00.000-03:00")).toBeNull();
  });

  it("a outra unidade recebe normalmente nos mesmos dias", () => {
    // É a metade da regra que mais importa: um inventário no Hospital que
    // travasse a Maternidade faria o fornecedor dela segurar carga à toa.
    expect(paradaNoDia(MATERNIDADE, "2026-11-11T08:00:00.000-03:00")).toBeNull();
  });

  it("o dia é o de São Paulo, e não o do UTC", () => {
    // 11/11 às 22h em São Paulo já é dia 12 em Londres. Se a conta fosse feita
    // em UTC, o estoque fecharia e abriria com horas de diferença do combinado.
    expect(paradaNoDia(HOSPITAL, "2026-11-12T01:00:00.000Z")).toBeTruthy();
    // E 14/11 às 00h30 em UTC ainda é dia 13 aqui: continua fechado.
    expect(paradaNoDia(HOSPITAL, "2026-11-14T02:00:00.000Z")).toBeTruthy();
    // Já 14/11 às 9h daqui está liberado.
    expect(paradaNoDia(HOSPITAL, "2026-11-14T12:00:00.000Z")).toBeNull();
  });

  it("nota sem destinatário não é barrada por uma unidade que talvez não seja a dela", () => {
    expect(paradaNoDia(null, "2026-11-11T08:00:00.000-03:00")).toBeNull();
    expect(paradaNoDia("", "2026-11-11T08:00:00.000-03:00")).toBeNull();
  });

  it("CNPJ com pontuação vale igual: o XML nem sempre vem limpo", () => {
    expect(paradaNoDia("06.033.403/0001-13", "2026-11-11T08:00:00.000-03:00")).toBeTruthy();
  });

  it("sem data não há o que barrar", () => {
    expect(paradaNoDia(HOSPITAL, null)).toBeNull();
    expect(paradaNoDia(HOSPITAL, "nao e data")).toBeNull();
  });
});

describe("quando a parada some da tela", () => {
  it("vale enquanto o último dia não passou", () => {
    expect(paradaAindaVale(inventario, new Date("2026-11-01T10:00:00.000-03:00"))).toBe(true);
    expect(paradaAindaVale(inventario, new Date("2026-11-13T23:00:00.000-03:00"))).toBe(true);
  });

  it("no dia seguinte sai sozinha, sem ninguém precisar apagar nada", () => {
    expect(paradaAindaVale(inventario, new Date("2026-11-14T08:00:00.000-03:00"))).toBe(false);
  });

  it("o aviso da unidade só aparece para quem entrega nela", () => {
    const antes = new Date("2026-11-01T10:00:00.000-03:00");
    expect(paradaDaUnidade(HOSPITAL, antes)?.motivo).toBe("Inventário no estoque");
    expect(paradaDaUnidade(MATERNIDADE, antes)).toBeNull();
    expect(paradaDaUnidade(HOSPITAL, new Date("2026-12-01T10:00:00.000-03:00"))).toBeNull();
  });

  it("a lista vem da mais próxima para a mais longe", () => {
    const dias = paradasQueVemAi(new Date("2020-01-01T00:00:00.000-03:00")).map(parada => parada.dias[0]);
    expect([...dias].sort()).toEqual(dias);
  });
});

describe("como a parada é dita", () => {
  it("escreve os dias do jeito que se fala", () => {
    expect(diasPorExtenso(inventario)).toBe("11, 12 e 13 de novembro");
    expect(diasPorExtenso({ ...inventario, dias: ["2026-11-11"] })).toBe("11 de novembro");
  });

  it("a recusa diz quem, quando e o que fazer, sem repetir o motivo", () => {
    const recusa = motivoDaRecusa(inventario, new Date("2026-11-12T13:00:00.000-03:00"));
    expect(recusa).toBe("Não teremos recebimento no Hospital em 12/11: inventário no estoque nos dias 11, 12 e 13 de novembro. Escolha uma data antes ou depois.");
  });

  it("o artigo acompanha a unidade: nunca \"do Maternidade\"", () => {
    const naMaternidade = { ...inventario, cnpj: MATERNIDADE };
    expect(avisoDaParada(naMaternidade)).toContain("entrega da Maternidade");
    expect(avisoDaParada(naMaternidade)).toContain("O Hospital recebe normalmente");
    expect(motivoDaRecusa(naMaternidade, new Date("2026-11-11T13:00:00.000-03:00"))).toContain("recebimento na Maternidade");
  });

  it("o aviso diz a unidade, os dias e o que fazer", () => {
    const aviso = avisoDaParada(inventario);
    expect(aviso).toContain("Hospital");
    expect(aviso).toContain("11, 12 e 13 de novembro");
    // Sem a frase seguinte, o aviso só gera uma ligação para o balcão.
    expect(aviso).toContain("antes ou depois");
    expect(aviso).toContain("Maternidade");
  });

  it("a unidade vem da lista de destinatários, e não escrita à mão", () => {
    expect(unidadeDaParada(inventario)).toBe("Hospital");
  });
});

describe("as paradas cadastradas", () => {
  it("cada uma aponta para uma unidade que existe", () => {
    for (const parada of PARADAS_DO_ESTOQUE) {
      expect(unidadeDaParada(parada)).not.toBe("unidade");
      expect(parada.dias.length).toBeGreaterThan(0);
      for (const dia of parada.dias) expect(dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("o inventário de novembro está lá, nos três dias", () => {
    const parada = PARADAS_DO_ESTOQUE.find(item => item.cnpj === HOSPITAL);
    expect(parada?.dias).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
  });
});
