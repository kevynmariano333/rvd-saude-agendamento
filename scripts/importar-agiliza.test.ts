import { describe, expect, it } from "vitest";
import { MOTIVOS_DE_BACKLOG } from "../shared/backlogReasons";
import { canTransitionAppointment } from "../server/permissions";
import { lerComentarios, lerDataSaoPaulo, lerDinheiroEmCentavos, montarEventos, MOTIVOS_DO_AGILIZA, STATUS_AGILIZA, type EpisodioDeBacklog, type LinhaValidada } from "./importar-agiliza";
import type { AppointmentStatus } from "../drizzle/schema";

const linha = (extra: Partial<LinhaValidada> = {}): LinhaValidada => ({
  dataCriacao: lerDataSaoPaulo("01/09/2026, 08:00:00")!,
  ultimoStatus: "Concluída",
  dataUltimoStatus: lerDataSaoPaulo("05/09/2026, 16:00:00")!,
  dataAgendamento: lerDataSaoPaulo("03/09/2026, 10:00:00")!,
  numeroNota: "570619",
  numeroPedido: "4504882868",
  cnpjFornecedor: "02881877000164",
  nomeFornecedor: "POLAR FIX",
  totalLinhas: 1,
  cnpjDestino: "43293604002120",
  descricaoDestino: "MSH - MATERN.",
  ...extra,
});

const episodio = (extra: Partial<EpisodioDeBacklog> = {}): EpisodioDeBacklog => ({
  codigoOriginal: "pedido_compra",
  codigo: "PENDENCIA_PEDIDO_COMPRA",
  entrouEm: lerDataSaoPaulo("04/09/2026, 09:00:00")!,
  saiuEm: lerDataSaoPaulo("04/09/2026, 18:00:00")!,
  comentarios: [],
  ...extra,
});

describe("dinheiro e datas do acervo", () => {
  it("lê o real brasileiro em centavos", () => {
    expect(lerDinheiroEmCentavos("14.626,50")).toBe(1462650);
    expect(lerDinheiroEmCentavos("417,90")).toBe(41790);
    expect(lerDinheiroEmCentavos("")).toBeNull();
    // Sem isto, "1.234" viraria 1,23 e a nota perderia mil reais.
    expect(lerDinheiroEmCentavos("1.234")).toBe(123400);
  });

  it("lê a data como hora de São Paulo, e não do processo", () => {
    expect(lerDataSaoPaulo("22/09/2026, 17:10:23")!.toISOString()).toBe("2026-09-22T20:10:23.000Z");
    expect(lerDataSaoPaulo("32/09/2026, 10:00:00")).toBeNull();
  });
});

describe("comentários do acervo", () => {
  it("separa por autor e hora", () => {
    const comentarios = lerComentarios("[18/09/26 - 13:11 — Monica Diniz] Por gentileza reagendar\n\n[18/09/26 - 13:31 — Kevyn Alves] iremos reagendar");
    expect(comentarios).toHaveLength(2);
    expect(comentarios[0].autor).toBe("Monica Diniz");
    expect(comentarios[0].texto).toBe("Por gentileza reagendar");
    expect(comentarios[0].quando!.toISOString()).toBe("2026-09-18T16:11:00.000Z");
    expect(comentarios[1].autor).toBe("Kevyn Alves");
  });

  it("não perde um comentário sem cabeçalho", () => {
    const [solto] = lerComentarios("anotação sem autor");
    expect(solto.texto).toBe("anotação sem autor");
    expect(solto.quando).toBeNull();
  });

  it("ignora campo vazio", () => {
    expect(lerComentarios("   ")).toEqual([]);
  });
});

describe("linha do tempo reconstruída", () => {
  /**
   * O histórico importado precisa ser um caminho que o portal saberia produzir.
   * A única exceção é backlog -> concluída, que é como a própria tratativa
   * fecha a nota (server/db.ts, treatBacklogAppointment) sem passar pelo grafo.
   */
  const caminhoValido = (eventos: { anterior: AppointmentStatus | null; proximo: AppointmentStatus }[]) =>
    eventos.every(evento => {
      if (evento.anterior === null) return evento.proximo === "pending";
      if (evento.anterior === "backlog" && evento.proximo === "completed") return true;
      return canTransitionAppointment(evento.anterior, evento.proximo);
    });

  it("para na data agendada quando a nota ainda não foi entregue", () => {
    const eventos = montarEventos(linha({ ultimoStatus: "Agendada" }), "scheduled", null);
    expect(eventos.map(evento => evento.proximo)).toEqual(["pending", "scheduled"]);
    expect(caminhoValido(eventos)).toBe(true);
  });

  it("vai até a conclusão quando a nota fechou", () => {
    const eventos = montarEventos(linha(), "completed", null);
    expect(eventos.map(evento => evento.proximo)).toEqual(["pending", "scheduled", "received", "completed"]);
    expect(caminhoValido(eventos)).toBe(true);
  });

  it("registra a passagem pelo backlog quando o relatório de backlog entra junto", () => {
    const eventos = montarEventos(linha(), "completed", episodio());
    expect(eventos.map(evento => evento.proximo)).toEqual(["pending", "scheduled", "backlog", "completed"]);
    expect(eventos[2].quando.toISOString()).toBe("2026-09-04T12:00:00.000Z");
    expect(caminhoValido(eventos)).toBe(true);
  });

  it("volta pelo agendamento quando a nota saiu do backlog e foi recebida", () => {
    const eventos = montarEventos(linha({ ultimoStatus: "Recebida" }), "received", episodio());
    expect(eventos.map(evento => evento.proximo)).toEqual(["pending", "scheduled", "backlog", "scheduled", "received"]);
    expect(caminhoValido(eventos)).toBe(true);
  });

  it("para no backlog quando a nota continua travada", () => {
    const eventos = montarEventos(linha({ ultimoStatus: "Backlog" }), "backlog", episodio({ saiuEm: null }));
    expect(eventos.map(evento => evento.proximo)).toEqual(["pending", "scheduled", "backlog"]);
    expect(caminhoValido(eventos)).toBe(true);
  });

  it("nunca deixa um evento anterior ao outro, mesmo com data torta na origem", () => {
    // 15 notas do acervo têm agendamento anterior à criação.
    const eventos = montarEventos(linha({ dataAgendamento: lerDataSaoPaulo("20/08/2026, 10:00:00")! }), "completed", null);
    const momentos = eventos.map(evento => evento.quando.getTime());
    expect([...momentos].sort((a, b) => a - b)).toEqual(momentos);
  });
});

describe("tradução do acervo", () => {
  it("todo status da origem vira um status do portal", () => {
    expect(Object.values(STATUS_AGILIZA).sort()).toEqual(["backlog", "completed", "received", "scheduled"]);
  });

  it("todo motivo traduzido existe na lista fechada do portal", () => {
    const conhecidos = new Set(MOTIVOS_DE_BACKLOG.map(motivo => motivo.codigo));
    for (const codigo of Object.values(MOTIVOS_DO_AGILIZA)) expect(conhecidos.has(codigo)).toBe(true);
  });

  it("não manda dois motivos da origem para o mesmo código, que apagaria a diferença", () => {
    const destinos = Object.values(MOTIVOS_DO_AGILIZA);
    expect(new Set(destinos).size).toBe(destinos.length);
  });
});
