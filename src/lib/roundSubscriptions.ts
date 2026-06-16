import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { invalidateCache } from './firestoreCache';
import { sortRoundsByStartTime, type RoundSummary } from './sorting';
import {
  type ActiveRoundBetting,
  getOpenRoundsForUser,
  summaryToActiveRound,
} from './activeBettingRounds';

function mapSnapshotToSummaries(
  docs: { id: string; data: () => Record<string, unknown> }[]
): RoundSummary[] {
  const rounds = docs.map((roundDoc) => ({
    number: parseInt(roundDoc.id, 10),
    startTime: (roundDoc.data().startTime as string) || '',
    name: roundDoc.data().name as string | undefined,
  }));
  return sortRoundsByStartTime(rounds);
}

function mapSnapshotToActiveRounds(
  docs: { id: string; data: () => Record<string, unknown> }[]
): ActiveRoundBetting[] {
  return docs.map((roundDoc) => {
    const data = roundDoc.data();
    return summaryToActiveRound(
      {
        number: parseInt(roundDoc.id, 10),
        startTime: (data.startTime as string) || '',
        name: data.name as string | undefined,
      },
      data.bettingExtensions as Record<string, string> | undefined
    );
  });
}

/** Live updates when admin changes round dates, names, or extensions. */
export function subscribeToSeasonRounds(
  seasonPath: string,
  onUpdate: (sortedRounds: RoundSummary[], allRounds: ActiveRoundBetting[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, seasonPath, 'rounds'),
    (snapshot) => {
      invalidateCache(`rounds:${seasonPath}`);
      const docs = snapshot.docs;
      onUpdate(mapSnapshotToSummaries(docs), mapSnapshotToActiveRounds(docs));
    },
    (error) => onError?.(error)
  );
}

export function getOpenRoundsFromAll(
  allRounds: ActiveRoundBetting[],
  userId?: string | null
): ActiveRoundBetting[] {
  return getOpenRoundsForUser(allRounds, userId);
}
