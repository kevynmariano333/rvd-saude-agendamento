import { formatSaoPauloDateKey } from "@shared/dateFilters";

export function toggleTodayFilter(currentDate: string | null, today: string) {
  return currentDate === today ? "" : today;
}

export function isScheduledForDate(scheduledFor: Date | string, dateKey: string) {
  return formatSaoPauloDateKey(new Date(scheduledFor)) === dateKey;
}
