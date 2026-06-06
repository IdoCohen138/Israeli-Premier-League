import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, TrendingDown, Target, Zap, Search, Clock, AlertCircle } from "lucide-react";
import { Team, Player } from "@/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath, getCurrentSeason, getCurrentSeasonData } from "@/lib/season";
import { 
    savePreSeasonBets, 
    getPlayerPreSeasonBets
} from "@/lib/playerBets";
import {
    ensureServerTimeSynced,
    isDeadlinePassed,
    getRemainingTimeLabel,
    BETTING_CLOSED_ERROR,
} from "@/lib/serverTime";
import { formatIsraelDateTime } from "@/lib/israelTime";
import TeamLogo from "@/components/TeamLogo";
import PageShell from "@/components/layout/PageShell";
import PageHeader from "@/components/layout/PageHeader";
import StatusBanner from "@/components/layout/StatusBanner";
import LoadingScreen from "@/components/layout/LoadingScreen";

export default function PreSeasonBetsPage() {
    const { user } = useAuth();
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
            if (!seasonStartDate) return;

            if (isDeadlinePassed(seasonStartDate)) {
                setIsBettingAllowed(false);
                setTimeRemaining('');
                return;
            }

            setIsBettingAllowed(true);
            setTimeRemaining(getRemainingTimeLabel(seasonStartDate));
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
            await ensureServerTimeSynced(user.uid);

            const seasonPath = getSeasonPath();
            
            // טעינת נתוני העונה
            const seasonData = await getCurrentSeasonData();
            
            if (seasonData?.seasonStart) {
                let startDateValue: string;

                if (seasonData.seasonStart.toDate) {
                    startDateValue = seasonData.seasonStart.toDate().toISOString();
                } else if (typeof seasonData.seasonStart === 'string') {
                    startDateValue = seasonData.seasonStart;
                } else {
                    startDateValue = new Date(seasonData.seasonStart).toISOString();
                }

                setSeasonStartDate(startDateValue);

                if (isDeadlinePassed(startDateValue)) {
                    setIsBettingAllowed(false);
                    setTimeRemaining('');
                } else {
                    setIsBettingAllowed(true);
                    setTimeRemaining(getRemainingTimeLabel(startDateValue));
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
            if (error instanceof Error && error.message === BETTING_CLOSED_ERROR) {
                setError('תקופת ההימורים המקדימים הסתיימה. לא ניתן לשנות הימורים יותר.');
                setIsBettingAllowed(false);
                return;
            }
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
        let filteredTeams = teams;
        if (type === 'cup') {
            // Show all teams including 'אחר'
            filteredTeams = teams;
        } else if (['champion', 'relegation1', 'relegation2'].includes(type)) {
            // Exclude 'אחר' from other team bets
            filteredTeams = teams.filter(team => team.uid !== 'Q7TYlRWO48TYKm7IPZnj');
        }
        if (!searchTerm) {
            return type === 'topScorer' || type === 'topAssists' ? players : filteredTeams;
        }
        if (type === 'topScorer' || type === 'topAssists') {
            return players.filter(player => 
                player.name.includes(searchTerm) || 
                player.team.includes(searchTerm)
            );
        } else {
            return filteredTeams.filter(team => 
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

    if (loading) return <LoadingScreen label="טוען הימורים מקדימים..." />;

    if (error) {
        return (
            <PageShell>
                <div className="status-banner status-closed text-sm">{error}</div>
                <Button onClick={() => window.location.reload()}>נסה שוב</Button>
            </PageShell>
        );
    }

    return (
        <PageShell>
                <PageHeader title="הימורים מקדימים" subtitle={`עונה ${currentSeason}`} />

                {seasonStartDate && (
                    <StatusBanner
                        variant={isBettingAllowed ? 'open' : 'closed'}
                        icon={isBettingAllowed ? Clock : AlertCircle}
                        title={isBettingAllowed ? 'הימורים מקדימים פעילים' : 'תקופת ההימורים הסתיימה'}
                        description={isBettingAllowed
                            ? `נותרו ${timeRemaining} · סגירה: ${formatIsraelDateTime(seasonStartDate)}`
                            : `סגירה: ${formatIsraelDateTime(seasonStartDate)}`}
                    />
                )}

                {hasExistingBets && isBettingAllowed && (
                    <StatusBanner variant="warning" icon={AlertCircle}
                        title="הימורים קיימים"
                        description="בחירה חדשה תחליף את ההימור הקיים" />
                )}

                {/* Bet Types Grid */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {betTypes.map(({ type, title, icon: Icon, color }) => (
                        <Card key={type}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Icon className={`h-5 w-5 ${color}`} />
                                    {title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Current Bet Display */}
                                {getBetValue(type) && (
                                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
                                        <p className="text-sm font-medium text-emerald-400">
                                            ההימור שלך: {getBetValue(type)}
                                        </p>
                                    </div>
                                )}

                                {/* Bet Options */}
                                <div className="space-y-2">
                                    {/* Search Input */}
                                    <div className="relative">
                                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="חיפוש..."
                                            value={searchTerms[type] || ""}
                                            onChange={(e) => updateSearch(type, e.target.value)}
                                            className="app-select pr-10"
                                            disabled={!isBettingAllowed}
                                        />
                                    </div>
                                    
                                    {/* Results count */}
                                    <div className="text-center text-xs text-muted-foreground">
                                        נמצאו {getFilteredData(type).length} {type === 'topScorer' || type === 'topAssists' ? 'שחקנים' : 'קבוצות'}
                                    </div>
                                    
                                    {type === 'topScorer' || type === 'topAssists' ? (
                                        // Player selection with scroll
                                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
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
                                                            <div className="flex items-center gap-2 w-full">
                                                                <TeamLogo teamId={player.teamId} size="sm" />
                                                                <div className="text-right flex-1">
                                                                <div className="font-medium">{player.name}</div>
                                                                <div className="text-xs text-muted-foreground">{player.team}</div>
                                                                </div>
                                                            </div>
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        // Team selection with scroll
                                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
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
                                                            <div className="flex items-center gap-2 w-full">
                                                                <TeamLogo teamId={team.uid} size="sm" />
                                                                <div className="text-right flex-1">
                                                                <div className="font-medium">{team.name}</div>
                                                                </div>
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

                <Card className="border-sky-500/20 bg-sky-500/5">
                    <CardContent className="p-3">
                        <h3 className="mb-1 text-sm font-semibold text-sky-300">מידע חשוב</h3>
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                            <li>לאחר סגירה לא ניתן לשנות הימורים</li>
                            <li>נקודות יוענקו בסוף העונה</li>
                        </ul>
                        <div className="mt-2 border-t border-border/50 pt-2">
                            <p className="mb-1 text-xs font-semibold text-foreground">ניקוד: אלופה 10 · גביע 8 · יורדת 5 · שערים 7 · בישולים 5</p>
                        </div>
                    </CardContent>
                </Card>
        </PageShell>
    );
} 