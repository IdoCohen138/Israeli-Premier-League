const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;

/** 23:30 < msUntil <= 24:45 */
export const TWENTY_FOUR_H_WINDOW_MIN_MS = 23 * MS_HOUR + 30 * MS_MINUTE;
export const TWENTY_FOUR_H_WINDOW_MAX_MS = 24 * MS_HOUR + 45 * MS_MINUTE;

/** 45 min < msUntil <= 75 min */
export const ONE_H_WINDOW_MIN_MS = 45 * MS_MINUTE;
export const ONE_H_WINDOW_MAX_MS = 75 * MS_MINUTE;

/**
 * Returns reminder bucket for idempotency (24h / 1h).
 * Email body/subject still use actual msUntil at send time.
 */
export function getReminderWindow(msUntilDeadline) {
  if (msUntilDeadline <= 0) return null;

  if (
    msUntilDeadline > ONE_H_WINDOW_MIN_MS &&
    msUntilDeadline <= ONE_H_WINDOW_MAX_MS
  ) {
    return '1h';
  }

  if (
    msUntilDeadline > TWENTY_FOUR_H_WINDOW_MIN_MS &&
    msUntilDeadline <= TWENTY_FOUR_H_WINDOW_MAX_MS
  ) {
    return '24h';
  }

  return null;
}

export function describeReminderWindows() {
  return {
    '24h': `${TWENTY_FOUR_H_WINDOW_MIN_MS / MS_MINUTE} – ${TWENTY_FOUR_H_WINDOW_MAX_MS / MS_MINUTE} minutes before close (exclusive min)`,
    '1h': `${ONE_H_WINDOW_MIN_MS / MS_MINUTE} – ${ONE_H_WINDOW_MAX_MS / MS_MINUTE} minutes before close (exclusive min)`,
  };
}
