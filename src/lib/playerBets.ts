import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  getDocs,
  orderBy,
  limit,
  deleteDoc,
  deleteField,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './firebase';
import { PlayerBets, Bet, Match } from '../types';
import { getCurrentSeason, getCurrentSeasonData } from './season';
import { getCached, invalidateCache, CACHE_TTL } from './firestoreCache';
import {
  assertBettingOpen,
  ensureServerTimeSynced,
  getEffectiveDeadlineForUser,
  getTrustedNow,
} from './serverTime';
import { runFirestoreBatches, type FirestoreBatchOp } from './firestoreBatch';
import { computeMatchPointsForUser, type BetScores } from './matchPointsLogic';

// יצירת או עדכון הימורים מקדימים של שחקן
export const savePreSeasonBets = async (
  userId: string, 
  preSeasonBets: PlayerBets['preSeasonBets'],
  displayName?: string
): Promise<void> => {
  try {
    await ensureServerTimeSynced(userId);

    const seasonData = await getCurrentSeasonData();
    if (seasonData?.seasonStart) {
      assertBettingOpen(seasonData.seasonStart);
    }

    const currentSeason = getCurrentSeason();
    const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
    const playerBetsDoc = await getDoc(playerBetsRef);
    
    const now = getTrustedNow();
    
    if (playerBetsDoc.exists()) {
      await updateDoc(playerBetsRef, {
        preSeasonBets,
        displayName,
        updatedAt: now,
      });
    } else {
      const newPlayerBets: PlayerBets = {
        displayName,
        seasonId: currentSeason,
        seasonName: currentSeason,
        createdAt: now,
        updatedAt: now,
        preSeasonBets,
        totalPoints: 0,
        preSeasonPoints: 0,
        roundPoints: {},
        correctPredictions: 0,
        exactPredictions: 0,
      };
      
      await setDoc(playerBetsRef, newPlayerBets);
    }
  } catch (error) {
    console.error('Error saving pre-season bets:', error);
    throw error;
  }
};

