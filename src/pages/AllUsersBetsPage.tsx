import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentSeason, getSeasonPath, getCurrentSeasonData, getSortedRounds, getDefaultAllUsersBetsRound } from '@/lib/season';
import { sortMatchesByStartTime } from '@/lib/sorting';
import { ensureServerTimeSynced, isDeadlinePassed } from '@/lib/serverTime';
import { formatIsraelDateTime, parseIsraelDateTime } from '@/lib/israelTime';
import { useAuth } from '@/contexts/AuthContext';
import { getPlayerRoundBets, getPlayerPreSeasonBets } from '@/lib/playerBets';
import PageShell from '@/components/layout/PageShell';
import PageHeader from '@/components/layout/PageHeader';
import StatusBanner from '@/components/layout/StatusBanner';
import { Clock, CheckCircle, Info } from 'lucide-react';
import { Team, Player } from '@/types';

const PRESEASON_CATEGORIES = [
  { key: 'champion', label: 'אלופה' },
  { key: 'cup', label: 'זוכת גביע' },
  { key: 'relegation', label: 'יורדות ליגה' },
  { key: 'topScorer', label: 'מלך שערים' },
  { key: 'topAssists', label: 'מלך בישולים' },
] as const;

interface UserInfo {
  uid: string;
  displayName?: string;
}

interface Bet {
  matchId: string;
  homeScore: number;
  awayScore: number;
  points?: number;
  isExactResult?: boolean;
  isCorrectDirection?: boolean;
}

interface MatchInfo {
  homeTeam: string;
  awayTeam: string;
  actualHomeScore?: number;
  actualAwayScore?: number;
  isCancelled?: boolean;
  startTime?: string;
  date?: string;
}

