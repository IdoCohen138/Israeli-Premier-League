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
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { PlayerBets, Bet } from '../types';
import { getCurrentSeason } from './season';

// יצירת או עדכון הימורים מקדימים של שחקן
export const savePreSeasonBets = async (
  userId: string, 
  preSeasonBets: PlayerBets['preSeasonBets'],
  displayName?: string
): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
    const playerBetsDoc = await getDoc(playerBetsRef);
    
    const now = new Date();
    
    if (playerBetsDoc.exists()) {
      await updateDoc(playerBetsRef, {
        preSeasonBets,
        displayName,
        updatedAt: now,
      });
    } else {
      const newPlayerBets: PlayerBets = {
        uid: userId,
        userId,
        displayName,
        seasonId: currentSeason,
        seasonName: currentSeason,
        createdAt: now,
        updatedAt: now,
        preSeasonBets,
        totalPoints: 0,
        preSeasonPoints: 0,
        roundPoints: 0,
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
    const currentSeason = getCurrentSeason();

    const roundBetsDocRef = doc(
      db,
      'season',
      currentSeason,
      'playerBets',
      userId,
      'roundBetsCollection',
      roundNumber.toString()
    );
    
    await setDoc(roundBetsDocRef, {
      round: roundNumber,
      bets: bets.map(bet => ({
        matchId: bet.matchId,
        homeScore: bet.homeScore,
        awayScore: bet.awayScore
      })),
      submittedAt: new Date()
    });

    const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
    const playerBetsDoc = await getDoc(playerBetsRef);
    
    const now = new Date();
    
    if (playerBetsDoc.exists()) {
      await updateDoc(playerBetsRef, {
        displayName,
        updatedAt: now,
      });
    } else {
      const newPlayerBets: PlayerBets = {
        uid: userId,
        userId,
        displayName,
        seasonId: currentSeason,
        seasonName: currentSeason,
        createdAt: now,
        updatedAt: now,
        preSeasonBets: {},
        totalPoints: 0,
        preSeasonPoints: 0,
        roundPoints: 0,
        correctPredictions: 0,
        exactPredictions: 0,
      };
      
      await setDoc(playerBetsRef, newPlayerBets);
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
      return playerBetsDoc.data() as PlayerBets;
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
export const getLeaderboard = async (): Promise<PlayerBets[]> => {
  try {
    const currentSeason = getCurrentSeason();
    const playerBetsRef = collection(db, 'season', currentSeason, 'playerBets');
    const q = query(playerBetsRef, orderBy('totalPoints', 'desc'), limit(50));
    const querySnapshot = await getDocs(q);
    
    const leaderboard: PlayerBets[] = [];
    querySnapshot.forEach((doc) => {
      leaderboard.push(doc.data() as PlayerBets);
    });
    
    return leaderboard;
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    throw error;
  }
};

// עדכון נקודות של שחקן
export const updatePlayerPoints = async (
  userId: string,
  points: {
    totalPoints?: number;
    preSeasonPoints?: number;
    roundPoints?: number;
    correctPredictions?: number;
    exactPredictions?: number;
  }
): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
    await updateDoc(playerBetsRef, {
      ...points,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating player points:', error);
    throw error;
  }
};

// בדיקה אם שחקן כבר הימר על מחזור מסוים
export const hasPlayerBetOnRound = async (userId: string, roundNumber: number): Promise<boolean> => {
  try {
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

// חישוב נקודות למחזור
export const calculateRoundPoints = async (roundNumber: number): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    
    // קבלת כל המשתמשים
    const playerBetsRef = collection(db, 'season', currentSeason, 'playerBets');
    const playersSnapshot = await getDocs(playerBetsRef);
    
    // קבלת תוצאות המחזור
    const roundRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString());
    const roundDoc = await getDoc(roundRef);
    
    if (!roundDoc.exists()) {
      throw new Error('Round not found');
    }
    
    const roundData = roundDoc.data();
    const matches = roundData.matches || [];
    
    // קבלת כל ההימורים למחזור זה
    const allBetsForRound: { [matchId: string]: { [userId: string]: { homeScore: number; awayScore: number } } } = {};
    
    for (const playerDoc of playersSnapshot.docs) {
      const playerData = playerDoc.data();
      const roundBetsRef = doc(db, 'season', currentSeason, 'playerBets', playerData.uid, 'roundBetsCollection', roundNumber.toString());
      const roundBetsDoc = await getDoc(roundBetsRef);
      
      if (roundBetsDoc.exists()) {
        const bets = roundBetsDoc.data().bets || [];
        for (const bet of bets) {
          if (!allBetsForRound[bet.matchId]) {
            allBetsForRound[bet.matchId] = {};
          }
          allBetsForRound[bet.matchId][playerData.uid] = {
            homeScore: bet.homeScore,
            awayScore: bet.awayScore
          };
        }
      }
    }
    
    // חישוב נקודות לכל משתמש
    for (const playerDoc of playersSnapshot.docs) {
      const playerData = playerDoc.data();
      const userId = playerData.uid;
      let roundPoints = 0;
      let correctPredictions = 0;
      let exactPredictions = 0;
      
      // קבלת ההימורים של המשתמש למחזור זה
      const userRoundBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
      const userRoundBetsDoc = await getDoc(userRoundBetsRef);
      
      if (userRoundBetsDoc.exists()) {
        const userBets = userRoundBetsDoc.data().bets || [];
        
        for (const match of matches) {
          if (match.actualHomeScore !== undefined && match.actualAwayScore !== undefined) {
            const userBet = userBets.find(bet => bet.matchId === match.uid);
            
            if (userBet) {
              const actualResult = match.actualHomeScore > match.actualAwayScore ? 'home' : 
                                 match.actualHomeScore < match.actualAwayScore ? 'away' : 'draw';
              const betResult = userBet.homeScore > userBet.awayScore ? 'home' : 
                              userBet.homeScore < userBet.awayScore ? 'away' : 'draw';
              
              let matchPoints = 0;
              let isExact = false;
              let isCorrectDirection = false;
              
              // בדיקת תוצאה מדויקת
              if (userBet.homeScore === match.actualHomeScore && userBet.awayScore === match.actualAwayScore) {
                matchPoints += 3;
                isExact = true;
                exactPredictions++;
              }
              // בדיקת כיוון נכון
              else if (actualResult === betResult) {
                matchPoints += 1;
                isCorrectDirection = true;
                correctPredictions++;
              }
              
              // בדיקת בונוס אם היחיד שצדק
              if (isCorrectDirection || isExact) {
                const allBetsForMatch = allBetsForRound[match.uid] || {};
                const correctUsers = Object.keys(allBetsForMatch).filter(uid => {
                  const bet = allBetsForMatch[uid];
                  const betResult = bet.homeScore > bet.awayScore ? 'home' : 
                                  bet.homeScore < bet.awayScore ? 'away' : 'draw';
                  return actualResult === betResult;
                });
                
                if (correctUsers.length === 1 && correctUsers[0] === userId) {
                  matchPoints *= 2; // בונוס כפול
                }
              }
              
              roundPoints += matchPoints;
            }
          }
        }
      }
      
      // עדכון הנקודות של המשתמש
      const currentPlayerBets = await getPlayerBets(userId);
      if (currentPlayerBets) {
        const newTotalPoints = (currentPlayerBets.totalPoints || 0) + roundPoints;
        const newRoundPoints = (currentPlayerBets.roundPoints || 0) + roundPoints;
        
        await updatePlayerPoints(userId, {
          totalPoints: newTotalPoints,
          roundPoints: newRoundPoints,
          correctPredictions: (currentPlayerBets.correctPredictions || 0) + correctPredictions,
          exactPredictions: (currentPlayerBets.exactPredictions || 0) + exactPredictions
        });
      }
    }
    
    // סימון שהתוצאות הוזנו
    await updateDoc(roundRef, { resultsEntered: true });
    
  } catch (error) {
    console.error('Error calculating round points:', error);
    throw error;
  }
};

// חישוב נקודות להימורים מקדימים
export const calculatePreSeasonPoints = async (): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    
    // קבלת נתוני העונה
    const seasonRef = doc(db, 'season', currentSeason);
    const seasonDoc = await getDoc(seasonRef);
    
    if (!seasonDoc.exists()) {
      throw new Error('Season not found');
    }
    
    const seasonData = seasonDoc.data();
    
    // קבלת כל המשתמשים
    const playerBetsRef = collection(db, 'season', currentSeason, 'playerBets');
    const playersSnapshot = await getDocs(playerBetsRef);
    
    for (const playerDoc of playersSnapshot.docs) {
      const playerData = playerDoc.data();
      const userId = playerData.uid;
      let preSeasonPoints = 0;
      
      const preSeasonBets = playerData.preSeasonBets || {};
      
      // חישוב נקודות לכל הימור מקדים
      if (preSeasonBets.champion && seasonData.champion && preSeasonBets.champion === seasonData.champion) {
        preSeasonPoints += 10; // אלופה
      }
      
      if (preSeasonBets.relegation1 && seasonData.relegation1 && preSeasonBets.relegation1 === seasonData.relegation1) {
        preSeasonPoints += 5; // יורדת ראשונה
      }
      
      if (preSeasonBets.relegation2 && seasonData.relegation2 && preSeasonBets.relegation2 === seasonData.relegation2) {
        preSeasonPoints += 5; // יורדת שנייה
      }
      
      if (preSeasonBets.topScorer && seasonData.topScorer && preSeasonBets.topScorer === seasonData.topScorer) {
        preSeasonPoints += 7; // מלך שערים
      }
      
      if (preSeasonBets.topAssists && seasonData.topAssists && preSeasonBets.topAssists === seasonData.topAssists) {
        preSeasonPoints += 5; // מלך בישולים
      }
      
      // עדכון הנקודות של המשתמש
      const currentPlayerBets = await getPlayerBets(userId);
      if (currentPlayerBets) {
        const newTotalPoints = (currentPlayerBets.totalPoints || 0) + preSeasonPoints;
        
        await updatePlayerPoints(userId, {
          totalPoints: newTotalPoints,
          preSeasonPoints: preSeasonPoints
        });
      }
    }
    
  } catch (error) {
    console.error('Error calculating pre-season points:', error);
    throw error;
  }
};
