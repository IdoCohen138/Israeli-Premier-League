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
            awayTeam: data.awayTeam || ''
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
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white rounded-xl shadow border-separate border-spacing-0">
                  <thead className="bg-blue-100 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 border-b text-blue-800 text-lg font-semibold text-center">משתמש</th>
                      <th className="p-3 border-b text-blue-800 text-lg font-semibold text-center">הימורים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, idx) => (
                      <tr key={user.uid} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                        <td className="p-3 border-b font-bold text-gray-800 text-center align-top w-40">{user.displayName}</td>
                        <td className="p-3 border-b">
                          {betsByUser[user.uid] ? (
                            <table className="w-full text-sm rounded-lg">
                              <thead>
                                <tr>
                                  <th className="p-1 text-gray-600">משחק</th>
                                  <th className="p-1 text-gray-600">תוצאה</th>
                                </tr>
                              </thead>
                              <tbody>
                                {betsByUser[user.uid].map((bet) => {
                                  const match = matchesMap[bet.matchId];
                                  const matchLabel = match ? `${match.homeTeam} - ${match.awayTeam}` : bet.matchId;
                                  return (
                                    <tr key={bet.matchId} className={
                                      bet.isExactResult ? 'bg-green-100 font-bold' : bet.isCorrectDirection ? 'bg-yellow-100' : ''
                                    }>
                                      <td className="p-1 text-center">{matchLabel}</td>
                                      <td className="p-1 text-center">{bet.homeScore} - {bet.awayScore}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <div className="text-gray-400 text-center py-2">לא הימר</div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={2} className="text-center text-gray-400 py-8">אין משתמשים להצגה</td>
                      </tr>
                    )}
                    {users.length > 0 && Object.keys(betsByUser).length === 0 && (
                      <tr>
                        <td colSpan={2} className="text-center text-gray-400 py-8">אין הימורים למחזור זה</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                </thead>
                <tbody>
                  {users.map((user, idx) => (
                    <tr key={user.uid} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                      <td className="p-3 border-b font-bold text-gray-800 text-center align-top w-40">{user.displayName}</td>
                      {Object.keys(PRESEASON_BET_LABELS).map((betKey) => {
                        const betValue = preSeasonBetsByUser[user.uid]?.[betKey];
                        let display = '';
                        if (['champion', 'cup', 'relegation1', 'relegation2'].includes(betKey)) {
                          display = teams.find(t => t.uid === betValue)?.name || '';
                        } else if (['topScorer', 'topAssists'].includes(betKey)) {
                          display = players.find(p => p.uid === betValue)?.name || '';
                        }
                        return (
                          <td key={betKey} className="p-3 border-b text-center text-sm">{display || <span className="text-gray-400">—</span>}</td>
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