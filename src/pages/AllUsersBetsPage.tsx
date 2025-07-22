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
            {!roundClosed && (
              <div className="text-center text-red-500 font-bold mb-4">
                לא ניתן להציג את הימורי המחזור עד לסגירתו.
              </div>
            )}
            {roundClosed && !loading && (
              <>
                {/* מקרא צבעים */}
                <div className="flex flex-wrap gap-4 items-center justify-center mb-4 text-xs">
                  <div className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-green-200 border border-green-400"></span> פגיעה מדויקת</div>
                  <div className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-yellow-200 border border-yellow-400"></span> פגיעה בכיוון</div>
                  <div className="flex items-center gap-1"><span className="text-purple-600 text-lg">★</span> בלעדיות (היחיד שפגע)</div>
                  <div className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-gray-100 border border-gray-300"></span> לא פגע</div>
                </div>
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
                        // אסוף את כל ההימורים של המשתמשים למשחק זה
                        const betsForMatch = users.map(user => (betsByUser[user.uid]?.find(bet => bet.matchId === matchId)));
                        // מצא את התוצאה האמיתית (אם יש)
                        // (אין לנו כאן את התוצאה בפועל, אז נניח שהשדה points קיים רק אם חושב)
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
                              let bg = 'bg-gray-100 border border-gray-300';
                              let text = 'text-gray-800';
                              let bonusIcon = null;
                              
                              // אם המשחק בוטל, לא מציגים צבעים מיוחדים
                              if (!matchInfo.isCancelled && bet?.points !== undefined) {
                                // בלעדיות - 6 נקודות (תוצאה מדויקת + בלעדיות) או 2 נקודות (כיוון נכון + בלעדיות)
                                if (bet.points === 6) {
                                  bg = 'bg-green-200 border border-green-400';
                                  text = 'text-green-900 font-bold';
                                  bonusIcon = <span title="בונוס בלעדיות" className="ml-1 text-purple-600">★</span>;
                                } 
                                else if (bet.points === 3) {
                                  bg = 'bg-green-200 border border-green-400';
                                  text = 'text-green-900 font-bold';
                                } 
                                else if (bet.points === 2) {
                                  bg = 'bg-yellow-200 border border-yellow-400';
                                  text = 'text-yellow-900 font-bold';
                                  bonusIcon = <span title="בונוס בלעדיות" className="ml-1 text-purple-600">★</span>;
                                }
                                // כיוון נכון ללא בלעדיות - 1 נקודה
                                else if (bet.points === 1) {
                                  bg = 'bg-yellow-200 border border-yellow-400';
                                  text = 'text-yellow-900 font-bold';
                                }
                                // לא נכון - 0 נקודות
                                else {
                                  bg = 'bg-gray-100 border border-gray-300';
                                  text = 'text-gray-800';
                                }
                              }
                              return (
                                <td key={user.uid} className={`p-3 border-b text-center align-middle ${bg} ${text} relative ${matchInfo.isCancelled ? 'opacity-70' : ''}`}>
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
              </>
            )}
            {loading && <div className="text-center text-gray-500 py-8">טוען...</div>}
          </>
        )}
        {activeTab === 'preseason' && (
          seasonStarted ? (
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