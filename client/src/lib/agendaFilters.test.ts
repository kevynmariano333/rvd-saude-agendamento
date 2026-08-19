import { describe, expect, it } from "vitest";
import { belongsToDailyAgenda, toggleTodayFilter } from "./agendaFilters";

describe("toggleTodayFilter", () => {
  const today = "2026-08-19";

  it("aplica a data atual quando o filtro diário está inativo", () => {
    expect(toggleTodayFilter("", today)).toBe(today);
  });

  it("remove apenas a data do dia quando o filtro diário está ativo", () => {
    expect(toggleTodayFilter(today, today)).toBe("");
  });

  it("aplica a data de amanhã no mesmo comportamento de atalho alternável", () => {
    expect(toggleTodayFilter(null, "2026-08-20")).toBe("2026-08-20");
  });

  it("inclui a nota registrada hoje mesmo quando ela está marcada para outro dia", () => {
    expect(belongsToDailyAgenda({ createdAt: "2026-08-19T14:18:07.000Z", scheduledFor: "2026-08-20T21:00:00.000Z" }, today)).toBe(true);
  });

  it("inclui a nota que está agendada para hoje", () => {
    expect(belongsToDailyAgenda({ createdAt: "2026-08-18T14:18:07.000Z", scheduledFor: "2026-08-19T21:00:00.000Z" }, today)).toBe(true);
  });

  it("inclui a nota atualizada hoje mesmo quando foi criada e agendada em outro dia", () => {
    expect(belongsToDailyAgenda({ createdAt: "2026-08-18T14:18:07.000Z", scheduledFor: "2026-08-20T21:00:00.000Z", updatedAt: "2026-08-19T14:47:43.000Z" }, today)).toBe(true);
  });
});
