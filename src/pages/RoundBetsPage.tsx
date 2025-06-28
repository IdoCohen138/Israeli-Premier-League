import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Calendar, Clock, Target } from "lucide-react";
import { Match, Round, Bet, Team } from "@/types";
import { collection, doc, getDocs, setDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath, getCurrentSeason } from "@/lib/season";

export default function RoundBetsPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rounds, setRounds] = useState<Round[]>([]);
    const [selectedRound, setSelectedRound] = useState<number | null>(null);
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [bets, setBets] = useState<Bet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedRound) {
            loadRoundData(selectedRound);
        }
    }, [selectedRound]);

    const loadData = async () => {
        try {
            const seasonPath = getSeasonPath();
            console.log('=== DEBUG: RoundBetsPage ===');
            console.log('Season path:', seasonPath);
            console.log('Current date:', new Date().toISOString());

            // טעינת מחזורים - יש collection בשם rounds ברמה העליונה
            console.log('Loading rounds from: rounds collection');
            const roundsSnapshot = await getDocs(collection(db, 'rounds'));
            console.log('Rounds snapshot size:', roundsSnapshot.size);
            console.log('Rounds snapshot empty:', roundsSnapshot.empty);
            
            if (roundsSnapshot.empty) {
                console.log('No rounds found in database!');
                setError('לא נמצאו מחזורים במסד הנתונים');
                return;
            }
            
            const roundsData = roundsSnapshot.docs.map(doc => {
                const data = doc.data();
                console.log('Round document data:', data);
                
                // המבנה: כל מסמך הוא מחזור עם שדה matches
                const round: Round = {
                    number: parseInt(doc.id), // מספר המחזור הוא ה-ID של המסמך
                    matches: data.matches || [], // מערך המשחקים
                    closingTime: data.closingTime || '',
                    endTime: data.endTime || '',
                    isActive: data.isActive || false
                };
                
                console.log('Processed round:', round);
                return round;
            });
            
            setRounds(roundsData.sort((a, b) => a.number - b.number));
            console.log('Final rounds array:', roundsData);

            // טעינת קבוצות
            console.log('Loading teams from:', `${seasonPath}/teams`);
            const teamsSnapshot = await getDocs(collection(db, seasonPath, 'teams'));
            console.log('Teams snapshot size:', teamsSnapshot.size);
            console.log('Teams snapshot empty:', teamsSnapshot.empty);
            
            const teamsData = teamsSnapshot.docs.map(doc => {
                const data = { uid: doc.id, ...doc.data() } as Team;
                console.log('Team data:', data);
                return data;
            });
            setTeams(teamsData);
            console.log('Final teams array:', teamsData);

            if (roundsData.length > 0) {
                setSelectedRound(roundsData[0].number);
            } else {
                console.log('No rounds available to select');
            }
        } catch (error) {
            console.error('Error loading data:', error);
            console.error('Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                code: error instanceof Error && 'code' in error ? (error as any).code : 'No code',
                stack: error instanceof Error ? error.stack : 'No stack'
            });
            setError('שגיאה בטעינת הנתונים. אנא נסה שוב.');
        } finally {
            setLoading(false);
        }
    };

    const loadRoundData = async (roundNumber: number) => {
        try {
            console.log('=== DEBUG: loadRoundData ===');
            console.log('Loading round data for round:', roundNumber);
            console.log('From path: rounds/', roundNumber);
            
            const roundDoc = await getDoc(doc(db, 'rounds', roundNumber.toString()));
            console.log('Round document exists:', roundDoc.exists());
            
            if (roundDoc.exists()) {
                const data = roundDoc.data();
                console.log('Round document data:', data);
                
                const roundData: Round = {
                    number: roundNumber,
                    matches: data.matches || [],
                    closingTime: data.closingTime || '',
                    endTime: data.endTime || '',
                    isActive: data.isActive || false
                };
                
                console.log('Processed round data:', roundData);
                setCurrentRound(roundData);

                // טעינת הימורים קיימים
                if (user) {
                    console.log('Loading bets for user:', user.uid, 'round:', roundNumber);
                    const betsQuery = query(
                        collection(db, 'bets'),
                        where('userId', '==', user.uid),
                        where('round', '==', roundNumber)
                    );
                    const betsSnapshot = await getDocs(betsQuery);
                    const betsData = betsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Bet));
                    setBets(betsData);
                    console.log('Loaded bets for round:', betsData);
                }
            } else {
                console.log('Round document does not exist!');
                setCurrentRound(null);
            }
        } catch (error) {
            console.error('Error loading round data:', error);
            console.error('Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                code: error instanceof Error && 'code' in error ? (error as any).code : 'No code',
                stack: error instanceof Error ? error.stack : 'No stack'
            });
            setError('שגיאה בטעינת נתוני המחזור. אנא נסה שוב.');
        }
    };

    const handleBet = async (matchId: string, homeScore: number, awayScore: number) => {
        if (!user || !selectedRound) return;

        try {
            const betId = `${user.uid}_${matchId}`;
            const newBet: Bet = {
                uid: betId,
                userId: user.uid,
                matchId,
                round: selectedRound,
                homeScore,
                awayScore,
            };

            await setDoc(doc(db, 'bets', betId), newBet);
            
            // עדכון המצב המקומי
            setBets(prev => {
                const filtered = prev.filter(bet => bet.matchId !== matchId);
                return [...filtered, newBet];
            });
        } catch (error) {
            console.error('Error saving bet:', error);
            setError('שגיאה בשמירת ההימור. אנא נסה שוב.');
        }
    };

    const getBetForMatch = (matchId: string) => {
        return bets.find(bet => bet.matchId === matchId);
    };

    const getTeamName = (teamId: string) => {
        return teams.find(team => team.uid === teamId)?.name || 'קבוצה לא ידועה';
    };

    const formatDateTime = (date: string, time: string) => {
        const dateObj = new Date(`${date}T${time}`);
        return dateObj.toLocaleString('he-IL', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div dir="rtl" className="p-4 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">טוען...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div dir="rtl" className="p-4 min-h-screen bg-gray-50">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <p className="text-red-700">{error}</p>
                    </div>
                    <Button onClick={() => window.location.reload()}>נסה שוב</Button>
                </div>
            </div>
        );
    }

    return (
        <div dir="rtl" className="p-4 min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900">הימורי מחזור</h1>
                        <p className="text-sm text-gray-600">הימור על תוצאות מדויקות</p>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2"
                    >
                        <ArrowRight size={16} />
                        חזרה לדף הבית
                    </Button>
                </div>

                {/* Round Selection */}
                <Card className="bg-white rounded-xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            בחירת מחזור
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {rounds.map((round) => (
                                <Button
                                    key={round.number}
                                    variant={selectedRound === round.number ? "default" : "outline"}
                                    onClick={() => setSelectedRound(round.number)}
                                >
                                    מחזור {round.number}
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Current Round Info */}
                {currentRound && (
                    <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-blue-900">מחזור {currentRound.number}</h3>
                                    <p className="text-sm text-blue-700">
                                        שעת נעילה: {formatDateTime(currentRound.closingTime, '00:00')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-blue-700">
                                        סיום מחזור: {formatDateTime(currentRound.endTime, '00:00')}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Matches */}
                {currentRound && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold text-gray-900">משחקי המחזור</h2>
                        {currentRound.matches.map((match) => (
                            <Card key={match.uid} className="bg-white rounded-xl shadow-sm">
                                <CardContent className="p-6">
                                    <div className="space-y-4">
                                        {/* Match Info */}
                                        <div className="flex items-center justify-between">
                                            <div className="text-center flex-1">
                                                <h3 className="font-semibold text-lg">{getTeamName(match.homeTeamId)}</h3>
                                            </div>
                                            <div className="text-center mx-4">
                                                <div className="text-sm text-gray-600">נגד</div>
                                                <div className="text-xs text-gray-500">
                                                    {formatDateTime(match.date, match.startTime)}
                                                </div>
                                            </div>
                                            <div className="text-center flex-1">
                                                <h3 className="font-semibold text-lg">{getTeamName(match.awayTeamId)}</h3>
                                            </div>
                                        </div>

                                        {/* Current Bet */}
                                        {getBetForMatch(match.uid) && (
                                            <div className="p-3 bg-green-50 rounded-lg text-center">
                                                <p className="text-sm text-green-700 font-medium">
                                                    ההימור שלך: {getBetForMatch(match.uid)?.homeScore} - {getBetForMatch(match.uid)?.awayScore}
                                                </p>
                                            </div>
                                        )}

                                        {/* Bet Input */}
                                        <div className="flex items-center justify-center gap-4">
                                            <div className="text-center">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    {getTeamName(match.homeTeamId)}
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="20"
                                                    className="w-16 h-12 text-center border rounded-lg"
                                                    placeholder="0"
                                                    defaultValue={getBetForMatch(match.uid)?.homeScore || ''}
                                                />
                                            </div>
                                            <span className="text-lg font-semibold">-</span>
                                            <div className="text-center">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    {getTeamName(match.awayTeamId)}
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="20"
                                                    className="w-16 h-12 text-center border rounded-lg"
                                                    placeholder="0"
                                                    defaultValue={getBetForMatch(match.uid)?.awayScore || ''}
                                                />
                                            </div>
                                            <Button
                                                onClick={() => {
                                                    const homeInput = document.querySelector(`input[data-match="${match.uid}-home"]`) as HTMLInputElement;
                                                    const awayInput = document.querySelector(`input[data-match="${match.uid}-away"]`) as HTMLInputElement;
                                                    const homeScore = parseInt(homeInput?.value || '0');
                                                    const awayScore = parseInt(awayInput?.value || '0');
                                                    handleBet(match.uid, homeScore, awayScore);
                                                }}
                                                className="mr-4"
                                            >
                                                שמור הימור
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Scoring Info */}
                <Card className="bg-yellow-50 border-yellow-200">
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-yellow-900 mb-2">חלוקת נקודות</h3>
                        <ul className="text-sm text-yellow-800 space-y-1">
                            <li>• כיוון נכון: 1 נקודה</li>
                            <li>• תוצאה מדויקת: 3 נקודות</li>
                            <li>• בונוס כפול אם רק אתה צדקת במשחק</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 