const AllUsersBetsPage: React.FC = () => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [rounds, setRounds] = useState<{ number: number; startTime: string; name?: string }[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [betsByUser, setBetsByUser] = useState<Record<string, Bet[]>>({});
  const [matchesMap, setMatchesMap] = useState<Record<string, MatchInfo>>({});
  const [sortedMatchIds, setSortedMatchIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundClosed, setRoundClosed] = useState(true);
  const [activeTab, setActiveTab] = useState<'round' | 'preseason'>('round');
  const [preSeasonBetsByUser, setPreSeasonBetsByUser] = useState<Record<string, any>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasonStarted, setSeasonStarted] = useState(false);
  const [seasonStartDate, setSeasonStartDate] = useState<Date | null>(null);
  const [seasonResults, setSeasonResults] = useState<any>(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      if (user) {
        await ensureServerTimeSynced(user.uid);
      }

      const seasonId = getCurrentSeason();
      const playerBetsSnap = await getDocs(collection(db, 'season', seasonId, 'playerBets'));
      const usersList: UserInfo[] = playerBetsSnap.docs.map(doc => ({
        uid: doc.id,
        displayName: doc.data().displayName || doc.id
      }));
      setUsers(usersList);

      const seasonPath = getSeasonPath();
      const roundsList = await getSortedRounds(seasonPath);
      setRounds(roundsList);

      const defaultRound = await getDefaultAllUsersBetsRound(seasonId);
      setSelectedRound(defaultRound);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    const fetchBetsAndMatches = async () => {
      if (!selectedRound) return;
      setLoading(true);
      let closed = true;
      let matchesMapLocal: Record<string, MatchInfo> = {};
      try {
        const seasonId = getCurrentSeason();
        // Fetch round info for startTime from the correct round document
        const roundDocRef = doc(db, 'season', seasonId, 'rounds', selectedRound.toString());
        const roundDocSnap = await getDoc(roundDocRef);
        if (roundDocSnap.exists()) {
          const roundData = roundDocSnap.data();
          closed = !!(roundData.startTime && isDeadlinePassed(roundData.startTime));
        } else {
          closed = false;
        }
        // Fetch all matches for the round and build map
        const matchesSnap = await getDocs(collection(db, 'season', seasonId, 'rounds', selectedRound.toString(), 'matches'));
        const sortedMatches = sortMatchesByStartTime(
          matchesSnap.docs.map((matchDoc) => {
            const data = matchDoc.data();
            return {
              matchId: matchDoc.id,
              homeTeam: data.homeTeam || '',
              awayTeam: data.awayTeam || '',
              actualHomeScore: data.actualHomeScore,
              actualAwayScore: data.actualAwayScore,
              isCancelled: data.isCancelled || false,
              startTime: data.startTime,
              date: data.date,
            };
          })
        );
        matchesMapLocal = {};
        sortedMatches.forEach((match) => {
          matchesMapLocal[match.matchId] = {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            actualHomeScore: match.actualHomeScore,
            actualAwayScore: match.actualAwayScore,
            isCancelled: match.isCancelled,
            startTime: match.startTime,
            date: match.date,
          };
        });
        setMatchesMap(matchesMapLocal);
        setSortedMatchIds(sortedMatches.map((match) => match.matchId));
      } catch (e) {
        closed = true;
        setMatchesMap({});
        setSortedMatchIds([]);
      }
      setRoundClosed(closed);
      if (closed) {
        const bets: Record<string, Bet[]> = {};
        await Promise.all(users.map(async user => {
          const userBets = await getPlayerRoundBets(user.uid, selectedRound);
          if (userBets) bets[user.uid] = userBets;
        }));
        setBetsByUser(bets);
      } else {
        setBetsByUser({});
      }
      setLoading(false);
    };
    if (users.length && rounds.length && selectedRound) {
      fetchBetsAndMatches();
    }
  }, [selectedRound, users, rounds]);

  // Fetch teams and players for preseason bets display
  useEffect(() => {
    if (activeTab !== 'preseason') return;
    const fetchTeamsAndPlayers = async () => {
      const seasonPath = getSeasonPath();
      const teamsSnap = await getDocs(collection(db, seasonPath, 'teams'));
      setTeams(teamsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as Team));
      const playersSnap = await getDocs(collection(db, seasonPath, 'players'));
      setPlayers(playersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as Player));
    };
    fetchTeamsAndPlayers();
  }, [activeTab]);

  // Fetch all users' preseason bets when tab is selected
  useEffect(() => {
    if (activeTab !== 'preseason' || users.length === 0) return;
    const fetchAllPreSeasonBets = async () => {
      const bets: Record<string, any> = {};
      await Promise.all(users.map(async user => {
        const userBets = await getPlayerPreSeasonBets(user.uid);
        if (userBets) bets[user.uid] = userBets;
      }));
      setPreSeasonBetsByUser(bets);
    };
    fetchAllPreSeasonBets();
  }, [activeTab, users]);

  // Check if season has started
  useEffect(() => {
    const checkSeasonStart = async () => {
      if (user) {
        await ensureServerTimeSynced(user.uid);
      }

      const seasonData = await getCurrentSeasonData();
      if (seasonData?.seasonStart) {
        setSeasonStartDate(parseIsraelDateTime(seasonData.seasonStart));
        setSeasonStarted(isDeadlinePassed(seasonData.seasonStart));
      } else {
        setSeasonStartDate(null);
        setSeasonStarted(false);
      }
    };
    checkSeasonStart();
  }, [user]);

  // הימורים מקדימים: שליפת תוצאות סוף עונה
  useEffect(() => {
    const fetchSeasonResults = async () => {
      const seasonData = await getCurrentSeasonData();
      setSeasonResults(seasonData);
    };
    fetchSeasonResults();
  }, [activeTab]);

  // Helper function to get cell styling
  const isUniqueBet = (bet?: Bet) => bet?.points === 6 || bet?.points === 2;

  const getCellStyling = (bet: Bet | undefined, matchInfo: MatchInfo) => {
    if (matchInfo.isCancelled) {
      return { bg: 'bet-miss', text: 'text-muted-foreground' };
    }
    if (!bet?.points) {
      return { bg: 'bet-miss', text: 'text-foreground' };
    }
    if (bet.points === 6 || bet.points === 3) {
      return {
        bg: isUniqueBet(bet) ? 'bet-hit-exact bet-hit-unique' : 'bet-hit-exact',
        text: 'font-bold',
      };
    }
    if (bet.points === 2 || bet.points === 1) {
      return {
        bg: isUniqueBet(bet) ? 'bet-hit-direction bet-hit-unique' : 'bet-hit-direction',
        text: 'font-bold',
      };
    }
    return { bg: 'bet-miss', text: 'text-foreground' };
  };

  const getPointsPillClass = (points: number, unique = false) => {
    const base = 'all-users-bet-points';
    const uniqueClass = unique ? ' all-users-bet-points-unique' : '';
    if (points === 6 || points === 3) {
      return `${base}${uniqueClass} text-emerald-700 dark:text-emerald-300`;
    }
    if (points === 2 || points === 1) {
      return `${base}${uniqueClass} text-amber-700 dark:text-amber-300`;
    }
    return `${base} text-muted-foreground`;
  };

  const renderPointsBadge = (points: number, unique = false) => (
    <span
      className={getPointsPillClass(points, unique)}
      title={unique ? 'בונוס בלעדיות — היחיד שפגע' : undefined}
    >
      <span className="all-users-bet-points-value">+{points}</span>
      <span className="all-users-bet-points-label">נק׳</span>
    </span>
  );

  const getPreseasonResult = (betKey: string) => {
    if (betKey === 'champion') {
      return teams.find((t) => t.uid === seasonResults?.champion)?.name || '';
    }
    if (betKey === 'cup') {
      return teams.find((t) => t.uid === seasonResults?.cupWinner)?.name || '';
    }
    if (betKey === 'relegation') {
      const relegated = [seasonResults?.relegation1, seasonResults?.relegation2]
        .filter(Boolean)
        .map((id) => teams.find((t) => t.uid === id)?.name)
        .filter(Boolean);
      return relegated.join(' · ');
    }
    if (betKey === 'topScorer') {
      return players.find((p) => p.uid === seasonResults?.topScorer)?.name || '';
    }
    if (betKey === 'topAssists') {
      return players.find((p) => p.uid === seasonResults?.topAssists)?.name || '';
    }
    return '';
  };

  const getPreseasonUserDisplay = (betKey: string, userId: string) => {
    const userBets = preSeasonBetsByUser[userId] || {};
    if (betKey === 'relegation') {
      const picks = [userBets.relegation1, userBets.relegation2]
        .filter(Boolean)
        .map((id) => teams.find((t) => t.uid === id)?.name)
        .filter(Boolean);
      return picks.join(' · ');
    }
    if (betKey === 'champion' || betKey === 'cup') {
      const teamId = userBets[betKey];
      return teams.find((t) => t.uid === teamId)?.name || '';
    }
    const playerId = userBets[betKey];
    return players.find((p) => p.uid === playerId)?.name || '';
  };

  const getPreseasonUserPoints = (betKey: string, userId: string) => {
    const userBets = preSeasonBetsByUser[userId] || {};
    if (betKey === 'champion' && userBets.champion && userBets.champion === seasonResults?.champion) {
      return 10;
    }
    if (betKey === 'cup' && userBets.cup && userBets.cup === seasonResults?.cupWinner) {
      return 8;
    }
    if (betKey === 'relegation') {
      const actualRelegated = [seasonResults?.relegation1, seasonResults?.relegation2].filter(Boolean);
      const userPicks = [userBets.relegation1, userBets.relegation2].filter(Boolean);
      return userPicks.filter((pick) => actualRelegated.includes(pick)).length * 5;
    }
    if (betKey === 'topScorer' && userBets.topScorer && userBets.topScorer === seasonResults?.topScorer) {
      return 7;
    }
    if (betKey === 'topAssists' && userBets.topAssists && userBets.topAssists === seasonResults?.topAssists) {
      return 5;
    }
    return 0;
  };

  const getUsersToDisplay = () => users;

  const renderMatchScore = (home: number, away: number) => (
    <span className="match-score-rtl">
      <span>{home}</span>
      <span aria-hidden="true">–</span>
      <span>{away}</span>
    </span>
  );

  const renderRoundBetCell = (
    user: UserInfo,
    bet: Bet | undefined,
    matchInfo: MatchInfo
  ) => {
    const styling = getCellStyling(bet, matchInfo);
    const hasResult =
      typeof matchInfo.actualHomeScore === 'number' &&
      typeof matchInfo.actualAwayScore === 'number';

    return (
      <div key={user.uid} className={`all-users-bet-cell ${styling.bg} ${styling.text}`}>
        {bet && isUniqueBet(bet) && hasResult && (
          <span className="all-users-unique-star" title="בונוס בלעדיות — היחיד שפגע">
            ★
          </span>
        )}
        <div className="all-users-bet-name" title={user.displayName}>
          {user.displayName}
        </div>
        <div className="all-users-bet-body">
          {matchInfo.isCancelled ? (
            <div className="all-users-bet-value text-red-400">
              {bet ? renderMatchScore(bet.homeScore, bet.awayScore) : 'בוטל'}
            </div>
          ) : bet ? (
            <div className="all-users-bet-value">
              {renderMatchScore(bet.homeScore, bet.awayScore)}
            </div>
          ) : (
            <div className="all-users-bet-value text-muted-foreground">—</div>
          )}
          {hasResult && bet && (bet.points ?? 0) > 0 && renderPointsBadge(bet.points ?? 0, isUniqueBet(bet))}
        </div>
      </div>
    );
  };

  const renderPreseasonBetCell = (betKey: string, user: UserInfo) => {
    const display = getPreseasonUserDisplay(betKey, user.uid);
    const points = getPreseasonUserPoints(betKey, user.uid);
    const isCorrect = points > 0;

    return (
      <div
        key={user.uid}
        className={`all-users-bet-cell ${isCorrect ? 'bet-hit-exact' : 'bet-miss'}`}
      >
        <div className="all-users-bet-name" title={user.displayName}>
          {user.displayName}
        </div>
        <div className="all-users-bet-body">
          <div className={`all-users-bet-value ${isCorrect ? 'text-emerald-300' : ''}`}>
            {display || <span className="text-muted-foreground">—</span>}
          </div>
          {isCorrect && (
            <span className="all-users-bet-points text-emerald-700 dark:text-emerald-300">
              <span className="all-users-bet-points-value">+{points}</span>
              <span className="all-users-bet-points-label">נק׳</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <PageShell>
      <PageHeader title="הימורי כל המשתמשים" />

      <div className="segmented-control">
        <button type="button" className={`segmented-item ${activeTab === 'round' ? 'segmented-item-active' : ''}`}
          onClick={() => setActiveTab('round')}>הימורי מחזור</button>
        <button type="button" className={`segmented-item ${activeTab === 'preseason' ? 'segmented-item-active' : ''}`}
          onClick={() => setActiveTab('preseason')} disabled={!seasonStarted}>הימורים מקדימים</button>
      </div>
        {/* Tab Content */}
        {activeTab === 'round' && (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor="round-select" className="shrink-0 text-sm font-medium text-muted-foreground">מחזור:</label>
              <select id="round-select" className="app-select flex-1" value={selectedRound ?? ''}
                onChange={e => setSelectedRound(Number(e.target.value))}>
                {rounds.map(r => (
                  <option key={r.number} value={r.number}>{r.name || `מחזור ${r.number}`}</option>
                ))}
              </select>
            </div>

            {!loading && (
              <>
                {/* הודעות מידע למחזור */}
                {(() => {
                  const selectedRoundName =
                    rounds.find((r) => r.number === selectedRound)?.name ||
                    `מחזור ${selectedRound}`;
                  const hasBets = Object.keys(betsByUser).length > 0;
                  const hasAnyResults = Object.values(matchesMap).some(
                    (match) =>
                      !match.isCancelled &&
                      typeof match.actualHomeScore === 'number' &&
                      typeof match.actualAwayScore === 'number'
                  );

                  return (
                    <div className="space-y-2">
                      {!roundClosed && (
                        <StatusBanner
                          variant="info"
                          icon={Clock}
                          title="חלון הימורים פתוח"
                          description={`ההימורים יוצגו כאשר יסגר חלון ההזדמנויות להימורים ל${selectedRoundName}`}
                        />
                      )}

                      {roundClosed && !hasBets && (
                        <StatusBanner
                          variant="info"
                          icon={Info}
                          title="אין הימורים להצגה"
                          description={`לא הוזנו הימורים ל${selectedRoundName} על ידי אף משתמש`}
                        />
                      )}

                      {roundClosed && hasBets && !hasAnyResults && (
                        <StatusBanner
                          variant="warning"
                          icon={CheckCircle}
                          title="ממתין לתוצאות"
                          description='התוצאות יפורסמו כאשר יוזנו ע"י אדמין המערכת'
                        />
                      )}
                    </div>
                  );
                })()}
                
                {roundClosed && Object.keys(betsByUser).length > 0 && (
                  <>
                    <div className="all-users-legend">
                      <div className="flex items-center gap-1">
                        <span className="all-users-legend-swatch bet-hit-exact" />
                        מדויק
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="all-users-legend-swatch bet-hit-direction" />
                        כיוון
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="all-users-legend-star">★</span>
                        בלעדי
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="all-users-legend-swatch bet-miss" />
                        החטאה
                      </div>
                    </div>

                    <div className="space-y-2.5">
                        {sortedMatchIds.map((matchId) => {
                          const matchInfo = matchesMap[matchId];
                          if (!matchInfo) return null;
                          const usersToShow = getUsersToDisplay();
                          const betsForMatch = usersToShow.map(user => 
                            betsByUser[user.uid]?.find(bet => bet.matchId === matchId)
                          );
                          
                          return (
                            <div key={matchId} className="all-users-match-card">
                              <div className={matchInfo.isCancelled ? 'all-users-match-header-cancelled' : 'all-users-match-header'}>
                                <h3 className="all-users-match-title">
                                  {matchInfo.homeTeam} – {matchInfo.awayTeam}
                                </h3>
                                <div className="all-users-match-score">
                                  {matchInfo.isCancelled ? (
                                    <span className="text-red-400">בוטל</span>
                                  ) : (typeof matchInfo.actualHomeScore === 'number' && typeof matchInfo.actualAwayScore === 'number')
                                    ? renderMatchScore(matchInfo.actualHomeScore, matchInfo.actualAwayScore)
                                    : <span className="text-muted-foreground">—</span>}
                                </div>
                              </div>

                              <div className="all-users-bets-grid">
                                {usersToShow.map((user, idx) =>
                                  renderRoundBetCell(user, betsForMatch[idx], matchInfo)
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                  </>
                )}
              </>
            )}
          </>
        )}
        {activeTab === 'preseason' && (
          seasonStarted ? (
            <>
              <div className="space-y-2.5">
                  {PRESEASON_CATEGORIES.map(({ key, label }) => {
                    const resultDisplay = getPreseasonResult(key);

                    return (
                      <div key={key} className="all-users-match-card">
                        <div className="all-users-category-header">
                          <h3 className="all-users-category-title">{label}</h3>
                          {seasonResults && (
                            <div className="all-users-category-result">
                              {resultDisplay || <span className="text-muted-foreground">—</span>}
                            </div>
                          )}
                        </div>

                        <div className="all-users-bets-grid">
                          {users.map((user) => renderPreseasonBetCell(key, user))}
                        </div>
                      </div>
                    );
                  })}
                  
                  {users.length === 0 && (
                    <div className="py-8 text-center text-muted-foreground">אין משתמשים להצגה</div>
                  )}
                  {users.length > 0 && Object.keys(preSeasonBetsByUser).length === 0 && (
                    <div className="py-8 text-center text-muted-foreground">אין הימורים מקדימים להצגה</div>
                  )}
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm font-semibold text-red-400">
              הימורים מקדימים יוצגו רק לאחר תחילת העונה ({seasonStartDate ? formatIsraelDateTime(seasonStartDate) : ''})
            </div>
          )
        )}
        {loading && <p className="py-4 text-center text-sm text-muted-foreground">טוען...</p>}
    </PageShell>
  );
};

export default AllUsersBetsPage; 