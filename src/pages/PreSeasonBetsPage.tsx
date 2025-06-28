import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Trophy, Shield, TrendingDown, Target, Zap, Search, Clock, AlertCircle } from "lucide-react";
import { Team, Player } from "@/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath, getCurrentSeason, getCurrentSeasonData } from "@/lib/season";
import { 
    savePreSeasonBets, 
    getPlayerPreSeasonBets, 
    hasPlayerPreSeasonBets 
} from "@/lib/playerBets";

export default function PreSeasonBetsPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [currentBets, setCurrentBets] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
    const [hasExistingBets, setHasExistingBets] = useState(false);
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [seasonStartDate, setSeasonStartDate] = useState<string>('');
    const [isBettingAllowed, setIsBettingAllowed] = useState(true);
    const [timeRemaining, setTimeRemaining] = useState<string>('');

    const betTypes = [
        { type: 'champion' as const, title: 'אלופה', icon: Trophy, color: 'text-yellow-500' },
        { type: 'cup' as const, title: 'גביע', icon: Trophy, color: 'text-blue-500' },
        { type: 'relegation1' as const, title: 'יורדת ראשונה', icon: TrendingDown, color: 'text-red-500' },
        { type: 'relegation2' as const, title: 'יורדת שנייה', icon: TrendingDown, color: 'text-red-500' },
        { type: 'topScorer' as const, title: 'מלך השערים', icon: Target, color: 'text-green-500' },
        { type: 'topAssists' as const, title: 'מלך הבישולים', icon: Zap, color: 'text-purple-500' },
    ];

    useEffect(() => {
        setCurrentSeason(getCurrentSeason());
        loadData();
    }, [user]);

    // Timer effect to update countdown
    useEffect(() => {
        if (!seasonStartDate || !isBettingAllowed) return;

        const updateTimer = () => {
            const now = new Date();
            const startDate = new Date(seasonStartDate);
            const timeDiff = startDate.getTime() - now.getTime();
            
            if (timeDiff <= 0) {
                setIsBettingAllowed(false);
                setTimeRemaining('');
                return;
            }
            
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
        };

        // Update immediately
        updateTimer();
        
        // Update every minute
        const interval = setInterval(updateTimer, 60000);
        
        return () => clearInterval(interval);
    }, [seasonStartDate, isBettingAllowed]);

    const loadData = async () => {
        if (!user) return;
        
        try {
            const seasonPath = getSeasonPath();
            
            // טעינת נתוני העונה
            const seasonData = await getCurrentSeasonData();
            
            if (seasonData?.seasonStart) {
                // המרת Firestore Timestamp ל-Date
                let startDate: Date;
                if (seasonData.seasonStart.toDate) {
                    // זה Firestore Timestamp
                    startDate = seasonData.seasonStart.toDate();
                    setSeasonStartDate(startDate.toISOString());
                } else if (typeof seasonData.seasonStart === 'string') {
                    // זה string רגיל
                    startDate = new Date(seasonData.seasonStart);
                    setSeasonStartDate(seasonData.seasonStart);
                } else {
                    // זה כבר Date object
                    startDate = seasonData.seasonStart;
                    setSeasonStartDate(startDate.toISOString());
                }
                
                // בדיקה שהתאריך תקין
                if (isNaN(startDate.getTime())) {
                    console.error('Invalid seasonStart date:', seasonData.seasonStart);
                    setError('תאריך תחילת העונה לא תקין. אנא פנה למנהל המערכת.');
                    return;
                }
                
                const isExpired = new Date() > startDate;
                setIsBettingAllowed(!isExpired);
                
                if (!isExpired) {
                    // חישוב הזמן הנותר
                    const now = new Date();
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
                }
            }
            
            // טעינת קבוצות
            const teamsSnapshot = await getDocs(collection(db, seasonPath, 'teams'));
            const teamsData = teamsSnapshot.docs.map(doc => {
                const data = { uid: doc.id, ...doc.data() } as Team;
                return data;
            });
            setTeams(teamsData);
            
            // טעינת שחקנים
            const playersSnapshot = await getDocs(collection(db, seasonPath, 'players'));
            const playersData = playersSnapshot.docs.map(doc => {
                const data = { uid: doc.id, ...doc.data() } as Player;
                return data;
            });
            setPlayers(playersData);

            // טעינת הימורים קיימים
            const existingBets = await getPlayerPreSeasonBets(user.uid);
            if (existingBets) {
                setCurrentBets(existingBets);
                setHasExistingBets(true);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            setError('שגיאה בטעינת הנתונים. אנא נסה שוב.');
        } finally {
            setLoading(false);
        }
    };

    const handleBet = async (type: string, teamId?: string, playerId?: string) => {
        if (!user) return;
        
        if (!isBettingAllowed) {
            setError('תקופת ההימורים המקדימים הסתיימה. לא ניתן לשנות הימורים יותר.');
            return;
        }

        try {
            const newBets = {
                ...currentBets,
                [type]: teamId || playerId || ''
            };

            await savePreSeasonBets(user.uid, newBets, user.displayName || user.email);
            setCurrentBets(newBets);
            setHasExistingBets(true);
        } catch (error) {
            console.error('Error saving bet:', error);
            setError('שגיאה בשמירת ההימור. אנא נסה שוב.');
        }
    };

    const getBetValue = (type: string) => {
        const betId = currentBets[type];
        if (!betId) return null;

        switch (type) {
            case 'champion':
            case 'cup':
            case 'relegation1':
            case 'relegation2':
                return teams.find(t => t.uid === betId)?.name;
            case 'topScorer':
            case 'topAssists':
                return players.find(p => p.uid === betId)?.name;
            default:
                return null;
        }
    };

    // פונקציה לסינון נתונים לפי חיפוש
    const getFilteredData = (type: string) => {
        const searchTerm = searchTerms[type] || "";
        
        if (!searchTerm) {
            return type === 'topScorer' || type === 'topAssists' ? players : teams;
        }
        
        if (type === 'topScorer' || type === 'topAssists') {
            return players.filter(player => 
                player.name.includes(searchTerm) || 
                player.team.includes(searchTerm)
            );
        } else {
            return teams.filter(team => 
                team.name.includes(searchTerm)
            );
        }
    };

    // פונקציה לעדכון חיפוש
    const updateSearch = (type: string, value: string) => {
        setSearchTerms(prev => ({
            ...prev,
            [type]: value
        }));
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
                        <h1 className="text-2xl font-bold text-gray-900">הימורים מקדימים</h1>
                        <p className="text-sm text-gray-600">הימור על תוצאות העונה {currentSeason}</p>
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

                {/* Betting Status */}
                {seasonStartDate && (
                    <Card className={isBettingAllowed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                                {isBettingAllowed ? (
                                    <>
                                        <Clock className="h-5 w-5 text-green-600" />
                                        <div>
                                            <h3 className="font-semibold text-green-900">הימורים מקדימים פעילים</h3>
                                            <p className="text-sm text-green-800">
                                                נותרו {timeRemaining} עד סגירת ההימורים המקדימים
                                            </p>
                                            <p className="text-xs text-green-700 mt-1">
                                                תאריך סגירה: {new Date(seasonStartDate).toLocaleDateString('he-IL')} {new Date(seasonStartDate).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="h-5 w-5 text-red-600" />
                                        <div>
                                            <h3 className="font-semibold text-red-900">תקופת ההימורים המקדימים הסתיימה</h3>
                                            <p className="text-sm text-red-800">
                                                לא ניתן לשנות או להוסיף הימורים מקדימים יותר
                                            </p>
                                            <p className="text-xs text-red-700 mt-1">
                                                תאריך סגירה: {new Date(seasonStartDate).toLocaleDateString('he-IL')} {new Date(seasonStartDate).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Existing Bets Warning */}
                {hasExistingBets && (
                    <Card className="bg-yellow-50 border-yellow-200">
                        <CardContent className="p-4">
                            <h3 className="font-semibold text-yellow-900 mb-2">הימורים קיימים</h3>
                            <p className="text-sm text-yellow-800">
                                יש לך הימורים מקדימים שמורים. בחירת הימור חדש תחליף את ההימור הקיים.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Bet Types Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {betTypes.map(({ type, title, icon: Icon, color }) => (
                        <Card key={type} className="bg-white rounded-xl shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Icon className={`h-5 w-5 ${color}`} />
                                    {title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Current Bet Display */}
                                {getBetValue(type) && (
                                    <div className="p-3 bg-green-50 rounded-lg">
                                        <p className="text-sm text-green-700 font-medium">
                                            ההימור שלך: {getBetValue(type)}
                                        </p>
                                    </div>
                                )}

                                {/* Bet Options */}
                                <div className="space-y-2">
                                    {/* Search Input */}
                                    <div className="relative">
                                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="חיפוש..."
                                            value={searchTerms[type] || ""}
                                            onChange={(e) => updateSearch(type, e.target.value)}
                                            className="w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg text-sm"
                                            disabled={!isBettingAllowed}
                                        />
                                    </div>
                                    
                                    {/* Results count */}
                                    <div className="text-xs text-gray-500 text-center">
                                        נמצאו {getFilteredData(type).length} {type === 'topScorer' || type === 'topAssists' ? 'שחקנים' : 'קבוצות'}
                                    </div>
                                    
                                    {type === 'topScorer' || type === 'topAssists' ? (
                                        // Player selection with scroll
                                        <div className="max-h-48 overflow-y-auto border rounded-lg p-2">
                                            <div className="grid grid-cols-1 gap-1">
                                                {getFilteredData(type).map((item) => {
                                                    const player = item as Player;
                                                    return (
                                                        <Button
                                                            key={player.uid}
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleBet(type, undefined, player.uid)}
                                                            className="text-xs justify-start h-auto py-2 px-3"
                                                            disabled={!isBettingAllowed}
                                                        >
                                                            <div className="text-right w-full">
                                                                <div className="font-medium">{player.name}</div>
                                                                <div className="text-xs text-gray-500">{player.team}</div>
                                                            </div>
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        // Team selection with scroll
                                        <div className="max-h-48 overflow-y-auto border rounded-lg p-2">
                                            <div className="grid grid-cols-1 gap-1">
                                                {getFilteredData(type).map((item) => {
                                                    const team = item as Team;
                                                    return (
                                                        <Button
                                                            key={team.uid}
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleBet(type, team.uid)}
                                                            className="text-xs justify-start h-auto py-2 px-3"
                                                            disabled={!isBettingAllowed}
                                                        >
                                                            <div className="text-right w-full">
                                                                <div className="font-medium">{team.name}</div>
                                                            </div>
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Info Card */}
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-blue-900 mb-2">מידע חשוב</h3>
                        <ul className="text-sm text-blue-800 space-y-1">
                            <li>• ההימורים המקדימים זמינים עד התאריך שנקבע בעונה</li>
                            <li>• ניתן לשנות הימור עד לסגירת התקופה</li>
                            <li>• לאחר סגירת התקופה לא ניתן לשנות או להוסיף הימורים</li>
                            <li>• נקודות יוענקו בסוף העונה</li>
                            {seasonStartDate && (
                                <li>• תאריך סגירה: {new Date(seasonStartDate).toLocaleDateString('he-IL')} {new Date(seasonStartDate).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}</li>
                            )}
                        </ul>
                        
                        <div className="mt-4 pt-4 border-t border-blue-200">
                            <h4 className="font-semibold text-blue-900 mb-2">חלוקת נקודות להימורים מקדימים:</h4>
                            <ul className="text-sm text-blue-800 space-y-1">
                                <li>• זהות אלופה: 10 נקודות</li>
                                <li>• זהות יורדת ראשונה: 5 נקודות</li>
                                <li>• זהות יורדת שנייה: 5 נקודות</li>
                                <li>• מלך שערים: 7 נקודות</li>
                                <li>• מלך בישולים: 5 נקודות</li>
                                <li>• משתתף שלא הימר לא יקבל נקודות</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 