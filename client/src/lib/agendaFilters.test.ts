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
});
