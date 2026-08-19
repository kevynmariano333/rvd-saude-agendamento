const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAO_PAULO_OFFSET = "-03:00";

export function formatSaoPauloDateKey(value: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getSaoPauloDayRange(dateKey: string) {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  return {
    start: new Date(`${dateKey}T00:00:00.000${SAO_PAULO_OFFSET}`),
    end: new Date(`${dateKey}T23:59:59.999${SAO_PAULO_OFFSET}`),
  };
}