// שמירת הימורי מחזור של שחקן
export const saveRoundBets = async (
  userId: string,
  roundNumber: number,
  bets: Bet[],
  displayName?: string
): Promise<void> => {
  try {
    await ensureServerTimeSynced(userId);

    const currentSeason = getCurrentSeason();
    const roundDoc = await getDoc(
      doc(db, 'season', currentSeason, 'rounds', roundNumber.toString())
    );
    const roundData = roundDoc.data();
    const roundStartTime = roundData?.startTime;
    const extensions = (roundData?.bettingExtensions ?? {}) as Record<string, string>;
    if (roundStartTime) {
      const effectiveDeadline = getEffectiveDeadlineForUser(roundStartTime, userId, extensions);
      assertBettingOpen(effectiveDeadline);
    }

    const roundBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
    const roundBetsDoc = await getDoc(roundBetsRef);
    
    const now = getTrustedNow();
    
    // שמירת ההימורים עם נקודות קיימות (אם יש) או איפוס אם זה הימור חדש
    const betsWithPoints = bets.map(bet => ({
      ...bet,
      points: bet.points || 0, // שמירת נקודות קיימות או 0 אם אין
      isExactResult: bet.isExactResult || false,
      isCorrectDirection: bet.isCorrectDirection || false
    }));
    
    if (roundBetsDoc.exists()) {
      await updateDoc(roundBetsRef, {
        bets: betsWithPoints,
        displayName,
        updatedAt: now,
      });
    } else {
      // בדיקה אם המשתמש כבר קיים במערכת
      const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
      const playerBetsDoc = await getDoc(playerBetsRef);
      
      if (!playerBetsDoc.exists()) {
        // יצירת משתמש חדש רק אם הוא לא קיים
        const newPlayerBets: PlayerBets = {
          displayName,
          seasonId: currentSeason,
          seasonName: currentSeason,
          createdAt: now,
          updatedAt: now,
          preSeasonBets: {},
          totalPoints: 0,
          preSeasonPoints: 0,
          roundPoints: {},
          correctPredictions: 0,
          exactPredictions: 0,
        };
        
        await setDoc(playerBetsRef, newPlayerBets);
      } else {
        // עדכון שם התצוגה אם השתנה
        await updateDoc(playerBetsRef, {
          displayName,
          updatedAt: now,
        });
      }
      
      await setDoc(roundBetsRef, {
        bets: betsWithPoints,
        displayName,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error) {
    console.error('Error saving round bets:', error);
    throw error;
  }
};

// קבלת הימורים של שחקן
export const getPlayerBets = async (userId: string): Promise<PlayerBets | null> => {
  try {
    const currentSeason = getCurrentSeason();
    const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
    const playerBetsDoc = await getDoc(playerBetsRef);
    
    if (playerBetsDoc.exists()) {
      const playerData = playerBetsDoc.data() as PlayerBets;
      // הוספת ה-uid כ-document ID
      playerData.uid = playerBetsDoc.id;
      return playerData;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting player bets:', error);
    throw error;
  }
};

// קבלת הימורים מקדימים של שחקן
export const getPlayerPreSeasonBets = async (userId: string): Promise<PlayerBets['preSeasonBets'] | null> => {
  try {
    const playerBets = await getPlayerBets(userId);
    return playerBets?.preSeasonBets || null;
  } catch (error) {
    console.error('Error getting pre-season bets:', error);
    throw error;
  }
};

// קבלת הימורי מחזור של שחקן
export const getPlayerRoundBets = async (userId: string, roundNumber: number): Promise<Bet[] | null> => {
  try {
    const currentSeason = getCurrentSeason();
    const roundBetsDocRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
    const docSnap = await getDoc(roundBetsDocRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return data.bets as Bet[];
  } catch (error) {
    console.error('Error getting round bets:', error);
    throw error;
  }
};

// קבלת טבלת דירוג
export const getLeaderboard = async (seasonId?: string): Promise<PlayerBets[]> => {
  const currentSeason = seasonId ?? getCurrentSeason();
  const cacheKey = `leaderboard:${currentSeason}`;

  return getCached(cacheKey, CACHE_TTL.rounds, async () => {
    try {
      const playerBetsRef = collection(db, 'season', currentSeason, 'playerBets');
      const q = query(playerBetsRef, orderBy('totalPoints', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);

      const leaderboard: PlayerBets[] = [];
      querySnapshot.forEach((playerDoc) => {
        const playerData = playerDoc.data() as PlayerBets;
        playerData.uid = playerDoc.id;
        leaderboard.push(playerData);
      });

      return leaderboard;
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      throw error;
    }
  });
};

// עדכון נקודות של שחקן
export const updatePlayerPoints = async (
  userId: string,
  points: {
    totalPoints?: number;
    preSeasonPoints?: number;
    roundPoints?: Record<number, number>;
    correctPredictions?: number;
    exactPredictions?: number;
    correctPredictionsMap?: Record<number, number>;
    exactPredictionsMap?: Record<number, number>;
  }
): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
    
    // קבלת הנתונים הנוכחיים כדי לוודא שכל השדות קיימים
    const currentDoc = await getDoc(playerBetsRef);
    const currentData = currentDoc.exists() ? currentDoc.data() : {};
    
    // מיזוג המפות החדשות עם הקיימות
    const mergedCorrectPredictionsMap = {
      ...(currentData.correctPredictionsMap || {}),
      ...(points.correctPredictionsMap || {})
    };
    const mergedExactPredictionsMap = {
      ...(currentData.exactPredictionsMap || {}),
      ...(points.exactPredictionsMap || {})
    };
    
    // מיזוג הנתונים החדשים עם הקיימים
    const updatedData = {
      ...currentData,
      ...points,
      correctPredictionsMap: mergedCorrectPredictionsMap,
      exactPredictionsMap: mergedExactPredictionsMap,
      updatedAt: new Date(),
    };
    
    // שימוש ב-setDoc במקום updateDoc כדי לוודא שכל השדות נוצרים
    await setDoc(playerBetsRef, updatedData, { merge: true });
  } catch (error) {
    console.error('Error updating player points:', error);
    throw error;
  }
};

// פתיחה של חלון הימורים למשתמש ספציפי במחזור מסוים (admin only)
export const grantUserBettingExtension = async (
  roundNumber: number,
  targetUserId: string,
  extendedUntilIso: string
): Promise<void> => {
  const currentSeason = getCurrentSeason();
  const roundRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString());
  await updateDoc(roundRef, {
    [`bettingExtensions.${targetUserId}`]: extendedUntilIso,
  });
};

// ביטול הארכה למשתמש ספציפי (admin only)
export const revokeUserBettingExtension = async (
  roundNumber: number,
  targetUserId: string
): Promise<void> => {
  const currentSeason = getCurrentSeason();
  const roundRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString());
  await updateDoc(roundRef, {
    [`bettingExtensions.${targetUserId}`]: deleteField(),
  });
};

// בדיקה אם שחקן כבר הימר על מחזור מסוים
export const hasPlayerBetOnRound = async (userId: string, roundNumber: number): Promise<boolean> => {  try {
    const currentSeason = getCurrentSeason();
    const roundBetDocRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
    const docSnap = await getDoc(roundBetDocRef);
    return docSnap.exists();
  } catch (error) {
    console.error('Error checking if player bet on round:', error);
    throw error;
  }
};

// בדיקה אם שחקן כבר הימר הימורים מקדימים
export const hasPlayerPreSeasonBets = async (userId: string): Promise<boolean> => {
  try {
    const preSeasonBets = await getPlayerPreSeasonBets(userId);
    return !!(preSeasonBets && Object.keys(preSeasonBets).length > 0);
  } catch (error) {
    console.error('Error checking if player has pre-season bets:', error);
    throw error;
  }
};

type AllBetsByMatch = Record<string, Record<string, BetScores>>;

async function loadRoundBetsForPlayers(
  seasonPath: string,
  roundNumber: number,
  playerIds: string[]
): Promise<{
  allBetsForRound: AllBetsByMatch;
  roundBetsByUser: Map<string, { bets: Bet[]; ref: DocumentReference; exists: boolean }>;
}> {
  const allBetsForRound: AllBetsByMatch = {};
  const roundBetsByUser = new Map<
    string,
    { bets: Bet[]; ref: DocumentReference; exists: boolean }
  >();

  const results = await Promise.all(
    playerIds.map(async (userId) => {
      const roundBetsRef = doc(
        db,
        seasonPath,
        'playerBets',
        userId,
        'roundBetsCollection',
        roundNumber.toString()
      );
      const roundBetsDoc = await getDoc(roundBetsRef);
      return { userId, roundBetsRef, roundBetsDoc };
    })
  );

  for (const { userId, roundBetsRef, roundBetsDoc } of results) {
    const bets = roundBetsDoc.exists()
      ? ([...(roundBetsDoc.data().bets || [])] as Bet[])
      : [];
    roundBetsByUser.set(userId, {
      bets,
      ref: roundBetsRef,
      exists: roundBetsDoc.exists(),
    });

    for (const bet of bets) {
      if (!allBetsForRound[bet.matchId]) {
        allBetsForRound[bet.matchId] = {};
      }
      allBetsForRound[bet.matchId][userId] = {
        homeScore: bet.homeScore,
        awayScore: bet.awayScore,
      };
    }
  }

  return { allBetsForRound, roundBetsByUser };
}

interface UserRoundCalcState {
  playerRef: DocumentReference;
  roundBetsRef: DocumentReference;
  playerData: PlayerBets;
  bets: Bet[];
  hasRoundBets: boolean;
  dirtyPlayer: boolean;
  dirtyBets: boolean;
}

function subtractMatchPointsFromUser(
  state: UserRoundCalcState,
  roundNumber: number,
  userBet: Bet
): void {
  if (!userBet.points || userBet.points <= 0) return;

  const pointsToSubtract = userBet.points;
  let correctPredictionsToSubtract = 0;
  let exactPredictionsToSubtract = 0;

  if (userBet.isExactResult) {
    exactPredictionsToSubtract = 1;
  } else if (userBet.isCorrectDirection) {
    correctPredictionsToSubtract = 1;
  }

  const currentRoundPoints = (state.playerData.roundPoints || {})[roundNumber] || 0;
  state.playerData.totalPoints = (state.playerData.totalPoints || 0) - pointsToSubtract;
  state.playerData.roundPoints = {
    ...(state.playerData.roundPoints || {}),
    [roundNumber]: currentRoundPoints - pointsToSubtract,
  };
  state.playerData.correctPredictions =
    (state.playerData.correctPredictions || 0) - correctPredictionsToSubtract;
  state.playerData.exactPredictions =
    (state.playerData.exactPredictions || 0) - exactPredictionsToSubtract;
  state.playerData.correctPredictionsMap = {
    ...(state.playerData.correctPredictionsMap || {}),
    [roundNumber]:
      (state.playerData.correctPredictionsMap?.[roundNumber] || 0) -
      correctPredictionsToSubtract,
  };
  state.playerData.exactPredictionsMap = {
    ...(state.playerData.exactPredictionsMap || {}),
    [roundNumber]:
      (state.playerData.exactPredictionsMap?.[roundNumber] || 0) -
      exactPredictionsToSubtract,
  };
  state.dirtyPlayer = true;
}

// חישוב נקודות למחזור
export const calculateRoundPoints = async (roundNumber: number): Promise<{ hasIncompleteMatches: boolean; incompleteMatches: string[] }> => {
  try {
    const currentSeason = getCurrentSeason();
    const seasonPath = `season/${currentSeason}`;

    const roundRef = doc(db, seasonPath, 'rounds', roundNumber.toString());
    const [roundDoc, matchesSnapshot, playersSnapshot] = await Promise.all([
      getDoc(roundRef),
      getDocs(collection(db, seasonPath, 'rounds', roundNumber.toString(), 'matches')),
      getDocs(collection(db, seasonPath, 'playerBets')),
    ]);

    if (!roundDoc.exists()) {
      throw new Error('Round not found');
    }

    const matches = matchesSnapshot.docs.map(
      (matchDoc) => ({ uid: matchDoc.id, ...matchDoc.data() } as Match)
    );

    const incompleteMatches = matches.filter(
      (match) =>
        !match.isCancelled &&
        (match.actualHomeScore === undefined ||
          match.actualHomeScore === null ||
          match.actualAwayScore === undefined ||
          match.actualAwayScore === null)
    );

    if (incompleteMatches.length > 0) {
      return {
        hasIncompleteMatches: true,
        incompleteMatches: incompleteMatches.map(
          (match) => `${match.homeTeam} vs ${match.awayTeam}`
        ),
      };
    }

    const playerIds = playersSnapshot.docs.map((playerDoc) => playerDoc.id);
    const { allBetsForRound, roundBetsByUser } = await loadRoundBetsForPlayers(
      seasonPath,
      roundNumber,
      playerIds
    );

    const userStates = new Map<string, UserRoundCalcState>();

    for (const playerDoc of playersSnapshot.docs) {
      const userId = playerDoc.id;
      const roundBets = roundBetsByUser.get(userId);
      const playerData = { ...(playerDoc.data() as PlayerBets), uid: userId };

      userStates.set(userId, {
        playerRef: playerDoc.ref,
        roundBetsRef:
          roundBets?.ref ??
          doc(
            db,
            seasonPath,
            'playerBets',
            userId,
            'roundBetsCollection',
            roundNumber.toString()
          ),
        playerData,
        bets: roundBets?.bets ?? [],
        hasRoundBets: roundBets?.exists ?? false,
        dirtyPlayer: false,
        dirtyBets: false,
      });
    }

    for (const match of matches) {
      if (match.isCancelled) {
        if (!match.pointsCalculated) continue;

        for (const state of userStates.values()) {
          if (!state.hasRoundBets) continue;
          const userBet = state.bets.find((bet) => bet.matchId === match.uid);
          if (!userBet || !userBet.points || userBet.points <= 0) continue;

          subtractMatchPointsFromUser(state, roundNumber, userBet);
          state.bets = state.bets.map((bet) =>
            bet.matchId === match.uid
              ? { ...bet, points: 0, isExactResult: false, isCorrectDirection: false }
              : bet
          );
          state.dirtyBets = true;
        }
        continue;
      }

      if (
        match.actualHomeScore === undefined ||
        match.actualHomeScore === null ||
        match.actualAwayScore === undefined ||
        match.actualAwayScore === null
      ) {
        continue;
      }

      const allBetsForMatch = allBetsForRound[match.uid] || {};

      for (const [userId, state] of userStates) {
        if (!state.hasRoundBets) continue;
        const userBet = state.bets.find((bet) => bet.matchId === match.uid);
        if (!userBet) continue;

        let pointsToSubtract = 0;
        let correctPredictionsToSubtract = 0;
        let exactPredictionsToSubtract = 0;

        if (match.pointsCalculated && userBet.points !== undefined) {
          pointsToSubtract = userBet.points;
          if (userBet.isExactResult) {
            exactPredictionsToSubtract = 1;
          } else if (userBet.isCorrectDirection) {
            correctPredictionsToSubtract = 1;
          }
        }

        const { points: matchPoints, isExact, isCorrectDirection } =
          computeMatchPointsForUser(
            userId,
            userBet,
            match.actualHomeScore,
            match.actualAwayScore,
            allBetsForMatch
          );

        const currentRoundPoints = (state.playerData.roundPoints || {})[roundNumber] || 0;
        const newRoundPoints = currentRoundPoints - pointsToSubtract + matchPoints;

        state.playerData.totalPoints =
          (state.playerData.totalPoints || 0) - pointsToSubtract + matchPoints;
        state.playerData.roundPoints = {
          ...(state.playerData.roundPoints || {}),
          [roundNumber]: newRoundPoints,
        };
        state.playerData.correctPredictions =
          (state.playerData.correctPredictions || 0) -
          correctPredictionsToSubtract +
          (isCorrectDirection ? 1 : 0);
        state.playerData.exactPredictions =
          (state.playerData.exactPredictions || 0) -
          exactPredictionsToSubtract +
          (isExact ? 1 : 0);
        state.playerData.correctPredictionsMap = {
          ...(state.playerData.correctPredictionsMap || {}),
          [roundNumber]:
            (state.playerData.correctPredictionsMap?.[roundNumber] || 0) -
            correctPredictionsToSubtract +
            (isCorrectDirection ? 1 : 0),
        };
        state.playerData.exactPredictionsMap = {
          ...(state.playerData.exactPredictionsMap || {}),
          [roundNumber]:
            (state.playerData.exactPredictionsMap?.[roundNumber] || 0) -
            exactPredictionsToSubtract +
            (isExact ? 1 : 0),
        };

        state.bets = state.bets.map((bet) =>
          bet.matchId === match.uid
            ? {
                ...bet,
                points: matchPoints,
                isExactResult: isExact,
                isCorrectDirection,
              }
            : bet
        );
        state.dirtyPlayer = true;
        state.dirtyBets = true;
      }
    }

    const batchOps: FirestoreBatchOp[] = [];

    for (const state of userStates.values()) {
      if (state.dirtyPlayer) {
        batchOps.push({
          ref: state.playerRef,
          type: 'set',
          data: {
            ...state.playerData,
            updatedAt: getTrustedNow(),
          },
          merge: true,
        });
      }
      if (state.dirtyBets && state.hasRoundBets) {
        batchOps.push({
          ref: state.roundBetsRef,
          type: 'update',
          data: { bets: state.bets, updatedAt: getTrustedNow() },
        });
      }
    }

    for (const match of matches) {
      if (match.isCancelled) continue;
      batchOps.push({
        ref: doc(db, seasonPath, 'rounds', roundNumber.toString(), 'matches', match.uid),
        type: 'update',
        data: { pointsCalculated: true },
      });
    }

    batchOps.push({
      ref: roundRef,
      type: 'update',
      data: { fullyCalculated: true },
    });

    await runFirestoreBatches(batchOps);

    invalidateCache(`leaderboard:${currentSeason}`);
    invalidateCache(`rounds:${seasonPath}`);
    invalidateCache(`fullyCalculated:${seasonPath}`);
    invalidateCache(`matches:${seasonPath}:${roundNumber}`);

    return {
      hasIncompleteMatches: false,
      incompleteMatches: [],
    };
  } catch (error) {
    console.error('Error calculating round points:', error);
    throw error;
  }
};

// חישוב נקודות להימורים מקדימים
function computePreSeasonPoints(
  preSeasonBets: PlayerBets['preSeasonBets'],
  seasonData: Record<string, unknown>
): number {
  if (!preSeasonBets) return 0;

  let preSeasonPoints = 0;

  if (
    preSeasonBets.champion &&
    seasonData.champion &&
    preSeasonBets.champion === seasonData.champion
  ) {
    preSeasonPoints += 10;
  }

  if (
    preSeasonBets.cup &&
    seasonData.cupWinner &&
    preSeasonBets.cup === seasonData.cupWinner
  ) {
    preSeasonPoints += 8;
  }

  const actualRelegatedTeams = [seasonData.relegation1, seasonData.relegation2].filter(Boolean);
  const userRelegationBets = [preSeasonBets.relegation1, preSeasonBets.relegation2].filter(
    Boolean
  );

  for (const userBet of userRelegationBets) {
    if (actualRelegatedTeams.includes(userBet)) {
      preSeasonPoints += 5;
    }
  }

  if (
    preSeasonBets.topScorer &&
    seasonData.topScorer &&
    preSeasonBets.topScorer === seasonData.topScorer
  ) {
    preSeasonPoints += 7;
  }

  if (
    preSeasonBets.topAssists &&
    seasonData.topAssists &&
    preSeasonBets.topAssists === seasonData.topAssists
  ) {
    preSeasonPoints += 5;
  }

  return preSeasonPoints;
}

export const calculatePreSeasonPoints = async (): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    const seasonPath = `season/${currentSeason}`;

    const [seasonDoc, playersSnapshot] = await Promise.all([
      getDoc(doc(db, seasonPath)),
      getDocs(collection(db, seasonPath, 'playerBets')),
    ]);

    if (!seasonDoc.exists()) {
      throw new Error('Season not found');
    }

    const seasonData = seasonDoc.data();
    const batchOps: FirestoreBatchOp[] = [];

    for (const playerDoc of playersSnapshot.docs) {
      const playerData = playerDoc.data() as PlayerBets;
      const preSeasonPoints = computePreSeasonPoints(
        playerData.preSeasonBets,
        seasonData
      );
      const newTotalPoints = (playerData.totalPoints || 0) + preSeasonPoints;

      batchOps.push({
        ref: playerDoc.ref,
        type: 'set',
        data: {
          totalPoints: newTotalPoints,
          preSeasonPoints,
          updatedAt: getTrustedNow(),
        },
        merge: true,
      });
    }

    await runFirestoreBatches(batchOps);
    invalidateCache(`leaderboard:${currentSeason}`);
  } catch (error) {
    console.error('Error calculating pre-season points:', error);
    throw error;
  }
};

