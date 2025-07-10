import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import { Match, Round, Bet, Team } from "@/types";
import { collection, doc, getDocs, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath, getCurrentSeason } from "@/lib/season";
import { 
    saveRoundBets, 
    getPlayerRoundBets
} from "@/lib/playerBets";
import { getCurrentRound } from "@/lib/season";
import TeamLogo from "@/components/TeamLogo";

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
    const [hasExistingBets, setHasExistingBets] = useState(false);
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [isBettingAllowed, setIsBettingAllowed] = useState(true);
    const [timeRemaining, setTimeRemaining] = useState<string>('');
    const [betSaved, setBetSaved] = useState<Record<string, boolean>>({});
    const [isRoundDataLoaded, setIsRoundDataLoaded] = useState(false);
    const [currentRoundNumber, setCurrentRoundNumber] = useState<number | null>(null);

    useEffect(() => {
        setCurrentSeason(getCurrentSeason());
        loadData();
    }, []);

    // טעינת המחזור הנוכחי אוטומטית
    useEffect(() => {
        if (rounds.length > 0 && !selectedRound) {
            loadCurrentRound();
        }
    }, [rounds, selectedRound]);



    useEffect(() => {
        if (selectedRound) {
            loadRoundData(selectedRound);
        }
    }, [selectedRound, user]);

    // Timer effect to update countdown
    useEffect(() => {
        if (!currentRound?.startTime || !isBettingAllowed) return;

        const updateTimer = () => {
            checkBettingStatus(currentRound);
        };

        // Update immediately
        updateTimer();
        
        // Update every minute
        const interval = setInterval(updateTimer, 60000);
        
        return () => clearInterval(interval);
    }, [currentRound, isBettingAllowed]);

    const loadCurrentRound = async () => {
        try {
            const currentRound = await getCurrentRound();
            setCurrentRoundNumber(currentRound);
            if (currentRound) {
                setSelectedRound(currentRound);
            } else if (rounds.length > 0) {
                // אם אין מחזור נוכחי, נבחר את המחזור הראשון
                setSelectedRound(rounds[0].number);
            }
        } catch (error) {
            console.error('Error loading current round:', error);
            if (rounds.length > 0) {
                setSelectedRound(rounds[0].number);
            }
        }
    };

    const loadData = async () => {
        try {
            const seasonPath = getSeasonPath();
            const fullPath = `${seasonPath}/rounds`;
            console.log(">>> טוען מחזורים מתוך הנתיב:", fullPath);
            
            const roundsSnapshot = await getDocs(collection(db, seasonPath, 'rounds'));
            console.log(">>> כמות מסמכים ב-rounds:", roundsSnapshot.size);
            
    
            if (roundsSnapshot.empty) {
                setError('לא נמצאו מחזורים במסד הנתונים');
                return;
            }
    
            const roundsData: Round[] = [];
    
            for (const roundDoc of roundsSnapshot.docs) {
                const roundId = roundDoc.id;
                const roundData = roundDoc.data();
    
                // טוען את כל המשחקים מתוך הקולקשן matches של המחזור הזה
                const matchesSnapshot = await getDocs(collection(db, seasonPath, 'rounds', roundId, 'matches'));
    
                const matches = matchesSnapshot.docs.map((doc) => ({
                    uid: doc.id,
                    ...doc.data(),
                })) as Match[];
    
                const round: Round = {
                    number: parseInt(roundId),
                    matches: matches.map(m => m.uid),
                    matchesDetails: matches,
                    startTime: roundData.startTime || '',
                    isActive: roundData.isActive || false,
                };
    
                roundsData.push(round);
            }
    
            setRounds(roundsData.sort((a, b) => a.number - b.number));
    
            const teamsSnapshot = await getDocs(collection(db, seasonPath, 'teams'));
            const teamsData = teamsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as Team[];
            setTeams(teamsData);
    
            // טעינת המחזור הנוכחי
            await loadCurrentRound();
        } catch (error) {
            console.error('Error loading data:', error);
            setError('שגיאה בטעינת הנתונים. אנא נסה שוב.');
        } finally {
            setLoading(false);
        }
    };

    const loadRoundData = async (roundNumber: number) => {
        if (!user) return;
        
        // איפוס מצב הטעינה
        setIsRoundDataLoaded(false);
        setHasExistingBets(false);
        
        try {
            const seasonPath = getSeasonPath();
            console.log('=== DEBUG: loadRoundData ===');
            console.log('Loading round data for round:', roundNumber);
            console.log('From path:', `${seasonPath}/rounds/${roundNumber}`);
            
            const roundDoc = await getDoc(doc(db, seasonPath, 'rounds', roundNumber.toString()));
            console.log('Round document exists:', roundDoc.exists());
            
            if (roundDoc.exists()) {
                const data = roundDoc.data();
                console.log('Round document data:', data);
                
                // טעינת משחקים מקולקשן matches של המחזור
                const matchesSnapshot = await getDocs(collection(db, seasonPath, 'rounds', roundNumber.toString(), 'matches'));
                const matches = matchesSnapshot.docs.map((doc) => ({
                    uid: doc.id,
                    ...doc.data(),
                })) as Match[];
                
                const roundData: Round = {
                    number: roundNumber,
                    matches: matches.map(m => m.uid),
                    matchesDetails: matches,
                    startTime: data.startTime || '',
                    isActive: data.isActive || false
                };
                
                console.log('Processed round data:', roundData);
                setCurrentRound(roundData);
                
                // בדיקת סטטוס ההימורים
                checkBettingStatus(roundData);

                // טעינת הימורים קיימים
                console.log('Loading bets for user:', user.uid, 'round:', roundNumber);
                const existingBets = await getPlayerRoundBets(user.uid, roundNumber);
                if (existingBets) {
                    setBets(existingBets);
                    setHasExistingBets(true);
                    console.log('Loaded bets for round:', existingBets);
                } else {
                    setBets([]);
                    setHasExistingBets(false);
                }
                
                // סימון שהנתונים נטענו
                setIsRoundDataLoaded(true);
            } else {
                console.log('Round document does not exist!');
                setCurrentRound(null);
                setIsRoundDataLoaded(true);
            }
        } catch (error) {
            console.error('Error loading round data:', error);
            setError('שגיאה בטעינת נתוני המחזור. אנא נסה שוב.');
            setIsRoundDataLoaded(true);
        }
    };

    const handleBet = async (matchId: string, homeScore: number, awayScore: number) => {
        if (!user || !selectedRound) return;
        
        if (!isBettingAllowed) {
            setError('תקופת ההימורים למחזור זה הסתיימה. לא ניתן לשנות הימורים יותר.');
            return;
        }

        try {
            const newBet: Bet = {
                userId: user.uid,
                matchId,
                round: selectedRound,
                homeScore,
                awayScore,
            };

            // עדכון או הוספת הימור חדש
            const updatedBets = bets.filter(bet => bet.matchId !== matchId);
            updatedBets.push(newBet);

            await saveRoundBets(user.uid, selectedRound, updatedBets, user.displayName || user.email);
            
            // עדכון המצב המקומי
            setBets(updatedBets);
            setHasExistingBets(true);
            setBetSaved(prev => ({ ...prev, [matchId]: true }));
            setTimeout(() => setBetSaved(prev => ({ ...prev, [matchId]: false })), 2000);
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

    const checkBettingStatus = (round: Round) => {
        if (!round.startTime) {
            setIsBettingAllowed(true);
            setTimeRemaining('');
            return;
        }

        try {
            const now = new Date();
            const startDate = new Date(round.startTime);
            
            // בדיקה שהתאריך תקין
            if (isNaN(startDate.getTime())) {
                console.error('Invalid startTime:', round.startTime);
                setIsBettingAllowed(true);
                setTimeRemaining('');
                return;
            }
            
            const isExpired = now > startDate;
            setIsBettingAllowed(!isExpired);

            if (!isExpired) {
                const timeDiff = startDate.getTime() - now.getTime();
                const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                
                if (days > 0) {
                    setTimeRemaining(`${days} ימים ו-${hours} שעות`);
                } else if (hours > 0) {
                    setTimeRemaining(`${hours} שעות ו-${minutes} דקות`);
                } else {
                    setTimeRemaining(`${minutes} דקות`);
                }
            } else {
                setTimeRemaining('');
            }
        } catch (error) {
            console.error('Error checking betting status:', error);
            setIsBettingAllowed(true);
            setTimeRemaining('');
        }
    };

    const formatDateTime = (dateTimeString: string) => {
        if (!dateTimeString) return 'לא נקבע';
        
        try {
            const dateObj = new Date(dateTimeString);
            if (isNaN(dateObj.getTime())) {
                console.error('Invalid date string:', dateTimeString);
                return 'תאריך לא תקין';
            }
            
            return dateObj.toLocaleString('he-IL', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date:', error, dateTimeString);
            return 'תאריך לא תקין';
        }
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
                        <p className="text-sm text-gray-600">הימור על תוצאות מדויקות - עונה {currentSeason}</p>
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
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5" />
                                בחירת מחזור
                            </CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadCurrentRound}
                                className="text-blue-600 hover:text-blue-700"
                            >
                                מחזור נוכחי
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {rounds.map((round) => {
                                const isSelected = selectedRound === round.number;
                                const isCurrentRound = currentRoundNumber === round.number;
                                const hasStartTime = round.startTime && round.startTime !== '';
                                
                                return (
                                    <Button
                                        key={round.number}
                                        variant={isSelected ? "default" : "outline"}
                                        className={`transition-all duration-200 h-12 relative ${
                                            isSelected 
                                                ? 'bg-orange-500 hover:bg-orange-600 border-orange-500' 
                                                : isCurrentRound
                                                    ? 'bg-blue-50 hover:bg-blue-100 border-blue-300'
                                                    : hasStartTime
                                                        ? 'hover:bg-orange-50 hover:border-orange-300'
                                                        : 'opacity-50 cursor-not-allowed'
                                        }`}
                                        onClick={() => hasStartTime && setSelectedRound(round.number)}
                                        disabled={!hasStartTime}
                                    >
                                        <div className="text-center">
                                            <div className="text-sm font-medium">מחזור {round.number}</div>
                                            {isCurrentRound && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
                                            )}
                                        </div>
                                    </Button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Betting Status */}
                {currentRound && currentRound.startTime && (
                    <Card className={isBettingAllowed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {isBettingAllowed ? (
                                        <>
                                            <Clock className="h-5 w-5 text-green-600" />
                                            <div>
                                                <h3 className="font-semibold text-green-900">מחזור {currentRound.number} - הימורים פעילים</h3>
                                                <p className="text-sm text-green-800">
                                                    נותרו {timeRemaining} עד סגירת ההימורים
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <Clock className="h-5 w-5 text-red-600" />
                                            <div>
                                                <h3 className="font-semibold text-red-900">מחזור {currentRound.number} - תקופת ההימורים הסתיימה</h3>
                                                <p className="text-sm text-red-800">
                                                    לא ניתן לשנות או להוסיף הימורים יותר
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-600">שעת נעילה</p>
                                    <p className="text-sm font-medium">
                                        {formatDateTime(currentRound.startTime)}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Current Round Info - רק אם אין שעת נעילה */}
                {currentRound && !currentRound.startTime && (
                    <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-blue-900">מחזור {currentRound.number}</h3>
                                    <p className="text-sm text-blue-700">
                                        שעת נעילה לא נקבעה
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Existing Bets Warning - רק אם ההימורים פעילים והנתונים נטענו */}
                {hasExistingBets && isBettingAllowed && isRoundDataLoaded && (
                    <Card className="bg-yellow-50 border-yellow-200">
                        <CardContent className="p-4">
                            <h3 className="font-semibold text-yellow-900 mb-2">הימורים קיימים</h3>
                            <p className="text-sm text-yellow-800">
                                יש לך הימורים שמורים למחזור זה. שמירת הימור חדש תחליף את ההימור הקיים.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Matches */}
                {currentRound && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold text-gray-900">משחקי המחזור</h2>
                        {currentRound.matchesDetails?.map((match) => (
                            <Card key={match.uid} className="bg-white rounded-xl shadow-sm">
                                <CardContent className="p-6">
                                    <div className="space-y-4">
                                        {/* Match Info */}
                                        <div className="flex items-center justify-between gap-1 md:gap-3">
                                            <div className="text-center flex-1">
                                                <div className="flex items-center justify-center gap-2 mb-2">
                                                    <TeamLogo teamId={match.homeTeamId} size="md" />
                                                    <h3 className="font-semibold text-lg">{getTeamName(match.homeTeamId)}</h3>
                                                </div>
                                            </div>
                                            <div className="text-center mx-1 md:mx-2">
                                                <div className="text-sm text-gray-600">נגד</div>
                                            </div>
                                            <div className="text-center flex-1">
                                                <div className="flex items-center justify-center gap-2 mb-2">
                                                    <h3 className="font-semibold text-lg">{getTeamName(match.awayTeamId)}</h3>
                                                    <TeamLogo teamId={match.awayTeamId} size="md" />
                                                </div>
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
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="20"
                                                    data-match={`${match.uid}-home`}
                                                    className="w-16 h-12 text-center border rounded-lg"
                                                    placeholder="0"
                                                    defaultValue={getBetForMatch(match.uid)?.homeScore || ''}
                                                    disabled={!isBettingAllowed}
                                                />
                                            </div>
                                            <span className="text-lg font-semibold">-</span>
                                            <div className="text-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="20"
                                                    data-match={`${match.uid}-away`}
                                                    className="w-16 h-12 text-center border rounded-lg"
                                                    placeholder="0"
                                                    defaultValue={getBetForMatch(match.uid)?.awayScore || ''}
                                                    disabled={!isBettingAllowed}
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="flex justify-center mt-4">
                                            <Button
                                                onClick={() => {
                                                    const homeInput = document.querySelector(`input[data-match="${match.uid}-home"]`) as HTMLInputElement;
                                                    const awayInput = document.querySelector(`input[data-match="${match.uid}-away"]`) as HTMLInputElement;
                                                    const homeScore = parseInt(homeInput?.value || '0');
                                                    const awayScore = parseInt(awayInput?.value || '0');
                                                    handleBet(match.uid, homeScore, awayScore);
                                                }}
                                                className={`transition-all duration-200 px-6 py-2 rounded-lg font-bold text-white
                                                    ${betSaved[match.uid] ? 'bg-green-400 hover:bg-green-500' : 'bg-orange-400 hover:bg-orange-500'}
                                                    shadow-md focus:outline-none focus:ring-2 focus:ring-orange-300`}
                                                disabled={!isBettingAllowed}
                                            >
                                                {betSaved[match.uid] ? 'הימור נשמר!' : 'שמור הימור'}
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
                            <li>• כיוון נכון (ניצחון/תיקו): 1 נקודה</li>
                            <li>• תוצאה מדויקת: 3 נקודות</li>
                            <li>• בונוס כפול אם רק אתה צדקת במשחק</li>
                            <li>• משתתף שלא הימר לא יקבל נקודות</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 