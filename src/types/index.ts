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
}

export interface Round {
  number: number;
  matches: Match[];
  closingTime: string;
  endTime: string;
  isActive: boolean;
}

export interface Season {
  uid: string;
  players: Record<string, Player>;
  rounds: Record<number, Round>;
  teams: Record<string, Team>;
}

export interface Bet {
  uid: string;
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
  roundPoints: number;
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

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  email: string;
  totalPoints: number;
  preSeasonPoints: number;
  roundPoints: number;
  correctPredictions: number;
  exactPredictions: number;
} 