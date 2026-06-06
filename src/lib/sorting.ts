export interface RoundSummary {
  number: number;
  startTime: string;
  name?: string;
}

import { getStartTimeValue, parseIsraelDateTime } from './israelTime';

function getMatchSortTime(match: { startTime?: string; date?: string }): number {
  if (match.startTime) {
    const time = parseIsraelDateTime(match.startTime).getTime();
    if (!isNaN(time)) return time;
  }
  if (match.date) {
    const time = parseIsraelDateTime(match.date).getTime();
    if (!isNaN(time)) return time;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function sortRoundsByStartTime<T extends { startTime?: string; number?: number }>(
  rounds: T[]
): T[] {
  return [...rounds].sort((a, b) => {
    const timeDiff = getStartTimeValue(a.startTime) - getStartTimeValue(b.startTime);
    if (timeDiff !== 0) return timeDiff;
    return (a.number ?? 0) - (b.number ?? 0);
  });
}

export function sortMatchesByStartTime<T extends { startTime?: string; date?: string }>(
  matches: T[]
): T[] {
  return [...matches].sort((a, b) => getMatchSortTime(a) - getMatchSortTime(b));
}

export function getRoundIndexInOrder(
  sortedRounds: RoundSummary[],
  roundNumber: number
): number {
  return sortedRounds.findIndex((round) => round.number === roundNumber);
}

export function getNextRoundByStartTime(
  sortedRounds: RoundSummary[],
  currentRoundNumber: number
): RoundSummary | null {
  const index = getRoundIndexInOrder(sortedRounds, currentRoundNumber);
  if (index < 0 || index >= sortedRounds.length - 1) return null;
  return sortedRounds[index + 1];
}

export function getPreviousRoundByStartTime(
  sortedRounds: RoundSummary[],
  currentRoundNumber: number
): RoundSummary | null {
  const index = getRoundIndexInOrder(sortedRounds, currentRoundNumber);
  if (index <= 0) return null;
  return sortedRounds[index - 1];
}
