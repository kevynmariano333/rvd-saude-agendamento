import { describe, expect, it } from "vitest";
import { isScheduledForDate, toggleTodayFilter } from "./agendaFilters";

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

  it("não inclui uma nota de 20/08 no atalho de 19/08", () => {
    expect(isScheduledForDate("2026-08-20T21:00:00.000Z", "2026-08-19")).toBe(false);
  });

  it("inclui uma nota de 20/08 no atalho de 20/08", () => {
    expect(isScheduledForDate("2026-08-20T21:00:00.000Z", "2026-08-20")).toBe(true);
  });

});
