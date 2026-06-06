import { getDocs, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { SeasonConfig } from '@/types';
import { getTrustedNow } from './serverTime';
import { parseIsraelDateTime } from './israelTime';
import { getCached, invalidateCache, CACHE_TTL } from './firestoreCache';
import {
  sortRoundsByStartTime,
  sortMatchesByStartTime,
  getNextRoundByStartTime,
  type RoundSummary,
} from './sorting';

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

type RawSeasonConfig = Partial<SeasonConfig> & { previousSeasonId?: string };

export function normalizeSeasonConfig(data: RawSeasonConfig): SeasonConfig {
  const calendarSeason = getCalendarSeason();
  let previousSeasonIds = data.previousSeasonIds;

  if (!previousSeasonIds && data.previousSeasonId) {
    previousSeasonIds = [data.previousSeasonId];
  }

  return {
    activeSeasonId: data.activeSeasonId ?? calendarSeason,
    seasonOpen: data.seasonOpen ?? false,
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
  return getCached('seasonConfig', CACHE_TTL.seasonDoc, async () => {
    try {
      const configRef = doc(db, SEASON_CONFIG_PATH);
      const configDoc = await getDoc(configRef);

      if (configDoc.exists()) {
        const data = normalizeSeasonConfig(configDoc.data() as RawSeasonConfig);
        setActiveSeasonId(data.activeSeasonId);
        return data;
      }

      const defaultConfig = getDefaultSeasonConfig();
      setActiveSeasonId(defaultConfig.activeSeasonId);
      return defaultConfig;
    } catch (error) {
      console.error('Error getting season config:', error);
      const defaultConfig = getDefaultSeasonConfig();
      setActiveSeasonId(defaultConfig.activeSeasonId);
      return defaultConfig;
    }
  });
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

export async function getSortedRounds(seasonPath?: string): Promise<RoundSummary[]> {
  const path = seasonPath ?? getSeasonPath();
  const cacheKey = `rounds:${path}`;

  return getCached(cacheKey, CACHE_TTL.rounds, async () => {
    const roundsSnapshot = await getDocs(collection(db, path, 'rounds'));
    const rounds = roundsSnapshot.docs.map((roundDoc) => ({
      number: parseInt(roundDoc.id),
      startTime: roundDoc.data().startTime || '',
      name: roundDoc.data().name,
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

function resolveCurrentRound(rounds: RoundSummary[]): number | null {
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

export const getCurrentRound = async (): Promise<number | null> => {
  try {
    const rounds = await getSortedRounds();
    return resolveCurrentRound(rounds);
  } catch (error) {
    console.error('Error getting current round:', error);
    return null;
  }
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
    const seasonPath = getSeasonPath();
    const sortedRounds = await getSortedRounds(seasonPath);

    if (sortedRounds.length === 0) {
      return null;
    }

    let lastCalculated: number | null = null;

    for (const round of sortedRounds) {
      if (await isRoundFullyCalculated(seasonPath, round.number)) {
        lastCalculated = round.number;
      }
    }

    return lastCalculated;
  } catch (error) {
    console.error('Error getting last calculated round:', error);
    return null;
  }
};

export const getDefaultBettingRound = async (): Promise<number | null> => {
  try {
    const sortedRounds = await getSortedRounds();

    if (sortedRounds.length === 0) {
      return null;
    }

    const now = getTrustedNow();
    const seasonPath = getSeasonPath();
    let lastCalculatedRoundNumber: number | null = null;

    for (const round of sortedRounds) {
      if (await isRoundFullyCalculated(seasonPath, round.number)) {
        lastCalculatedRoundNumber = round.number;
      }
    }

    if (lastCalculatedRoundNumber !== null) {
      const currentIndex = sortedRounds.findIndex(
        (round) => round.number === lastCalculatedRoundNumber
      );
      if (currentIndex >= 0 && currentIndex < sortedRounds.length - 1) {
        return sortedRounds[currentIndex + 1].number;
      }
    }

    const openBettingRound = sortedRounds.find(
      (round) => !round.startTime || now < parseIsraelDateTime(round.startTime)
    );
    if (openBettingRound) {
      return openBettingRound.number;
    }

    return resolveCurrentRound(sortedRounds);
  } catch (error) {
    console.error('Error getting default betting round:', error);
    return null;
  }
};
