import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentSeason, getCurrentRound, getSeasonPath, getCurrentSeasonData, getSortedRounds, getDefaultBettingRound } from '@/lib/season';
import { sortMatchesByStartTime } from '@/lib/sorting';
import { ensureServerTimeSynced, isDeadlinePassed } from '@/lib/serverTime';
import { formatIsraelDateTime, parseIsraelDateTime } from '@/lib/israelTime';
import { useAuth } from '@/contexts/AuthContext';
import { getPlayerRoundBets, getPlayerPreSeasonBets } from '@/lib/playerBets';
import PageShell from '@/components/layout/PageShell';
import PageHeader from '@/components/layout/PageHeader';
import StatusBanner from '@/components/layout/StatusBanner';
import { Clock, CheckCircle } from 'lucide-react';
import { Team, Player } from '@/types';

const PRESEASON_BET_LABELS: Record<string, string> = {
  champion: 'אלופה',
  cup: 'זוכת גביע',
  relegation1: 'יורדת 1',
  relegation2: 'יורדת 2',
  topScorer: 'מלך שערים',
  topAssists: 'מלך בישולים',
};

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
  const [currentRound, setCurrentRound] = useState<number | null>(null);
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

      const defaultRound = await getDefaultBettingRound();
      const currRound = await getCurrentRound();
      setCurrentRound(currRound);
      setSelectedRound(defaultRound ?? currRound);
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
  }, [selectedRound, users, rounds, currentRound]);

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
  const getCellStyling = (bet: Bet | undefined, matchInfo: MatchInfo) => {
    if (matchInfo.isCancelled) {
      return { bg: 'bet-miss', text: 'text-muted-foreground' };
    }
    if (!bet?.points) {
      return { bg: 'bet-miss', text: 'text-foreground' };
    }
    if (bet.points === 6 || bet.points === 3) {
      return { bg: 'bet-hit-exact', text: 'font-bold' };
    }
    if (bet.points === 2 || bet.points === 1) {
      return { bg: 'bet-hit-direction', text: 'font-bold' };
    }
    return { bg: 'bet-miss', text: 'text-foreground' };
  };

  const getPointsPillClass = (points: number) => {
    if (points === 6 || points === 3) return 'points-pill-exact';
    if (points === 2 || points === 1) return 'points-pill-direction';
    return 'text-muted-foreground text-xs';
  };

  // Helper function to get bonus icon
  const getBonusIcon = (bet: Bet | undefined) => {
    if (!bet?.points) return null;
    if (bet.points === 6 || bet.points === 2) {
      return <span title="בונוס בלעדיות" className="text-violet-400 text-sm">★</span>;
    }
    return null;
  };

  // Get users to display - always return all users
  const getUsersToDisplay = () => {
    return users;
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
                  const hasAnyResults = Object.values(matchesMap).some(match => 
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
                          description={`ההימורים יוצגו כאשר יסגר חלון ההזדמנויות להימורים ל${rounds.find(r => r.number === selectedRound)?.name || `מחזור ${selectedRound}`}`}
                        />
                      )}

                      {roundClosed && !hasAnyResults && Object.keys(betsByUser).length > 0 && (
                        <StatusBanner
                          variant="warning"
                          icon={CheckCircle}
                          title="ממתין לתוצאות"
                          description='התוצאות יפורסמו כאשר יוזנו ע"י אדמין המערכת'
                        />
                      )}

                      {roundClosed && Object.keys(betsByUser).length === 0 && (
                        <StatusBanner
                          variant="info"
                          icon={Clock}
                          title="חלון הימורים פתוח"
                          description={`ההימורים יוצגו כאשר יסגר חלון ההזדמנויות להימורים ל${rounds.find(r => r.number === selectedRound)?.name || `מחזור ${selectedRound}`}`}
                        />
                      )}
                    </div>
                  );
                })()}
                
                {/* טבלת ההימורים - מוצגת רק כאשר המחזור סגור ויש הימורים */}
                {roundClosed && Object.keys(betsByUser).length > 0 && (
                  <>
                    {/* מקרא צבעים */}
                    <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground sm:text-xs">
                      <div className="flex items-center gap-1"><span className="inline-block h-4 w-4 rounded bet-hit-exact"></span> פגיעה מדויקת</div>
                      <div className="flex items-center gap-1"><span className="inline-block h-4 w-4 rounded bet-hit-direction"></span> פגיעה בכיוון</div>
                      <div className="flex items-center gap-1"><span className="text-violet-400 text-lg">★</span> בלעדיות (היחיד שפגע)</div>
                      <div className="flex items-center gap-1"><span className="inline-block h-4 w-4 rounded bet-miss"></span> לא פגע</div>
                    </div>



                    <div className="space-y-3">
                        {sortedMatchIds.map((matchId) => {
                          const matchInfo = matchesMap[matchId];
                          if (!matchInfo) return null;
                          const usersToShow = getUsersToDisplay();
                          const betsForMatch = usersToShow.map(user => 
                            betsByUser[user.uid]?.find(bet => bet.matchId === matchId)
                          );
                          
                          return (
                            <div key={matchId} className="app-card overflow-hidden">
                              <div className={matchInfo.isCancelled ? 'match-card-header-cancelled' : 'match-card-header'}>
                                <div className="text-center">
                                  <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">
                                    {matchInfo.homeTeam} - {matchInfo.awayTeam}
                                  </h3>
                                  <div className="text-center">
                                    <span className="text-lg font-bold">
                                      {matchInfo.isCancelled ? (
                                        <span className="text-red-400">בוטל</span>
                                      ) : (typeof matchInfo.actualHomeScore === 'number' && typeof matchInfo.actualAwayScore === 'number')
                                        ? `${matchInfo.actualHomeScore} - ${matchInfo.actualAwayScore}`
                                        : <span className="text-muted-foreground">—</span>}
                                    </span>
                                  </div>
                                  {matchInfo.isCancelled && (
                                    <div className="mt-1">
                                      <span className="text-sm font-bold text-red-400">משחק בוטל</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="p-3 sm:p-4">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                                  {usersToShow.map((user, idx) => {
                                    const bet = betsForMatch[idx];
                                    const styling = getCellStyling(bet, matchInfo);
                                    const bonusIcon = getBonusIcon(bet);
                                    
                                    return (
                                      <div key={user.uid} className={`rounded-lg p-2.5 sm:p-3 ${styling.bg} ${styling.text}`}>
                                        <div className="text-center">
                                          <div className="mb-1 text-xs font-semibold sm:text-sm">{user.displayName}</div>
                                          {matchInfo.isCancelled ? (
                                            <div className="flex flex-col items-center">
                                              <span className="text-sm font-bold text-red-400">בוטל</span>
                                              {bet && (
                                                <span className="mt-1 text-xs text-muted-foreground">
                                                  {bet.homeScore} - {bet.awayScore}
                                                </span>
                                              )}
                                            </div>
                                          ) : bet ? (
                                            <>
                                              <div className="flex items-center justify-center gap-1">
                                                {bonusIcon}
                                                <span className="text-base font-bold sm:text-lg">{bet.homeScore} - {bet.awayScore}</span>
                                              </div>
                                              {(typeof matchInfo.actualHomeScore === 'number' && typeof matchInfo.actualAwayScore === 'number') ? (
                                                <div className={`mt-1.5 ${getPointsPillClass(bet.points ?? 0)}`}>
                                                  {bet.points ?? 0} נק'
                                                </div>
                                              ) : null}
                                            </>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                
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
              <div className="space-y-3">
                  {Object.entries(PRESEASON_BET_LABELS).map(([betKey, label]) => {
                    // Get result for this category
                    let resultDisplay = '';
                    if (['champion', 'cup', 'relegation1', 'relegation2'].includes(betKey)) {
                      resultDisplay = teams.find(t => t.uid === seasonResults?.[betKey === 'cup' ? 'cupWinner' : betKey])?.name || '';
                    } else if (['topScorer', 'topAssists'].includes(betKey)) {
                      resultDisplay = players.find(p => p.uid === seasonResults?.[betKey])?.name || '';
                    }

                    return (
                      <div key={betKey} className="app-card overflow-hidden">
                        <div className="match-card-header">
                          <h3 className="text-center text-base font-bold text-foreground sm:text-lg">{label}</h3>
                          {seasonResults && (
                            <div className="mt-1 text-center">
                              <span className="text-base font-bold text-emerald-400 sm:text-lg">
                                {resultDisplay || <span className="text-muted-foreground">—</span>}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="p-3 sm:p-4">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                            {users.map((user) => {
                              const betValue = preSeasonBetsByUser[user.uid]?.[betKey];
                              let display = '';
                              let isCorrect = false;
                              let points = 0;
                              
                              if (['champion', 'cup'].includes(betKey)) {
                                display = teams.find(t => t.uid === betValue)?.name || '';
                                const resultId = betKey === 'cup' ? seasonResults?.cupWinner : seasonResults?.[betKey];
                                if (betValue && resultId && betValue === resultId) {
                                  isCorrect = true;
                                  points = betKey === 'champion' ? 10 : 8;
                                }
                              } else if (['relegation1', 'relegation2'].includes(betKey)) {
                                display = teams.find(t => t.uid === betValue)?.name || '';
                                const actualRelegated = [seasonResults?.relegation1, seasonResults?.relegation2].filter(Boolean);
                                if (betValue && actualRelegated.includes(betValue)) {
                                  isCorrect = true;
                                  points = 5;
                                }
                              } else if (['topScorer', 'topAssists'].includes(betKey)) {
                                display = players.find(p => p.uid === betValue)?.name || '';
                                if (betValue && seasonResults?.[betKey] && betValue === seasonResults[betKey]) {
                                  isCorrect = true;
                                  points = betKey === 'topScorer' ? 7 : 5;
                                }
                              }

                              return (
                                <div key={user.uid} className={`rounded-lg p-2.5 sm:p-3 ${isCorrect ? 'bet-correct' : 'bet-miss'}`}>
                                  <div className="text-center">
                                    <div className="mb-1 text-xs font-semibold text-foreground sm:text-sm">{user.displayName}</div>
                                    <div className={`text-sm ${isCorrect ? 'font-bold text-emerald-300' : 'text-foreground'}`}>
                                      {display || <span className="text-muted-foreground">—</span>}
                                    </div>
                                    {isCorrect && (
                                      <div className="mt-1.5 text-xs font-bold text-emerald-400">{points} נק'</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
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