import { describe, expect, it } from "vitest";
import { calendarDateKey, getMonthCalendarDays, groupCalendarEntriesByDay } from "./monthCalendar";

describe("calendário mensal", () => {
  it("monta seis semanas iniciando no domingo anterior ao mês", () => {
    const days = getMonthCalendarDays(new Date(2026, 7, 12));
    expect(days).toHaveLength(42);
    expect(calendarDateKey(days[0]!)).toBe("2026-07-26");
    expect(calendarDateKey(days[41]!)).toBe("2026-09-05");
  });

  it("agrupa os agendamentos pela respectiva data", () => {
    const grouped = groupCalendarEntriesByDay([
      { id: 1, scheduledFor: new Date(2026, 7, 22, 8, 0) },
      { id: 2, scheduledFor: new Date(2026, 7, 22, 10, 0) },
      { id: 3, scheduledFor: new Date(2026, 7, 23, 8, 0) },
    ]);
    expect(grouped.get("2026-08-22")?.map(item => item.id)).toEqual([1, 2]);
    expect(grouped.get("2026-08-23")?.map(item => item.id)).toEqual([3]);
  });
});
