export function toggleTodayFilter(currentDate: string | null, today: string) {
  return currentDate === today ? "" : today;
}
