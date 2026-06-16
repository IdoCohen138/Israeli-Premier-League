/** Pure scoring rules — shared by round calculation and user recalculation. */

export type MatchOutcome = 'home' | 'away' | 'draw';

export interface BetScores {
  homeScore: number;
  awayScore: number;
}

export interface ComputedMatchPoints {
  points: number;
  isExact: boolean;
  isCorrectDirection: boolean;
}

export function getMatchOutcome(homeScore: number, awayScore: number): MatchOutcome {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

export function computeMatchPointsForUser(
  userId: string,
  userBet: BetScores,
  actualHome: number,
  actualAway: number,
  allBetsForMatch: Record<string, BetScores>
): ComputedMatchPoints {
  const actualResult = getMatchOutcome(actualHome, actualAway);
  const betResult = getMatchOutcome(userBet.homeScore, userBet.awayScore);

  let points = 0;
  let isExact = false;
  let isCorrectDirection = false;

  if (userBet.homeScore === actualHome && userBet.awayScore === actualAway) {
    points = 3;
    isExact = true;
  } else if (actualResult === betResult) {
    points = 1;
    isCorrectDirection = true;
  }

  if (isCorrectDirection || isExact) {
    const correctUsers = Object.keys(allBetsForMatch).filter((uid) => {
      const bet = allBetsForMatch[uid];
      if (!bet) return false;
      return getMatchOutcome(bet.homeScore, bet.awayScore) === actualResult;
    });

    if (correctUsers.length === 1 && correctUsers[0] === userId) {
      points *= 2;
    }
  }

  return { points, isExact, isCorrectDirection };
}
