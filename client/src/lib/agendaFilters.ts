export function toggleTodayFilter(currentDate: string, today: string) {
  return currentDate === today ? "" : today;
}
