import { getDocs, collection, doc, getDoc, getDocFromServer, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { SeasonConfig } from '@/types';
import { getTrustedNow, isDeadlinePassed } from './serverTime';
import { parseIsraelDateTime } from './israelTime';
import { getCached, invalidateCache, CACHE_TTL } from './firestoreCache';
import {
  sortRoundsByStartTime,
  sortMatchesByStartTime,
  getNextRoundByStartTime,
  type RoundSummary,
} from './sorting';
import {
  type ActiveRoundBetting,
  getOpenRoundsForUser,
  summaryToActiveRound,
} from './activeBettingRounds';

const SEASON_CONFIG_PATH = 'config/season';

let activeSeasonOverride: string | null = null;

export function setActiveSeasonId(seasonId: string | null) {
  activeSeasonOverride = seasonId;
}

export function getCalendarSeason(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (currentMonth >= 6) {
    return `${currentYear}-${currentYear + 1}`;
  }
  return `${currentYear - 1}-${currentYear}`;
}

export function getCurrentSeason(): string {
  return activeSeasonOverride ?? getCalendarSeason();
}

export function getSeasonPath(): string {
  return `season/${getCurrentSeason()}`;
}

export function formatSeasonDisplay(seasonId: string): string {
  return seasonId.replace('-', '/');
}

export function getNextSeasonId(seasonId: string): string {
  const startYear = parseInt(seasonId.split('-')[0], 10);
  return `${startYear + 1}-${startYear + 2}`;
}

export function sortSeasonIdsDesc(seasonIds: string[]): string[] {
  return [...seasonIds].sort((a, b) => {
    const yearA = parseInt(a.split('-')[0], 10);
    const yearB = parseInt(b.split('-')[0], 10);
    return yearB - yearA;
  });
}

type RawSeasonConfig = Partial<SeasonConfig> & {
  previousSeasonId?: string;
  /** @deprecated legacy field name — use seasonOpen */
  open?: boolean | string;
  seasonOpen?: boolean | string;
};

function parseSeasonOpenFlag(data: RawSeasonConfig): boolean {
  const value = data.seasonOpen ?? data.open;
  if (value === true || value === 'true') return true;
  return false;
}

export function normalizeSeasonConfig(data: RawSeasonConfig): SeasonConfig {
  const calendarSeason = getCalendarSeason();
  let previousSeasonIds = data.previousSeasonIds;

  if (!previousSeasonIds && data.previousSeasonId) {
    previousSeasonIds = [data.previousSeasonId];
  }

  return {
    activeSeasonId: data.activeSeasonId ?? calendarSeason,
    seasonOpen: parseSeasonOpenFlag(data),
    previousSeasonIds: sortSeasonIdsDesc(previousSeasonIds ?? []),
  };
}

function getDefaultSeasonConfig(): SeasonConfig {
  const calendarSeason = getCalendarSeason();
  return {
    activeSeasonId: calendarSeason,
    seasonOpen: false,
    previousSeasonIds: [],
  };
}

export async function getSeasonConfig(): Promise<SeasonConfig> {
  try {
    const configRef = doc(db, SEASON_CONFIG_PATH);
    const configDoc = await getDocFromServer(configRef);

    if (configDoc.exists()) {
      const data = normalizeSeasonConfig(configDoc.data() as RawSeasonConfig);
      setActiveSeasonId(data.activeSeasonId);
      return data;
    }

    const defaultConfig = getDefaultSeasonConfig();
    setActiveSeasonId(defaultConfig.activeSeasonId);
    return defaultConfig;
  } catch (error) {
    console.error('Error getting season config from server:', error);
    const defaultConfig = getDefaultSeasonConfig();
    setActiveSeasonId(defaultConfig.activeSeasonId);
    return defaultConfig;
  }
}

export async function listSeasonIds(): Promise<string[]> {
  return getCached('seasonList', CACHE_TTL.seasonList, async () => {
    const snapshot = await getDocs(collection(db, 'season'));
    const ids = snapshot.docs.map((seasonDoc) => seasonDoc.id);
    return sortSeasonIdsDesc(ids);
  });
}

export async function setActiveSeason(seasonId: string): Promise<void> {
  const config = await getSeasonConfig();
  const updated: SeasonConfig = {
    ...config,
    activeSeasonId: seasonId,
  };

  await setDoc(doc(db, SEASON_CONFIG_PATH), updated);
  setActiveSeasonId(seasonId);
  invalidateCache('seasonConfig');
  invalidateCache(`rounds:season/${seasonId}`);
  invalidateCache(`homeRoundInfo:season/${seasonId}`);
}

export async function setSeasonOpen(open: boolean): Promise<void> {
  const config = await getSeasonConfig();
  const updated: SeasonConfig = {
    ...config,
    seasonOpen: open,
  };

  await setDoc(doc(db, SEASON_CONFIG_PATH), updated);
  invalidateCache('seasonConfig');
}

export async function openNewSeason(newSeasonId: string): Promise<void> {
  const config = await getSeasonConfig();
  const previousActive = config.activeSeasonId;

  const seasonRef = doc(db, 'season', newSeasonId);
  const existingSeason = await getDoc(seasonRef);

  if (!existingSeason.exists()) {
    await setDoc(seasonRef, {
      seasonStart: '',
      createdAt: new Date().toISOString(),
    });
  }

  const previousSeasonIds = sortSeasonIdsDesc([
    previousActive,
    ...config.previousSeasonIds.filter((id) => id !== previousActive && id !== newSeasonId),
  ]);

  const updatedConfig: SeasonConfig = {
    activeSeasonId: newSeasonId,
    seasonOpen: true,
    previousSeasonIds,
  };

  await setDoc(doc(db, SEASON_CONFIG_PATH), updatedConfig);
  setActiveSeasonId(newSeasonId);
  invalidateCache('seasonConfig');
  invalidateCache('seasonList');
  invalidateCache(`season/${newSeasonId}`);
  invalidateCache(`season/${previousActive}`);
  invalidateCache(`rounds:season/${newSeasonId}`);
}

export async function getCurrentSeasonData() {
  const currentSeason = getCurrentSeason();
  const cacheKey = `seasonDoc:${currentSeason}`;

  return getCached(cacheKey, CACHE_TTL.seasonDoc, async () => {
    try {
      const seasonRef = doc(db, 'season', currentSeason);
      const seasonDoc = await getDoc(seasonRef);
      return seasonDoc.exists() ? seasonDoc.data() : null;
    } catch (error) {
      console.error('Error getting season data:', error);
      return null;
    }
  });
}

export function parseSeasonStartField(seasonStart: unknown): string | null {
  if (!seasonStart) return null;
  if (typeof seasonStart === 'string') return seasonStart;
  if (
    typeof seasonStart === 'object' &&
    seasonStart !== null &&
    'toDate' in seasonStart &&
    typeof (seasonStart as { toDate: () => Date }).toDate === 'function'
  ) {
    return (seasonStart as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function getSortedRounds(seasonPath?: string): Promise<RoundSummary[]> {
  const path = seasonPath ?? getSeasonPath();
  const cacheKey = `rounds:${path}`;

  return getCached(cacheKey, CACHE_TTL.rounds, async () => {
    const roundsSnapshot = await getDocs(collection(db, path, 'rounds'));
    const rounds = roundsSnapshot.docs.map((roundDoc) => ({
      number: parseInt(roundDoc.id, 10),
      startTime: roundDoc.data().startTime || '',
      name: roundDoc.data().name,
      fullyCalculated: roundDoc.data().fullyCalculated === true,
    }));
    return sortRoundsByStartTime(rounds);
  });
}

export async function getSortedMatchesForRound(seasonPath: string, roundNumber: number) {
  const cacheKey = `matches:${seasonPath}:${roundNumber}`;

  return getCached(cacheKey, CACHE_TTL.matches, async () => {
    const matchesSnapshot = await getDocs(
      collection(db, seasonPath, 'rounds', roundNumber.toString(), 'matches')
    );
    const matches = matchesSnapshot.docs.map((matchDoc) => ({
      uid: matchDoc.id,
      startTime: matchDoc.data().startTime as string | undefined,
      date: matchDoc.data().date as string | undefined,
      ...matchDoc.data(),
    }));
    return sortMatchesByStartTime(matches);
  });
}

export function resolveCurrentRound(rounds: RoundSummary[]): number | null {
  if (rounds.length === 0) return null;

  const now = getTrustedNow();

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const nextRound = rounds[i + 1];

    if (round.startTime) {
      if (!nextRound || now < parseIsraelDateTime(nextRound.startTime)) {
        return round.number;
      }
    }
  }

  return null;
}

export interface HomeRoundInfo {
  currentRoundNumber: number | null;
  currentRoundName: string;
  nextRoundTime: string;
}

export async function getHomeRoundInfo(seasonId?: string): Promise<HomeRoundInfo> {
  const path = seasonId ? `season/${seasonId}` : getSeasonPath();
  const cacheKey = `homeRoundInfo:${path}`;

  return getCached(cacheKey, CACHE_TTL.homeSummary, async () => {
    const rounds = await getSortedRounds(path);
    const currentRoundNumber = resolveCurrentRound(rounds);
    const currentRound = rounds.find((round) => round.number === currentRoundNumber);

    let nextRoundTime = '';
    if (currentRoundNumber !== null) {
      const nextRound = getNextRoundByStartTime(rounds, currentRoundNumber);
      if (nextRound?.startTime) {
        nextRoundTime = new Date(nextRound.startTime).toLocaleString('he-IL');
      }
    }

    return {
      currentRoundNumber,
      currentRoundName: currentRound?.name || (currentRoundNumber ? `מחזור ${currentRoundNumber}` : ''),
      nextRoundTime,
    };
  });
}

export const getCurrentRound = async (
  seasonId?: string,
  userId?: string | null
): Promise<number | null> => {
  return getPrimaryRound(seasonId, userId);
};

async function isRoundFullyCalculated(seasonPath: string, roundNumber: number): Promise<boolean> {
  const matches = await getSortedMatchesForRound(seasonPath, roundNumber);
  const activeMatches = matches.filter(
    (match) => !(match as { isCancelled?: boolean }).isCancelled
  );

  if (activeMatches.length === 0) {
    return false;
  }

  return activeMatches.every(
    (match) => (match as { pointsCalculated?: boolean }).pointsCalculated === true
  );
}

export const getLastCalculatedRound = async (): Promise<number | null> => {
  try {
    const calculated = await getFullyCalculatedRounds();
    if (calculated.length === 0) return null;
    return calculated[calculated.length - 1];
  } catch (error) {
    console.error('Error getting last calculated round:', error);
    return null;
  }
};

/** Round numbers where all active matches have results and points calculated. */
export async function getFullyCalculatedRounds(seasonId?: string): Promise<number[]> {
  const path = seasonId ? `season/${seasonId}` : getSeasonPath();
  const cacheKey = `fullyCalculated:${path}`;

  return getCached(cacheKey, CACHE_TTL.rounds, async () => {
    const roundsSnapshot = await getDocs(collection(db, path, 'rounds'));
    const sortedRounds = sortRoundsByStartTime(
      roundsSnapshot.docs.map((roundDoc) => ({
        number: parseInt(roundDoc.id, 10),
        startTime: roundDoc.data().startTime || '',
        name: roundDoc.data().name,
        fullyCalculated: roundDoc.data().fullyCalculated === true,
      }))
    );

    const calculated = new Set<number>();
    const legacyCheck: number[] = [];

    for (const round of sortedRounds) {
      if (round.fullyCalculated) {
        calculated.add(round.number);
      } else {
        legacyCheck.push(round.number);
      }
    }

    if (legacyCheck.length > 0) {
      const legacyResults = await Promise.all(
        legacyCheck.map(async (roundNumber) => ({
          roundNumber,
          ok: await isRoundFullyCalculated(path, roundNumber),
        }))
      );
      for (const { roundNumber, ok } of legacyResults) {
        if (ok) calculated.add(roundNumber);
      }
    }

    return sortedRounds
      .filter((round) => calculated.has(round.number))
      .map((round) => round.number);
  });
}

export async function getActiveBettingRounds(
  seasonId?: string,
  userId?: string | null
): Promise<ActiveRoundBetting[]> {
  const path = seasonId ? `season/${seasonId}` : getSeasonPath();
  const roundsSnapshot = await getDocs(collection(db, path, 'rounds'));

  const allRounds = roundsSnapshot.docs.map((roundDoc) => {
    const data = roundDoc.data();
    return summaryToActiveRound(
      {
        number: parseInt(roundDoc.id, 10),
        startTime: data.startTime || '',
        name: data.name,
      },
      data.bettingExtensions as Record<string, string> | undefined
    );
  });

  return getOpenRoundsForUser(allRounds, userId);
}

/**
 * Primary round for betting pages: earliest open betting deadline first.
 * Falls back to the in-progress round by timeline when none are open.
 */
export async function getPrimaryRound(
  seasonId?: string,
  userId?: string | null
): Promise<number | null> {
  try {
    const openRounds = await getActiveBettingRounds(seasonId, userId);
    if (openRounds.length > 0) {
      return openRounds[0].number;
    }

    const path = seasonId ? `season/${seasonId}` : getSeasonPath();
    const sortedRounds = await getSortedRounds(path);
    return resolveCurrentRound(sortedRounds);
  } catch (error) {
    console.error('Error getting primary round:', error);
    return null;
  }
}

export const getDefaultBettingRound = async (
  userId?: string | null
): Promise<number | null> => {
  return getPrimaryRound(undefined, userId);
};

/**
 * Default round for all-users bets view: the most recent round whose global
 * betting window has closed (by startTime), so users see results from the
 * last playable round — not the round still open for betting.
 */
export async function getDefaultAllUsersBetsRound(
  seasonId?: string
): Promise<number | null> {
  try {
    const path = seasonId ? `season/${seasonId}` : getSeasonPath();
    const sortedRounds = await getSortedRounds(path);

    if (sortedRounds.length === 0) {
      return null;
    }

    let lastClosedRound: number | null = null;

    for (const round of sortedRounds) {
      if (round.startTime && isDeadlinePassed(round.startTime)) {
        lastClosedRound = round.number;
      }
    }

    return lastClosedRound ?? sortedRounds[0].number;
  } catch (error) {
    console.error('Error getting default all-users bets round:', error);
    return null;
  }
}
