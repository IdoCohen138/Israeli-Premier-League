import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Trophy, Shield, TrendingDown, Target, Zap, Search } from "lucide-react";
import { PreSeasonBet, Team, Player } from "@/types";
import { collection, doc, getDocs, setDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath } from "@/lib/season";

export default function PreSeasonBetsPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [bets, setBets] = useState<PreSeasonBet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

    const betTypes = [
        { type: 'champion' as const, title: 'אלופה', icon: Trophy, color: 'text-yellow-500' },
        { type: 'cup' as const, title: 'גביע', icon: Trophy, color: 'text-blue-500' },
        { type: 'relegation1' as const, title: 'יורדת ראשונה', icon: TrendingDown, color: 'text-red-500' },
        { type: 'relegation2' as const, title: 'יורדת שנייה', icon: TrendingDown, color: 'text-red-500' },
        { type: 'topScorer' as const, title: 'מלך השערים', icon: Target, color: 'text-green-500' },
        { type: 'topAssists' as const, title: 'מלך הבישולים', icon: Zap, color: 'text-purple-500' },
    ];

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const seasonPath = getSeasonPath();
            const teamsSnapshot = await getDocs(collection(db, seasonPath, 'teams'));
            const teamsData = teamsSnapshot.docs.map(doc => {
                const data = { uid: doc.id, ...doc.data() } as Team;
                return data;
            });
            setTeams(teamsData);
            const playersSnapshot = await getDocs(collection(db, seasonPath, 'players'));
            const playersData = playersSnapshot.docs.map(doc => {
                const data = { uid: doc.id, ...doc.data() } as Player;
                return data;
            });
            setPlayers(playersData);

            // טעינת הימורים קיימים
            if (user) {
                const betsQuery = query(
                    collection(db, 'preSeasonBets'),
                    where('userId', '==', user.uid)
                );
                const betsSnapshot = await getDocs(betsQuery);
                const betsData = betsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as PreSeasonBet));
                setBets(betsData);
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

    const handleBet = async (type: PreSeasonBet['type'], teamId?: string, playerId?: string) => {
        if (!user) return;

        try {
            const betId = `${user.uid}_${type}`;
            const newBet: PreSeasonBet = {
                uid: betId,
                userId: user.uid,
                type,
                teamId,
                playerId,
            };

            await setDoc(doc(db, 'preSeasonBets', betId), newBet);
            
            // עדכון המצב המקומי
            setBets(prev => {
                const filtered = prev.filter(bet => bet.type !== type);
                return [...filtered, newBet];
            });
        } catch (error) {
            console.error('Error saving bet:', error);
            setError('שגיאה בשמירת ההימור. אנא נסה שוב.');
        }
    };

    const getBetValue = (type: PreSeasonBet['type']) => {
        const bet = bets.find(b => b.type === type);
        if (!bet) return null;

        switch (type) {
            case 'champion':
            case 'cup':
            case 'relegation1':
            case 'relegation2':
                return teams.find(t => t.uid === bet.teamId)?.name;
            case 'topScorer':
            case 'topAssists':
                return players.find(p => p.uid === bet.playerId)?.name;
            default:
                return null;
        }
    };

    // פונקציה לסינון נתונים לפי חיפוש
    const getFilteredData = (type: PreSeasonBet['type']) => {
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
    const updateSearch = (type: PreSeasonBet['type'], value: string) => {
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
                        <p className="text-sm text-gray-600">הימור על תוצאות העונה</p>
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
                            <li>• ההימורים המקדימים זמינים עד תחילת המחזור הראשון</li>
                            <li>• ניתן לשנות הימור עד לסגירת התקופה</li>
                            <li>• נקודות יוענקו בסוף העונה</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 