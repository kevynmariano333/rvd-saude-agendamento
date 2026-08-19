import { describe, expect, it } from "vitest";
import { toggleTodayFilter } from "./agendaFilters";

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

});
