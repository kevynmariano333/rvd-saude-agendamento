import { formatSaoPauloDateKey } from "@shared/dateFilters";

export function toggleTodayFilter(currentDate: string | null, today: string) {
  return currentDate === today ? "" : today;
}

export function belongsToDailyAgenda(item: { scheduledFor?: Date | string | null; createdAt?: Date | string | null; updatedAt?: Date | string | null }, dateKey: string) {
  return [item.scheduledFor, item.createdAt, item.updatedAt]
    .filter((value): value is Date | string => Boolean(value))
    .some(value => formatSaoPauloDateKey(new Date(value)) === dateKey);
}
