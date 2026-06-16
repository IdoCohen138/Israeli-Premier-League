import { parseIsraelDateTime } from './israelTime';
import { getTrustedNow, isBettingOpenForUser } from './serverTime';
import type { RoundSummary } from './sorting';

const HOURS_60 = 60;

export interface ActiveRoundBetting {
  number: number;
  name: string;
  startTime: string;
  bettingExtensions?: Record<string, string>;
}

export function isRoundOpenForUser(
  round: Pick<ActiveRoundBetting, 'startTime' | 'bettingExtensions'>,
  userId?: string | null
): boolean {
  if (!round.startTime) return true;
  return isBettingOpenForUser(round.startTime, userId, round.bettingExtensions);
}

export function isRoundGloballyOpen(
  round: Pick<ActiveRoundBetting, 'startTime'>,
  now = getTrustedNow()
): boolean {
  if (!round.startTime) return true;
  const deadline = parseIsraelDateTime(round.startTime);
  return !isNaN(deadline.getTime()) && now < deadline;
}

export function getHoursBetweenDeadlines(
  earlier: Pick<ActiveRoundBetting, 'startTime'>,
  later: Pick<ActiveRoundBetting, 'startTime'>
): number | null {
  if (!earlier.startTime || !later.startTime) return null;
  const earlierMs = parseIsraelDateTime(earlier.startTime).getTime();
  const laterMs = parseIsraelDateTime(later.startTime).getTime();
  if (isNaN(earlierMs) || isNaN(laterMs)) return null;
  return (laterMs - earlierMs) / (1000 * 60 * 60);
}

/** All rounds open for the user, sorted by betting deadline (earliest first). */
export function getOpenRoundsForUser(
  rounds: ActiveRoundBetting[],
  userId?: string | null
): ActiveRoundBetting[] {
  return rounds
    .filter((round) => isRoundOpenForUser(round, userId))
    .sort((a, b) => {
      const aTime = a.startTime ? parseIsraelDateTime(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.startTime ? parseIsraelDateTime(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}

export interface RoundNavigationUnit {
  roundNumbers: number[];
  isGrouped: boolean;
}

type RoundTimelineEntry = Pick<RoundSummary, 'number' | 'startTime'>;

/**
 * Group consecutive rounds whose deadlines are all within 60h of the cluster
 * anchor (the earliest deadline in the group) — not transitively via neighbors.
 *
 * Example: R30 May 2 20:00, R31 May 3 19:30 (~24h), R32 May 5 20:10 (~72h from R30)
 * → [30, 31] grouped, [32] alone — even though R31→R32 is under 60h.
 */
export function buildRoundNavigationUnits(rounds: RoundTimelineEntry[]): RoundNavigationUnit[] {
  const units: RoundNavigationUnit[] = [];
  let i = 0;

  while (i < rounds.length) {
    const anchor = rounds[i];
    const cluster: RoundTimelineEntry[] = [anchor];
    let j = i;

    while (j + 1 < rounds.length) {
      const hoursFromAnchor = getHoursBetweenDeadlines(
        { startTime: anchor.startTime || '' },
        { startTime: rounds[j + 1].startTime || '' }
      );
      if (hoursFromAnchor !== null && hoursFromAnchor >= 0 && hoursFromAnchor < HOURS_60) {
        cluster.push(rounds[j + 1]);
        j += 1;
      } else {
        break;
      }
    }

    units.push({
      roundNumbers: cluster.map((round) => round.number),
      isGrouped: cluster.length > 1,
    });
    i = j + 1;
  }

  return units;
}

export function findNavigationUnitIndex(
  units: RoundNavigationUnit[],
  roundNumber: number
): number {
  const index = units.findIndex((unit) => unit.roundNumbers.includes(roundNumber));
  return index >= 0 ? index : 0;
}

export function formatNavigationUnitLabel(
  unit: RoundNavigationUnit,
  labelForRound: (roundNumber: number) => string
): string {
  return unit.roundNumbers.map(labelForRound).join(' · ');
}

/**
 * Home card: open rounds in the same anchor-based 60h cluster as the earliest open round.
 */
export function getHomeDisplayRounds(
  openRounds: ActiveRoundBetting[],
  allSortedRounds: RoundTimelineEntry[]
): ActiveRoundBetting[] {
  if (openRounds.length === 0) return [];

  const firstOpen = openRounds[0];
  const units = buildRoundNavigationUnits(allSortedRounds);
  const unit = units.find((u) => u.roundNumbers.includes(firstOpen.number));

  if (!unit || !unit.isGrouped) {
    return [firstOpen];
  }

  const openInCluster = openRounds.filter((round) => unit.roundNumbers.includes(round.number));
  return openInCluster.length > 0 ? openInCluster : [firstOpen];
}

export function summaryToActiveRound(
  summary: RoundSummary,
  extensions?: Record<string, string>
): ActiveRoundBetting {
  return {
    number: summary.number,
    name: summary.name || `מחזור ${summary.number}`,
    startTime: summary.startTime || '',
    bettingExtensions: extensions,
  };
}
