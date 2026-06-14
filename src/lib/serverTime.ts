import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { formatTimeRemaining, parseIsraelDateTime, formatIsraelDateTime, type DateInput } from './israelTime';

export const BETTING_CLOSED_ERROR = 'BETTING_CLOSED';

let clockOffsetMs = 0;
let syncPromise: Promise<void> | null = null;
let lastSyncAt = 0;

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

async function fetchIsraelTimeFromApi(): Promise<Date> {
  const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Jerusalem');
  if (!response.ok) {
    throw new Error('Failed to fetch Israel time');
  }
  const data = await response.json();
  return new Date(data.datetime);
}

async function syncServerTime(userId: string): Promise<void> {
  const beforeRequest = Date.now();
  const syncRef = doc(db, 'users', userId, '_meta', 'timeSync');

  try {
    await setDoc(syncRef, { ping: serverTimestamp() }, { merge: true });
    const snapshot = await getDoc(syncRef);
    const ping = snapshot.data()?.ping;

    if (ping instanceof Timestamp) {
      const afterRequest = Date.now();
      const roundTripMs = afterRequest - beforeRequest;
      clockOffsetMs = ping.toMillis() - (beforeRequest + roundTripMs / 2);
      lastSyncAt = Date.now();
      return;
    }
  } catch (error) {
    console.warn('Firestore time sync failed, trying fallback API', error);
  }

  try {
    const apiTime = await fetchIsraelTimeFromApi();
    clockOffsetMs = apiTime.getTime() - Date.now();
    lastSyncAt = Date.now();
  } catch (error) {
    console.warn('Failed to sync trusted time, using device clock', error);
    clockOffsetMs = 0;
    lastSyncAt = Date.now();
  }
}

export async function ensureServerTimeSynced(userId?: string): Promise<void> {
  if (!userId) return;

  const shouldResync = Date.now() - lastSyncAt > SYNC_INTERVAL_MS;
  if (!shouldResync && lastSyncAt > 0) return;

  if (!syncPromise) {
    syncPromise = syncServerTime(userId).finally(() => {
      syncPromise = null;
    });
  }

  await syncPromise;
}

export function getTrustedNow(): Date {
  return new Date(Date.now() + clockOffsetMs);
}

export function isDeadlinePassed(deadline: DateInput): boolean {
  const deadlineDate = parseIsraelDateTime(deadline);
  if (isNaN(deadlineDate.getTime())) return false;
  return getTrustedNow().getTime() >= deadlineDate.getTime();
}

export function getMsUntilDeadline(deadline: DateInput): number {
  const deadlineDate = parseIsraelDateTime(deadline);
  if (isNaN(deadlineDate.getTime())) return Number.POSITIVE_INFINITY;
  return deadlineDate.getTime() - getTrustedNow().getTime();
}

export function getRemainingTimeLabel(deadline: DateInput): string {
  return formatTimeRemaining(getMsUntilDeadline(deadline));
}

export function assertBettingOpen(deadline: DateInput): void {
  if (isDeadlinePassed(deadline)) {
    throw new Error(BETTING_CLOSED_ERROR);
  }
}

/**
 * Returns the effective betting deadline for a specific user, taking into account
 * an admin-granted per-user extension. Returns the later of the original deadline
 * and the user's extension.
 */
export function getEffectiveDeadlineForUser(
  deadline: DateInput,
  userId: string | undefined | null,
  extensions: Record<string, string> | undefined | null
): DateInput {
  if (!userId || !extensions) return deadline;
  const userExt = extensions[userId];
  if (!userExt) return deadline;
  if (!deadline) return userExt;
  const originalMs = parseIsraelDateTime(deadline).getTime();
  const extendedMs = parseIsraelDateTime(userExt).getTime();
  if (isNaN(extendedMs)) return deadline;
  return extendedMs > originalMs ? userExt : deadline;
}

export function isBettingOpenForUser(
  deadline: DateInput,
  userId: string | undefined | null,
  extensions: Record<string, string> | undefined | null
): boolean {
  return !isDeadlinePassed(getEffectiveDeadlineForUser(deadline, userId, extensions));
}

export interface BettingWindowStatus {
  isOpen: boolean;
  hasDeadline: boolean;
  remainingLabel: string;
  deadlineLabel: string;
}

export function getBettingWindowStatus(
  deadline: DateInput | null | undefined,
  userId?: string | null,
  extensions?: Record<string, string> | null
): BettingWindowStatus {
  if (!deadline) {
    return {
      isOpen: true,
      hasDeadline: false,
      remainingLabel: '',
      deadlineLabel: '',
    };
  }

  const effectiveDeadline = getEffectiveDeadlineForUser(deadline, userId, extensions);
  const isOpen = !isDeadlinePassed(effectiveDeadline);

  return {
    isOpen,
    hasDeadline: true,
    remainingLabel: isOpen ? getRemainingTimeLabel(effectiveDeadline) : '',
    deadlineLabel: formatIsraelDateTime(effectiveDeadline),
  };
}

export function formatBettingStatusLine(status: BettingWindowStatus): string {
  if (!status.hasDeadline) {
    return 'הימורים פתוחים';
  }
  if (status.isOpen) {
    return status.remainingLabel
      ? `פתוח · נותרו ${status.remainingLabel}`
      : 'הימורים פתוחים';
  }
  if (!status.isOpen) {
    return status.deadlineLabel ? `נסגרו · ${status.deadlineLabel}` : 'הימורים נסגרו';
  }
  return 'הימורים נסגרו';
}
