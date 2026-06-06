const MS_24H = 24 * 60 * 60 * 1000;
const MS_1H = 60 * 60 * 1000;
const ONE_H_CATCHUP_MS = 90 * 60 * 1000;
const TWENTY_FOUR_H_CATCHUP_MS = MS_24H + 60 * 60 * 1000;

/**
 * Returns which reminder is due now.
 * Uses wider catch-up bands so a missed 15-min cron tick still sends once (idempotency prevents duplicates).
 */
export function getReminderWindow(msUntilDeadline) {
  if (msUntilDeadline <= 0) return null;

  if (msUntilDeadline <= ONE_H_CATCHUP_MS) {
    return '1h';
  }

  if (msUntilDeadline <= TWENTY_FOUR_H_CATCHUP_MS) {
    return '24h';
  }

  return null;
}

export function describeReminderWindows() {
  return {
    '1h': `0 – ${ONE_H_CATCHUP_MS / 60000} minutes before close`,
    '24h': `${MS_1H / 3600000}h – ${TWENTY_FOUR_H_CATCHUP_MS / 3600000}h before close`,
  };
}
