export const ISRAEL_TIMEZONE = 'Asia/Jerusalem';

export type DateInput = string | Date | { toDate?: () => Date } | null | undefined;

export function parseIsraelDateTime(value: DateInput): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value !== 'string') return new Date(NaN);

  const trimmed = value.trim();
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }

  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  const match = withSeconds.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return new Date(trimmed);
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  return israelLocalToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
}

function israelLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  let utcGuess = Date.UTC(year, month - 1, day, hour - 3, minute, second);

  for (let i = 0; i < 5; i++) {
    const parts = getIsraelDateParts(new Date(utcGuess));
    const diff =
      Date.UTC(year, month - 1, day, hour, minute, second) -
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

    if (diff === 0) break;
    utcGuess += diff;
  }

  return new Date(utcGuess);
}

function getIsraelDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function formatIsraelDateTime(value: DateInput): string {
  const date = value instanceof Date ? value : parseIsraelDateTime(value);
  if (isNaN(date.getTime())) return 'תאריך לא תקין';

  return date.toLocaleString('he-IL', {
    timeZone: ISRAEL_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStartTimeValue(startTime?: string): number {
  if (!startTime) return Number.MAX_SAFE_INTEGER;
  const time = parseIsraelDateTime(startTime).getTime();
  return isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '';

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days} ימים ו-${hours} שעות`;
  if (hours > 0) return `${hours} שעות ו-${minutes} דקות`;
  return `${minutes} דקות`;
}
