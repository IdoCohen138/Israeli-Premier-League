import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentSeason, getCurrentRound, getSeasonPath } from '@/lib/season';
import { getPlayerRoundBets } from '@/lib/playerBets';

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

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-2">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold mb-6 text-center text-blue-700">הימורי כל המשתמשים</h1>
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
                            {betsByUser[user.uid].map((bet, i) => {
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
      </div>
    </div>
  );
};

export default AllUsersBetsPage; 