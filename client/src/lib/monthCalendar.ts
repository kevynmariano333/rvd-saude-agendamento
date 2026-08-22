export type DatedCalendarEntry = { scheduledFor: Date | string };

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addCalendarDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addCalendarMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function calendarDateKey(date: Date | string) {
  const normalized = new Date(date);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, "0")}-${String(normalized.getDate()).padStart(2, "0")}`;
}

export function getMonthCalendarDays(reference: Date) {
  const monthStart = startOfMonth(reference);
  const gridStart = addCalendarDays(monthStart, -monthStart.getDay());
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
}

export function groupCalendarEntriesByDay<T extends DatedCalendarEntry>(entries: T[]) {
  return entries.reduce((grouped, entry) => {
    const key = calendarDateKey(entry.scheduledFor);
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
    return grouped;
  }, new Map<string, T[]>());
}