// מחיקת נקודות ומשחקים של מחזור כשמוחקים אותו
export const deleteRoundPoints = async (roundNumber: number): Promise<void> => {
  console.log(`Starting to delete points and matches for round ${roundNumber}`);
  
  try {
    const currentSeason = getCurrentSeason();
    
    // מחיקת כל המשחקים של המחזור
    console.log(`Deleting matches for round ${roundNumber}`);
    const matchesRef = collection(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches');
    const matchesSnapshot = await getDocs(matchesRef);
    
    for (const matchDoc of matchesSnapshot.docs) {
      await deleteDoc(matchDoc.ref);
      console.log(`Deleted match ${matchDoc.id} from round ${roundNumber}`);
    }
    
    console.log(`Deleted ${matchesSnapshot.docs.length} matches from round ${roundNumber}`);
    
    // קבלת כל המשתמשים
    const playerBetsRef = collection(db, 'season', currentSeason, 'playerBets');
    const playersSnapshot = await getDocs(playerBetsRef);
    
    console.log(`Found ${playersSnapshot.docs.length} players to update`);
    
    for (const playerDoc of playersSnapshot.docs) {
      const userId = playerDoc.id;
      
      // קבלת ההימורים של המשתמש למחזור זה
      const userRoundBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
      const userRoundBetsDoc = await getDoc(userRoundBetsRef);
      
      if (userRoundBetsDoc.exists()) {
        const userBets = userRoundBetsDoc.data().bets || [];
        let totalPointsToSubtract = 0;
        let correctPredictionsToSubtract = 0;
        let exactPredictionsToSubtract = 0;
        
        // חישוב הנקודות שיש לחסר
        for (const bet of userBets as Bet[]) {
          if (bet.points) {
            totalPointsToSubtract += bet.points;
            if (bet.isExactResult) {
              exactPredictionsToSubtract += 1;
            } else if (bet.isCorrectDirection) {
              correctPredictionsToSubtract += 1;
            }
          }
        }
        
        if (totalPointsToSubtract > 0) {
          console.log(`Subtracting ${totalPointsToSubtract} points from user ${userId} for round ${roundNumber}`);
          // עדכון הנקודות של המשתמש
          const currentPlayerBets = await getPlayerBets(userId);
          if (currentPlayerBets) {
            const newTotalPoints = (currentPlayerBets.totalPoints || 0) - totalPointsToSubtract;
            const newRoundPoints = { ...(currentPlayerBets.roundPoints || {}) };
            delete newRoundPoints[roundNumber]; // מחיקת הנקודות של המחזור
            const newCorrectPredictionsMap = { ...(currentPlayerBets.correctPredictionsMap || {}) };
            const newExactPredictionsMap = { ...(currentPlayerBets.exactPredictionsMap || {}) };
            const correctPredictionsToSubtractMap = newCorrectPredictionsMap[roundNumber] || 0;
            const exactPredictionsToSubtractMap = newExactPredictionsMap[roundNumber] || 0;
            delete newCorrectPredictionsMap[roundNumber];
            delete newExactPredictionsMap[roundNumber];
            await updatePlayerPoints(userId, {
              totalPoints: newTotalPoints,
              roundPoints: newRoundPoints,
              correctPredictions: (currentPlayerBets.correctPredictions || 0) - correctPredictionsToSubtract - correctPredictionsToSubtractMap,
              exactPredictions: (currentPlayerBets.exactPredictions || 0) - exactPredictionsToSubtract - exactPredictionsToSubtractMap,
              correctPredictionsMap: newCorrectPredictionsMap,
              exactPredictionsMap: newExactPredictionsMap
            });
          }
        }
        
        // מחיקת ההימורים של המחזור
        await deleteDoc(userRoundBetsRef);
        console.log(`Deleted round bets for user ${userId} in round ${roundNumber}`);
      }
    }
    
    console.log(`Successfully deleted points and matches for round ${roundNumber}`);
  } catch (error) {
    console.error('Error deleting round points and matches:', error);
    throw error;
  }
};

// חישוב מחדש של כל הנקודות של משתמש
export const recalculatePlayerPoints = async (userId: string): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    const seasonPath = `season/${currentSeason}`;

    const [userRoundBetsSnap, seasonDoc, playersSnapshot, playerBets] = await Promise.all([
      getDocs(collection(db, seasonPath, 'playerBets', userId, 'roundBetsCollection')),
      getDoc(doc(db, seasonPath)),
      getDocs(collection(db, seasonPath, 'playerBets')),
      getPlayerBets(userId),
    ]);

    const playerIds = playersSnapshot.docs.map((playerDoc) => playerDoc.id);
    const roundNumbers = userRoundBetsSnap.docs.map((roundDoc) => parseInt(roundDoc.id, 10));

    const [matchesByRound, allBetsByRound] = await Promise.all([
      Promise.all(
        roundNumbers.map(async (roundNumber) => {
          const matchesSnapshot = await getDocs(
            collection(db, seasonPath, 'rounds', roundNumber.toString(), 'matches')
          );
          return {
            roundNumber,
            matches: matchesSnapshot.docs.map(
              (matchDoc) => ({ uid: matchDoc.id, ...matchDoc.data() } as Match)
            ),
          };
        })
      ),
      Promise.all(
        roundNumbers.map(async (roundNumber) => {
          const { allBetsForRound } = await loadRoundBetsForPlayers(
            seasonPath,
            roundNumber,
            playerIds
          );
          return { roundNumber, allBetsForRound };
        })
      ),
    ]);

    const matchesMap = new Map(matchesByRound.map((entry) => [entry.roundNumber, entry.matches]));
    const betsMap = new Map(
      allBetsByRound.map((entry) => [entry.roundNumber, entry.allBetsForRound])
    );

    let totalPoints = 0;
    let preSeasonPoints = 0;
    let correctPredictions = 0;
    let exactPredictions = 0;
    const roundPoints: Record<number, number> = {};

    for (const roundDoc of userRoundBetsSnap.docs) {
      const roundNumber = parseInt(roundDoc.id, 10);
      const userBets = (roundDoc.data().bets || []) as Bet[];
      const matches = matchesMap.get(roundNumber) || [];
      const allBetsForRound = betsMap.get(roundNumber) || {};

      let roundTotalPoints = 0;
      let roundCorrectPredictions = 0;
      let roundExactPredictions = 0;

      for (const bet of userBets) {
        const match = matches.find((m) => m.uid === bet.matchId);
        if (
          !match ||
          match.isCancelled ||
          match.actualHomeScore === undefined ||
          match.actualHomeScore === null ||
          match.actualAwayScore === undefined ||
          match.actualAwayScore === null
        ) {
          continue;
        }

        const { points: matchPoints, isExact, isCorrectDirection } =
          computeMatchPointsForUser(
            userId,
            bet,
            match.actualHomeScore,
            match.actualAwayScore,
            allBetsForRound[match.uid] || {}
          );

        roundTotalPoints += matchPoints;
        if (isExact) {
          roundExactPredictions += 1;
        } else if (isCorrectDirection) {
          roundCorrectPredictions += 1;
        }
      }

      roundPoints[roundNumber] = roundTotalPoints;
      totalPoints += roundTotalPoints;
      correctPredictions += roundCorrectPredictions;
      exactPredictions += roundExactPredictions;
    }

    if (playerBets?.preSeasonBets && seasonDoc.exists()) {
      preSeasonPoints = computePreSeasonPoints(
        playerBets.preSeasonBets,
        seasonDoc.data()
      );
    }

    totalPoints += preSeasonPoints;

    await updatePlayerPoints(userId, {
      totalPoints,
      preSeasonPoints,
      roundPoints,
      correctPredictions,
      exactPredictions,
    });

    invalidateCache(`leaderboard:${currentSeason}`);
  } catch (error) {
    console.error('Error recalculating player points:', error);
    throw error;
  }
};

