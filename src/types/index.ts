export interface User {
  uid: string;
  email: string;
  role: 'user' | 'admin';
  displayName?: string;
  photoURL?: string;
}

export interface Player {
  uid: string;
  name: string;
  team: string;
  teamId: string;
}

export interface Team {
  uid: string;
  name: string;
  createdAt: Date;
}

export interface Match {
  uid: string;
  homeTeam: string;
  homeTeamId: string;
  awayTeam: string;
  awayTeamId: string;
  date: string;
  startTime: string;
  round: number;
  isCancelled?: boolean;
  homeScore?: number;
  awayScore?: number;
  actualHomeScore?: number;
  actualAwayScore?: number;
  pointsCalculated?: boolean;
}

export interface Round {
  number: number;
  matches: string[]; // מערך של UIDs
  matchesDetails?: Match[]; // פרטי המשחקים המלאים
  startTime: string;
  isActive: boolean;
}

export interface Season {
  uid: string;
  seasonStart: string; // ISO date string when pre-season betting closes
  seasonEnd: string;
  players: Record<string, Player>;
  rounds: Record<number, Round>;
  teams: Record<string, Team>;
}

export interface Bet {
  userId: string;
  matchId: string;
  round: number;
  homeScore: number;
  awayScore: number;
  points?: number;
  isExactResult?: boolean;
  isCorrectDirection?: boolean;
  isUniqueBet?: boolean;
}

export interface UserStats {
  uid: string;
  totalPoints: number;
  roundPoints: Record<number, number>; // map של מחזור -> נקודות
  previousRoundPoints: number;
  pointsChange: number;
  bets: Bet[];
}

export interface PreSeasonBet {
  uid: string;
  userId: string;
  type: 'champion' | 'cup' | 'relegation1' | 'relegation2' | 'topScorer' | 'topAssists';
  teamId?: string;
  playerId?: string;
  points?: number;
}

// מבנה חדש לשמירת הימורים של שחקנים בעונה
export interface PlayerBets {
  uid?: string; // document ID - נוסף בפונקציות
  displayName?: string; // שם התצוגה של השחקן
  seasonId: string;
  seasonName: string; // "2025-2026"
  createdAt: Date;
  updatedAt: Date;
  
  // הימורים מקדימים
  preSeasonBets: {
    champion?: string; // teamId
    cup?: string; // teamId
    relegation1?: string; // teamId
    relegation2?: string; // teamId
    topScorer?: string; // playerId
    topAssists?: string; // playerId
  };
  
  // סטטיסטיקות כלליות
  totalPoints: number; // סה"כ נקודות עד למחזור הנוכחי
  preSeasonPoints: number; // נקודות מהימורים מקדימים
  roundPoints: Record<number, number>; // map של מחזור -> נקודות (למשל: {1: 5, 2: 3})
  correctPredictions: number;
  exactPredictions: number;
  correctPredictionsMap?: Record<number, number>; // map של מחזור -> כמות ניחושי כיוון נכונים
  exactPredictionsMap?: Record<number, number>; // map של מחזור -> כמות ניחושי תוצאה מדויקת
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  email: string;
  totalPoints: number;
  preSeasonPoints: number;
  roundPoints: Record<number, number>; // map של מחזור -> נקודות
  correctPredictions: number;
  exactPredictions: number;
  correctPredictionsMap?: Record<number, number>; // map של מחזור -> כמות ניחושי כיוון נכונים
  exactPredictionsMap?: Record<number, number>; // map של מחזור -> כמות ניחושי תוצאה מדויקת
} 