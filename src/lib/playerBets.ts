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
import { PlayerBets, Bet, Match } from '../types';
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
    const currentSeason = getCurrentSeason();
    const roundBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
    const roundBetsDoc = await getDoc(roundBetsRef);
    
    const now = new Date();
    
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
export const getLeaderboard = async (): Promise<PlayerBets[]> => {
  try {
    const currentSeason = getCurrentSeason();
    const playerBetsRef = collection(db, 'season', currentSeason, 'playerBets');
    const q = query(playerBetsRef, orderBy('totalPoints', 'desc'), limit(50));
    const querySnapshot = await getDocs(q);
    
    const leaderboard: PlayerBets[] = [];
    querySnapshot.forEach((doc) => {
      const playerData = doc.data() as PlayerBets;
      // הוספת ה-uid כ-document ID
      playerData.uid = doc.id;
      leaderboard.push(playerData);
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
    roundPoints?: Record<number, number>;
    correctPredictions?: number;
    exactPredictions?: number;
  }
): Promise<void> => {
  try {
    const currentSeason = getCurrentSeason();
    const playerBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId);
    
    // קבלת הנתונים הנוכחיים כדי לוודא שכל השדות קיימים
    const currentDoc = await getDoc(playerBetsRef);
    const currentData = currentDoc.exists() ? currentDoc.data() : {};
    
    // מיזוג הנתונים החדשים עם הקיימים
    const updatedData = {
      ...currentData,
      ...points,
      updatedAt: new Date(),
    };
    
    // שימוש ב-setDoc במקום updateDoc כדי לוודא שכל השדות נוצרים
    await setDoc(playerBetsRef, updatedData, { merge: true });
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
export const calculateRoundPoints = async (roundNumber: number): Promise<{ hasIncompleteMatches: boolean; incompleteMatches: string[] }> => {
  console.log(`Starting to calculate points for round ${roundNumber}`);
  
  try {
    const currentSeason = getCurrentSeason();
    
    // בדיקה אם המחזור קיים
    const roundRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString());
    const roundDoc = await getDoc(roundRef);
    
    if (!roundDoc.exists()) {
      throw new Error('Round not found');
    }
    
    // קבלת פרטי המשחקים המלאים עם התוצאות
    const matchesRef = collection(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches');
    const matchesSnapshot = await getDocs(matchesRef);
    const matches = matchesSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Match));
    
    console.log(`Found ${matches.length} matches for round ${roundNumber}:`, matches);
    
    // בדיקת משחקים ללא תוצאות
    const incompleteMatches = matches.filter(match => 
      match.actualHomeScore === undefined || match.actualAwayScore === undefined
    );
    
    if (incompleteMatches.length > 0) {
      const incompleteMatchNames = incompleteMatches.map(match => 
        `${match.homeTeam} vs ${match.awayTeam}`
      );
      console.log(`Found ${incompleteMatches.length} matches without results:`, incompleteMatchNames);
      return {
        hasIncompleteMatches: true,
        incompleteMatches: incompleteMatchNames
      };
    }
    
    // קבלת כל המשתמשים
    const playerBetsRef = collection(db, 'season', currentSeason, 'playerBets');
    const playersSnapshot = await getDocs(playerBetsRef);
    
    console.log(`Found ${playersSnapshot.docs.length} players`);
    
    // קבלת כל ההימורים למחזור זה
    const allBetsForRound: { [matchId: string]: { [userId: string]: { homeScore: number; awayScore: number } } } = {};
    
    for (const playerDoc of playersSnapshot.docs) {
      const userId = playerDoc.id;
      const roundBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
      const roundBetsDoc = await getDoc(roundBetsRef);
      
      if (roundBetsDoc.exists()) {
        const bets = roundBetsDoc.data().bets || [];
        console.log(`Player ${userId} has ${bets.length} bets for round ${roundNumber}`);
        for (const bet of bets as Bet[]) {
          if (!allBetsForRound[bet.matchId]) {
            allBetsForRound[bet.matchId] = {};
          }
          allBetsForRound[bet.matchId][userId] = {
            homeScore: bet.homeScore,
            awayScore: bet.awayScore
          };
        }
      }
    }
    
    console.log('All bets for round:', allBetsForRound);
    
    // חישוב נקודות לכל משחק בנפרד
    for (const match of matches) {
      // וידוא שיש תוצאות למשחק (אחרי הבדיקה למעלה זה אמור להיות בטוח)
      if (match.actualHomeScore === undefined || match.actualAwayScore === undefined) {
        console.warn(`Match ${match.uid} still has no results, skipping...`);
        continue;
      }
      
      console.log(`Calculating points for match ${match.uid}: ${match.actualHomeScore}-${match.actualAwayScore}`);
      
      // חישוב נקודות לכל משתמש למשחק זה
      for (const playerDoc of playersSnapshot.docs) {
        const userId = playerDoc.id;
        
        // קבלת ההימורים של המשתמש למחזור זה
        const userRoundBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
        const userRoundBetsDoc = await getDoc(userRoundBetsRef);
        
        if (userRoundBetsDoc.exists()) {
          const userBets = userRoundBetsDoc.data().bets || [];
          const userBet = userBets.find((bet: Bet) => bet.matchId === match.uid);
          
          if (userBet) {
            console.log(`User ${userId} bet on match ${match.uid}: ${userBet.homeScore}-${userBet.awayScore}`);
            
            // בדיקה אם המשחק כבר חושב - אם כן, נחסר את הנקודות הישנות
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
              console.log(`Subtracting ${pointsToSubtract} old points for user ${userId} in match ${match.uid}`);
            }
            
            const actualResult = match.actualHomeScore > match.actualAwayScore ? 'home' : 
                               match.actualHomeScore < match.actualAwayScore ? 'away' : 'draw';
            const betResult = userBet.homeScore > userBet.awayScore ? 'home' : 
                            userBet.homeScore < userBet.awayScore ? 'away' : 'draw';
            
            console.log(`Actual result: ${actualResult}, Bet result: ${betResult}`);
            
            let matchPoints = 0;
            let isExact = false;
            let isCorrectDirection = false;
            
            // בדיקת תוצאה מדויקת
            if (userBet.homeScore === match.actualHomeScore && userBet.awayScore === match.actualAwayScore) {
              matchPoints += 3;
              isExact = true;
              console.log(`Exact result! +3 points`);
            }
            // בדיקת כיוון נכון
            else if (actualResult === betResult) {
              matchPoints += 1;
              isCorrectDirection = true;
              console.log(`Correct direction! +1 point`);
            }
            
            // בדיקת בונוס אם היחיד שצדק
            if (isCorrectDirection || isExact) {
              if (!match.uid) {
                console.warn('Match missing uid:', match);
                continue;
              }
              const allBetsForMatch = allBetsForRound[match.uid] || {};
              const correctUsers = Object.keys(allBetsForMatch).filter(uid => {
                const bet = allBetsForMatch[uid];
                if (!bet) {
                  console.warn('Missing bet for uid', uid, 'in match', match.uid, allBetsForMatch);
                  return false;
                }
                const betResult = bet.homeScore > bet.awayScore ? 'home' : 
                                bet.homeScore < bet.awayScore ? 'away' : 'draw';
                return actualResult === betResult;
              });
              
              if (correctUsers.length === 1 && correctUsers[0] === userId) {
                matchPoints *= 2; // בונוס כפול
                console.log(`Unique correct prediction! Points doubled to ${matchPoints}`);
              }
            }
            
            console.log(`Match ${match.uid} points for user ${userId}: ${matchPoints}`);
            
            // עדכון הנקודות של המשתמש (חסירת ישנות והוספת חדשות)
            const currentPlayerBets = await getPlayerBets(userId);
            if (currentPlayerBets) {
              const currentRoundPoints = (currentPlayerBets.roundPoints || {})[roundNumber] || 0;
              const newRoundPoints = currentRoundPoints - pointsToSubtract + matchPoints;
              const newTotalPoints = (currentPlayerBets.totalPoints || 0) - pointsToSubtract + matchPoints;
              
              console.log(`User ${userId} earned ${matchPoints} points for match ${match.uid}. Round total: ${newRoundPoints}, Total: ${newTotalPoints}`);
              console.log(`Current round points: ${currentRoundPoints}, Points to subtract: ${pointsToSubtract}, New points: ${matchPoints}`);
              
              // עדכון הנקודות תמיד - גם אם הן 0, כדי שהמחזור יופיע בטבלת המיקומים
              await updatePlayerPoints(userId, {
                totalPoints: newTotalPoints,
                roundPoints: {
                  ...(currentPlayerBets.roundPoints || {}),
                  [roundNumber]: newRoundPoints
                },
                correctPredictions: (currentPlayerBets.correctPredictions || 0) - correctPredictionsToSubtract + (isCorrectDirection ? 1 : 0),
                exactPredictions: (currentPlayerBets.exactPredictions || 0) - exactPredictionsToSubtract + (isExact ? 1 : 0)
              });
              
              console.log(`Updated points for user ${userId}: Total=${newTotalPoints}, Round ${roundNumber}=${newRoundPoints}`);
            }
            
            // עדכון ההימור עם הנקודות החדשות
            const updatedBets = userBets.map((bet: Bet) => 
              bet.matchId === match.uid 
                ? { 
                    ...bet, 
                    points: matchPoints,
                    isExactResult: isExact,
                    isCorrectDirection: isCorrectDirection
                  }
                : bet
            );
            
            await updateDoc(userRoundBetsRef, { bets: updatedBets });
            console.log(`Updated bet for user ${userId} in match ${match.uid} with ${matchPoints} points`);
          }
        }
      }
      
      // סימון שהמשחק חושב
      const matchRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches', match.uid);
      await updateDoc(matchRef, { 
        pointsCalculated: true 
      });
      
      console.log(`Match ${match.uid} marked as calculated`);
    }
    
    // החזרת תוצאה שהחישוב הושלם בהצלחה
    return {
      hasIncompleteMatches: false,
      incompleteMatches: []
    };
    
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
      const userId = playerDoc.id;
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
            
            await updatePlayerPoints(userId, {
              totalPoints: newTotalPoints,
              roundPoints: newRoundPoints,
              correctPredictions: (currentPlayerBets.correctPredictions || 0) - correctPredictionsToSubtract,
              exactPredictions: (currentPlayerBets.exactPredictions || 0) - exactPredictionsToSubtract
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
  console.log(`Starting to recalculate points for user ${userId}`);
  
  try {
    const currentSeason = getCurrentSeason();
    
    // קבלת כל המחזורים
    const roundsRef = collection(db, 'season', currentSeason, 'rounds');
    const roundsSnapshot = await getDocs(roundsRef);
    
    let totalPoints = 0;
    let preSeasonPoints = 0;
    let correctPredictions = 0;
    let exactPredictions = 0;
    const roundPoints: Record<number, number> = {};
    
    // חישוב נקודות מכל מחזור
    for (const roundDoc of roundsSnapshot.docs) {
      const roundNumber = parseInt(roundDoc.id);
      
      // קבלת ההימורים של המשתמש למחזור זה
      const userRoundBetsRef = doc(db, 'season', currentSeason, 'playerBets', userId, 'roundBetsCollection', roundNumber.toString());
      const userRoundBetsDoc = await getDoc(userRoundBetsRef);
      
      if (userRoundBetsDoc.exists()) {
        const userBets = userRoundBetsDoc.data().bets || [];
        let roundTotalPoints = 0;
        let roundCorrectPredictions = 0;
        let roundExactPredictions = 0;
        
        // קבלת פרטי המשחקים של המחזור
        const matchesRef = collection(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches');
        const matchesSnapshot = await getDocs(matchesRef);
        const matches = matchesSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Match));
        
        for (const bet of userBets as Bet[]) {
          const match = matches.find(m => m.uid === bet.matchId);
          if (match && match.actualHomeScore !== undefined && match.actualAwayScore !== undefined) {
            const actualResult = match.actualHomeScore > match.actualAwayScore ? 'home' : 
                               match.actualHomeScore < match.actualAwayScore ? 'away' : 'draw';
            const betResult = bet.homeScore > bet.awayScore ? 'home' : 
                            bet.homeScore < bet.awayScore ? 'away' : 'draw';
            
            let matchPoints = 0;
            let isExact = false;
            let isCorrectDirection = false;
            
            // בדיקת תוצאה מדויקת
            if (bet.homeScore === match.actualHomeScore && bet.awayScore === match.actualAwayScore) {
              matchPoints += 3;
              isExact = true;
            }
            // בדיקת כיוון נכון
            else if (actualResult === betResult) {
              matchPoints += 1;
              isCorrectDirection = true;
            }
            
            // בדיקת בונוס אם היחיד שצדק
            if (isCorrectDirection || isExact) {
              // קבלת כל ההימורים למשחק זה
              const allBetsForMatch: { [uid: string]: { homeScore: number; awayScore: number } } = {};
              const allPlayersSnapshot = await getDocs(collection(db, 'season', currentSeason, 'playerBets'));
              
              for (const playerDoc of allPlayersSnapshot.docs) {
                const playerRoundBetsRef = doc(db, 'season', currentSeason, 'playerBets', playerDoc.id, 'roundBetsCollection', roundNumber.toString());
                const playerRoundBetsDoc = await getDoc(playerRoundBetsRef);
                
                if (playerRoundBetsDoc.exists()) {
                  const playerBets = playerRoundBetsDoc.data().bets || [];
                  const playerBet = playerBets.find((b: Bet) => b.matchId === match.uid);
                  if (playerBet) {
                    allBetsForMatch[playerDoc.id] = {
                      homeScore: playerBet.homeScore,
                      awayScore: playerBet.awayScore
                    };
                  }
                }
              }
              
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
            
            roundTotalPoints += matchPoints;
            if (isExact) {
              roundExactPredictions += 1;
            } else if (isCorrectDirection) {
              roundCorrectPredictions += 1;
            }
          }
        }
        
        roundPoints[roundNumber] = roundTotalPoints;
        totalPoints += roundTotalPoints;
        correctPredictions += roundCorrectPredictions;
        exactPredictions += roundExactPredictions;
      }
    }
    
    // חישוב נקודות הימורים מקדימים
    const playerBets = await getPlayerBets(userId);
    if (playerBets && playerBets.preSeasonBets) {
      const seasonRef = doc(db, 'season', currentSeason);
      const seasonDoc = await getDoc(seasonRef);
      
      if (seasonDoc.exists()) {
        const seasonData = seasonDoc.data();
        const preSeasonBets = playerBets.preSeasonBets;
        
        if (preSeasonBets.champion && seasonData.champion && preSeasonBets.champion === seasonData.champion) {
          preSeasonPoints += 10;
        }
        if (preSeasonBets.relegation1 && seasonData.relegation1 && preSeasonBets.relegation1 === seasonData.relegation1) {
          preSeasonPoints += 5;
        }
        if (preSeasonBets.relegation2 && seasonData.relegation2 && preSeasonBets.relegation2 === seasonData.relegation2) {
          preSeasonPoints += 5;
        }
        if (preSeasonBets.topScorer && seasonData.topScorer && preSeasonBets.topScorer === seasonData.topScorer) {
          preSeasonPoints += 7;
        }
        if (preSeasonBets.topAssists && seasonData.topAssists && preSeasonBets.topAssists === seasonData.topAssists) {
          preSeasonPoints += 5;
        }
      }
    }
    
    totalPoints += preSeasonPoints;
    
    // עדכון הנקודות של המשתמש
    await updatePlayerPoints(userId, {
      totalPoints,
      preSeasonPoints,
      roundPoints,
      correctPredictions,
      exactPredictions
    });
    
    console.log(`Successfully recalculated points for user ${userId}: Total=${totalPoints}, PreSeason=${preSeasonPoints}`);
  } catch (error) {
    console.error('Error recalculating player points:', error);
    throw error;
  }
};