// ביטול משחק — מסמן כמבוטל ומחשב מחדש את כל נקודות המחזור (כולל בונוס בלעדי)
export const cancelMatch = async (
  roundNumber: number,
  matchId: string
): Promise<{ hasIncompleteMatches: boolean; incompleteMatches: string[] }> => {
  try {
    const currentSeason = getCurrentSeason();
    const seasonPath = `season/${currentSeason}`;
    const matchRef = doc(db, seasonPath, 'rounds', roundNumber.toString(), 'matches', matchId);
    const matchDoc = await getDoc(matchRef);

    if (!matchDoc.exists()) {
      throw new Error('Match not found');
    }

    await updateDoc(matchRef, {
      isCancelled: true,
      actualHomeScore: null,
      actualAwayScore: null,
    });

    return await calculateRoundPoints(roundNumber);
  } catch (error) {
    console.error('Error cancelling match:', error);
    throw error;
  }
};

// החזרת משחק מבוטל — ומחשב מחדש נקודות אם כל המשחקים הפעילים עם תוצאה
export const restoreCancelledMatch = async (
  roundNumber: number,
  matchId: string
): Promise<{ hasIncompleteMatches: boolean; incompleteMatches: string[] }> => {
  try {
    const currentSeason = getCurrentSeason();
    const seasonPath = `season/${currentSeason}`;
    const matchRef = doc(db, seasonPath, 'rounds', roundNumber.toString(), 'matches', matchId);
    const matchDoc = await getDoc(matchRef);

    if (!matchDoc.exists()) {
      throw new Error('Match not found');
    }

    await updateDoc(matchRef, {
      isCancelled: false,
    });

    return await calculateRoundPoints(roundNumber);
  } catch (error) {
    console.error('Error restoring cancelled match:', error);
    throw error;
  }
};


