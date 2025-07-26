import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentSeason, getCurrentRound, getSeasonPath, getCurrentSeasonData } from '@/lib/season';
import { getPlayerRoundBets, getPlayerPreSeasonBets } from '@/lib/playerBets';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
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
}

const AllUsersBetsPage: React.FC = () => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [rounds, setRounds] = useState<{ number: number; startTime: string }[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [betsByUser, setBetsByUser] = useState<Record<string, Bet[]>>({});
  const [matchesMap, setMatchesMap] = useState<Record<string, MatchInfo>>({});
  const [loading, setLoading] = useState(true);
  const [roundClosed, setRoundClosed] = useState(true);
  const [activeTab, setActiveTab] = useState<'round' | 'preseason'>('round');
  const [preSeasonBetsByUser, setPreSeasonBetsByUser] = useState<Record<string, any>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [seasonStarted, setSeasonStarted] = useState(false);
  const [seasonStartDate, setSeasonStartDate] = useState<Date | null>(null);
  const [seasonResults, setSeasonResults] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const seasonId = getCurrentSeason();
      const playerBetsSnap = await getDocs(collection(db, 'season', seasonId, 'playerBets'));
      const usersList: UserInfo[] = playerBetsSnap.docs.map(doc => ({
        uid: doc.id,
        displayName: doc.data().displayName || doc.id
      }));
      setUsers(usersList);

      const seasonPath = getSeasonPath();
      const roundsSnap = await getDocs(collection(db, seasonPath, 'rounds'));
      const roundsList = roundsSnap.docs.map(doc => ({
        number: parseInt(doc.id),
        startTime: doc.data().startTime || ''
      })).sort((a, b) => a.number - b.number);
      setRounds(roundsList);

      const currRound = await getCurrentRound();
      setCurrentRound(currRound);
      setSelectedRound(currRound);
      setLoading(false);
    };
    fetchData();
  }, []);

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
          const now = new Date();
          let roundStart: Date | null = null;
          let fixedStartTime = roundData.startTime;
          // If startTime is in 'YYYY-MM-DDTHH:mm' format, append ':00+03:00' (Israel time)
          if (typeof fixedStartTime === 'string') {
            if (fixedStartTime.length === 16) {
              fixedStartTime += ':00+03:00';
            } else if (fixedStartTime.length === 19 && !fixedStartTime.includes('+')) {
              fixedStartTime += '+03:00';
            }
          }
          if (fixedStartTime) {
            roundStart = new Date(fixedStartTime);
          }
          closed = !!(roundStart && now >= roundStart);
        } else {
          closed = false;
        }
        // Fetch all matches for the round and build map
        const matchesSnap = await getDocs(collection(db, 'season', seasonId, 'rounds', selectedRound.toString(), 'matches'));
        matchesMapLocal = {};
        matchesSnap.docs.forEach(doc => {
          const data = doc.data();
          matchesMapLocal[doc.id] = {
            homeTeam: data.homeTeam || '',
            awayTeam: data.awayTeam || '',
            actualHomeScore: data.actualHomeScore,
            actualAwayScore: data.actualAwayScore,
            isCancelled: data.isCancelled || false,
          };
        });
        setMatchesMap(matchesMapLocal);
      } catch (e) {
        closed = true;
        setMatchesMap({});
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
      const seasonData = await getCurrentSeasonData();
      let startDate: Date | null = null;
      if (seasonData?.seasonStart) {
        if (seasonData.seasonStart.toDate) {
          startDate = seasonData.seasonStart.toDate();
        } else if (typeof seasonData.seasonStart === 'string') {
          startDate = new Date(seasonData.seasonStart);
        } else {
          startDate = seasonData.seasonStart;
        }
      }
      setSeasonStartDate(startDate);
      setSeasonStarted(!!(startDate && new Date() > startDate));
    };
    checkSeasonStart();
  }, []);

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
      return { bg: 'bg-gray-100 border border-gray-300', text: 'text-gray-800' };
    }
    
    if (!bet?.points) {
      return { bg: 'bg-gray-100 border border-gray-300', text: 'text-gray-800' };
    }
    
    if (bet.points === 6) {
      return { bg: 'bg-green-200 border border-green-400', text: 'text-green-900 font-bold' };
    } else if (bet.points === 3) {
      return { bg: 'bg-green-200 border border-green-400', text: 'text-green-900 font-bold' };
    } else if (bet.points === 2) {
      return { bg: 'bg-yellow-200 border border-yellow-400', text: 'text-yellow-900 font-bold' };
    } else if (bet.points === 1) {
      return { bg: 'bg-yellow-200 border border-yellow-400', text: 'text-yellow-900 font-bold' };
    }
    
    return { bg: 'bg-gray-100 border border-gray-300', text: 'text-gray-800' };
  };

  // Helper function to get bonus icon
  const getBonusIcon = (bet: Bet | undefined) => {
    if (!bet?.points) return null;
    if (bet.points === 6 || bet.points === 2) {
      return <span title="בונוס בלעדיות" className="text-purple-600 text-sm">★</span>;
    }
    return null;
  };

  // Get users to display - always return all users
  const getUsersToDisplay = () => {
    return users;
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-2">
      <div className="w-full max-w-3xl flex justify-end mb-4">
        <Button variant="outline" size="lg" onClick={() => navigate('/')} className="flex items-center gap-2 px-8 py-2 text-base h-12">
          <ArrowRight size={20} />
          חזרה לדף הבית
        </Button>
      </div>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold mb-6 text-center text-blue-700">הימורי כל המשתמשים</h1>
        {/* Tabs */}
        <div className="flex justify-center mb-6 gap-2">
          <Button variant={activeTab === 'round' ? 'default' : 'outline'} onClick={() => setActiveTab('round')}>הימורי מחזור</Button>
          <Button variant={activeTab === 'preseason' ? 'default' : 'outline'} onClick={() => setActiveTab('preseason')} disabled={!seasonStarted}>הימורים מקדימים</Button>
        </div>
        {/* Tab Content */}
        {activeTab === 'round' && (
          <>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <label htmlFor="round-select" className="font-semibold text-lg text-gray-700">בחר מחזור:</label>
              <select
                id="round-select"
                className="border-2 border-blue-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-400 transition w-40 text-center text-lg bg-blue-50 hover:bg-blue-100"
                value={selectedRound ?? ''}
                onChange={e => setSelectedRound(Number(e.target.value))}
              >
                {rounds.map(r => (
                  <option key={r.number} value={r.number}>מחזור {r.number}</option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex justify-center mb-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    viewMode === 'cards' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  כרטיסים
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    viewMode === 'table' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  טבלה
                </button>
              </div>
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
                    <div className="space-y-3 mb-6">
                      {/* הודעה על חלון הימורים */}
                      {!roundClosed && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-blue-800 font-semibold text-lg">חלון הימורים פתוח</span>
                          </div>
                          <p className="text-blue-700">
                            ההימורים יוצגו כאשר יסגר חלון ההזדמנויות להימורים למחזור {selectedRound}
                          </p>
                        </div>
                      )}
                      
                      {/* הודעה על תוצאות */}
                      {roundClosed && !hasAnyResults && Object.keys(betsByUser).length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-orange-800 font-semibold text-lg">ממתין לתוצאות</span>
                          </div>
                          <p className="text-orange-700">
                            התוצאות יפורסמו כאשר יוזנו ע"י אדמין המערכת
                          </p>
                        </div>
                      )}
                      
                      {/* הודעה על חלון הימורים - גם כאשר המחזור סגור אבל אין הימורים */}
                      {roundClosed && Object.keys(betsByUser).length === 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-blue-800 font-semibold text-lg">חלון הימורים פתוח</span>
                          </div>
                          <p className="text-blue-700">
                            ההימורים יוצגו כאשר יסגר חלון ההזדמנויות להימורים למחזור {selectedRound}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {/* טבלת ההימורים - מוצגת רק כאשר המחזור סגור ויש הימורים */}
                {roundClosed && Object.keys(betsByUser).length > 0 && (
                  <>
                    {/* מקרא צבעים */}
                    <div className="flex flex-wrap gap-4 items-center justify-center mb-4 text-xs">
                      <div className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-green-200 border border-green-400"></span> פגיעה מדויקת</div>
                      <div className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-yellow-200 border border-yellow-400"></span> פגיעה בכיוון</div>
                      <div className="flex items-center gap-1"><span className="text-purple-600 text-lg">★</span> בלעדיות (היחיד שפגע)</div>
                      <div className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-gray-100 border border-gray-300"></span> לא פגע</div>
                    </div>



                    {/* Cards View */}
                    {viewMode === 'cards' && (
                      <div className="space-y-4">
                        {Object.entries(matchesMap).map(([matchId, matchInfo]) => {
                          const usersToShow = getUsersToDisplay();
                          const betsForMatch = usersToShow.map(user => 
                            betsByUser[user.uid]?.find(bet => bet.matchId === matchId)
                          );
                          
                          return (
                            <div key={matchId} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                              {/* Match Header */}
                              <div className={`p-4 ${matchInfo.isCancelled ? 'bg-red-50' : 'bg-blue-50'}`}>
                                <div className="text-center">
                                  <h3 className="text-lg font-bold text-gray-800 mb-2">
                                    {matchInfo.homeTeam} - {matchInfo.awayTeam}
                                  </h3>
                                  <div className="text-center">
                                    <span className="ml-2 font-bold text-lg">
                                      {matchInfo.isCancelled ? (
                                        <span className="text-red-600">בוטל</span>
                                      ) : (typeof matchInfo.actualHomeScore === 'number' && typeof matchInfo.actualAwayScore === 'number')
                                        ? `${matchInfo.actualHomeScore} - ${matchInfo.actualAwayScore}`
                                        : <span className="text-gray-400">—</span>}
                                    </span>
                                  </div>
                                  {matchInfo.isCancelled && (
                                    <div className="mt-2">
                                      <span className="text-red-600 font-bold text-sm">משחק בוטל</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Bets Grid */}
                              <div className="p-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {usersToShow.map((user, idx) => {
                                    const bet = betsForMatch[idx];
                                    const styling = getCellStyling(bet, matchInfo);
                                    const bonusIcon = getBonusIcon(bet);
                                    
                                    return (
                                      <div key={user.uid} className={`p-3 rounded-lg border ${styling.bg} ${styling.text}`}>
                                        <div className="text-center">
                                          <div className="font-semibold text-sm mb-1">{user.displayName}</div>
                                          {matchInfo.isCancelled ? (
                                            <div className="flex flex-col items-center">
                                              <span className="text-red-600 font-bold text-sm">בוטל</span>
                                              {bet && (
                                                <span className="text-gray-500 text-xs mt-1">
                                                  {bet.homeScore} - {bet.awayScore}
                                                </span>
                                              )}
                                            </div>
                                          ) : bet ? (
                                            <>
                                              <div className="flex items-center justify-center gap-1">
                                                {bonusIcon}
                                                <span className="text-lg font-bold">{bet.homeScore} - {bet.awayScore}</span>
                                              </div>
                                              {(typeof matchInfo.actualHomeScore === 'number' && typeof matchInfo.actualAwayScore === 'number') ? (
                                                <div className={`text-xs mt-2 px-2 py-1 rounded-full font-bold ${
                                                  (bet.points ?? 0) === 6
                                                    ? 'bg-green-200 text-green-800' 
                                                    : (bet.points ?? 0) === 3
                                                      ? 'bg-green-200 text-green-800' 
                                                      : (bet.points ?? 0) === 2
                                                        ? 'bg-yellow-200 text-yellow-800' 
                                                        : (bet.points ?? 0) === 1
                                                          ? 'bg-yellow-200 text-yellow-800' 
                                                          : 'text-gray-500'
                                                }`}>
                                                  {bet.points ?? 0} נק'
                                                </div>
                                              ) : null}
                                            </>
                                          ) : (
                                            <span className="text-gray-400">—</span>
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
                    )}

                    {/* Table View */}
                    {viewMode === 'table' && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-xl shadow border-separate border-spacing-0">
                          <thead className="bg-blue-100 sticky top-0 z-10">
                            <tr>
                              <th className="p-3 border-b text-blue-800 text-lg font-semibold text-center">משחק</th>
                              <th className="p-3 border-b text-blue-800 text-lg font-semibold text-center">תוצאה</th>
                              {users.map(user => (
                                <th key={user.uid} className="p-3 border-b text-blue-800 text-lg font-semibold text-center">{user.displayName}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(matchesMap).map(([matchId, matchInfo], matchIdx) => {
                              const betsForMatch = users.map(user => (betsByUser[user.uid]?.find(bet => bet.matchId === matchId)));
                              return (
                                <tr key={matchId} className={`${matchIdx % 2 === 0 ? 'bg-blue-50' : 'bg-white'} ${matchInfo.isCancelled ? 'opacity-70' : ''}`}>
                                  <td className="p-3 border-b font-bold text-gray-800 text-center align-top w-40">
                                    <div className="flex flex-col items-center">
                                      <span>{matchInfo.homeTeam} - {matchInfo.awayTeam}</span>
                                      {matchInfo.isCancelled && (
                                        <span className="text-red-600 text-xs font-bold mt-1">משחק בוטל</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 border-b text-center align-middle font-bold">
                                    {matchInfo.isCancelled ? (
                                      <span className="text-red-600 font-bold">בוטל</span>
                                    ) : (typeof matchInfo.actualHomeScore === 'number' && typeof matchInfo.actualAwayScore === 'number')
                                      ? `${matchInfo.actualHomeScore} - ${matchInfo.actualAwayScore}`
                                      : <span className="text-gray-400">—</span>}
                                  </td>
                                  {users.map((user, idx) => {
                                    const bet = betsForMatch[idx];
                                    const styling = getCellStyling(bet, matchInfo);
                                    const bonusIcon = getBonusIcon(bet);
                                    
                                    return (
                                      <td key={user.uid} className={`p-3 border-b text-center align-middle ${styling.bg} ${styling.text} relative ${matchInfo.isCancelled ? 'opacity-70' : ''}`}>
                                        {matchInfo.isCancelled ? (
                                          <div className="flex flex-col items-center">
                                            <span className="text-red-600 font-bold text-sm">בוטל</span>
                                            {bet && (
                                              <span className="text-gray-500 text-xs mt-1">
                                                {bet.homeScore} - {bet.awayScore}
                                              </span>
                                            )}
                                          </div>
                                        ) : bet ? (
                                          <>
                                            <div className="flex items-center justify-center gap-1">
                                              {bonusIcon}
                                              <span>{bet.homeScore} - {bet.awayScore}</span>
                                            </div>
                                            {(typeof matchesMap[matchId]?.actualHomeScore === 'number' && typeof matchesMap[matchId]?.actualAwayScore === 'number') ? (
                                                <div className={`text-[10px] mt-1 px-2 py-1 rounded-full font-bold ${
                                                  (bet.points ?? 0) === 6
                                                    ? 'bg-green-200 text-green-800' 
                                                    : (bet.points ?? 0) === 3
                                                      ? 'bg-green-200 text-green-800' 
                                                      : (bet.points ?? 0) === 2
                                                        ? 'bg-yellow-200 text-yellow-800' 
                                                        : (bet.points ?? 0) === 1
                                                          ? 'bg-yellow-200 text-yellow-800' 
                                                          : 'text-gray-500'
                                                }`}>
                                                  {bet.points ?? 0} נק'
                                                </div>
                                            ) : null}
                                          </>
                                        ) : (
                                          <span className="text-gray-400">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
        {activeTab === 'preseason' && (
          seasonStarted ? (
            <>
              {/* View Mode Toggle for Preseason */}
              <div className="flex justify-center mb-4">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                      viewMode === 'cards' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    כרטיסים
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                      viewMode === 'table' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    טבלה
                  </button>
                </div>
              </div>

              {/* Cards View for Preseason */}
              {viewMode === 'cards' && (
                <div className="space-y-4">
                  {Object.entries(PRESEASON_BET_LABELS).map(([betKey, label]) => {
                    // Get result for this category
                    let resultDisplay = '';
                    if (['champion', 'cup', 'relegation1', 'relegation2'].includes(betKey)) {
                      resultDisplay = teams.find(t => t.uid === seasonResults?.[betKey === 'cup' ? 'cupWinner' : betKey])?.name || '';
                    } else if (['topScorer', 'topAssists'].includes(betKey)) {
                      resultDisplay = players.find(p => p.uid === seasonResults?.[betKey])?.name || '';
                    }

                    return (
                      <div key={betKey} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                        {/* Category Header */}
                        <div className="p-4 bg-blue-50">
                          <h3 className="text-lg font-bold text-gray-800 text-center">{label}</h3>
                          {seasonResults && (
                            <div className="mt-2 text-center">
                              <span className="ml-2 font-bold text-lg text-blue-700">
                                {resultDisplay || <span className="text-gray-400">—</span>}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* Users Bets Grid */}
                        <div className="p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                                <div key={user.uid} className={`p-3 rounded-lg border ${isCorrect ? 'bg-green-200 border-green-400' : 'bg-gray-50 border-gray-200'}`}>
                                  <div className="text-center">
                                    <div className="font-semibold text-sm mb-1 text-gray-700">{user.displayName}</div>
                                    <div className={`text-sm ${isCorrect ? 'text-green-900 font-bold' : 'text-gray-800'}`}>
                                      {display || <span className="text-gray-400">—</span>}
                                    </div>
                                    {isCorrect && (
                                      <div className="text-xs text-green-700 mt-2 font-bold">{points} נק'</div>
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
                    <div className="text-center text-gray-400 py-8">אין משתמשים להצגה</div>
                  )}
                  {users.length > 0 && Object.keys(preSeasonBetsByUser).length === 0 && (
                    <div className="text-center text-gray-400 py-8">אין הימורים מקדימים להצגה</div>
                  )}
                </div>
              )}

              {/* Table View for Preseason */}
              {viewMode === 'table' && (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white rounded-xl shadow border-separate border-spacing-0">
                    <thead className="bg-blue-100 sticky top-0 z-10">
                      <tr>
                        <th className="p-3 border-b text-blue-800 text-lg font-semibold text-center">משתמש</th>
                        {Object.entries(PRESEASON_BET_LABELS).map(([key, label]) => (
                          <th key={key} className="p-3 border-b text-blue-800 text-lg font-semibold text-center">{label}</th>
                        ))}
                      </tr>
                      {seasonResults && (
                        <tr>
                          <td className="p-3 border-b text-gray-700 font-bold text-center">תוצאה</td>
                          {Object.keys(PRESEASON_BET_LABELS).map((betKey) => {
                            let display = '';
                            if (['champion', 'cup', 'relegation1', 'relegation2'].includes(betKey)) {
                              display = teams.find(t => t.uid === seasonResults[betKey === 'cup' ? 'cupWinner' : betKey])?.name || '';
                            } else if (['topScorer', 'topAssists'].includes(betKey)) {
                              display = players.find(p => p.uid === seasonResults[betKey])?.name || '';
                            }
                            return (
                              <td key={betKey} className="p-3 border-b text-center text-sm font-bold text-blue-700">{display || <span className="text-gray-400">—</span>}</td>
                            );
                          })}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {users.map((user, idx) => (
                        <tr key={user.uid} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                          <td className="p-3 border-b font-bold text-gray-800 text-center align-top w-40">{user.displayName}</td>
                          {Object.keys(PRESEASON_BET_LABELS).map((betKey) => {
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
                              <td key={betKey} className={`p-3 border-b text-center text-sm ${isCorrect ? 'bg-green-200 border border-green-400 text-green-900 font-bold' : ''}`}>
                                {display || <span className="text-gray-400">—</span>}
                                {isCorrect && <div className="text-[10px] text-gray-700 mt-1">{points} נק'</div>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center text-gray-400 py-8">אין משתמשים להצגה</td>
                        </tr>
                      )}
                      {users.length > 0 && Object.keys(preSeasonBetsByUser).length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center text-gray-400 py-8">אין הימורים מקדימים להצגה</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-red-500 font-bold py-8">
              הימורים מקדימים יוצגו רק לאחר תחילת העונה ({seasonStartDate ? seasonStartDate.toLocaleString('he-IL') : ''})
            </div>
          )
        )}
        {loading && <div className="text-center text-gray-500 py-8">טוען...</div>}
      </div>
    </div>
  );
};

export default AllUsersBetsPage; 