import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Medal, Award, TrendingUp, Users } from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import PageHeader from "@/components/layout/PageHeader";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { PlayerBets } from "@/types";
import { getLeaderboard } from "@/lib/playerBets";
import { getCurrentSeason, getCurrentSeasonData, getLastCalculatedRound, getSortedRounds } from "@/lib/season";

export default function LeaderboardPage() {
    const { user } = useAuth();
    const [leaderboard, setLeaderboard] = useState<PlayerBets[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userRank, setUserRank] = useState<number | null>(null);
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [showPreSeasonColumn, setShowPreSeasonColumn] = useState(false);
    const [roundNames, setRoundNames] = useState<Record<number, string>>({});
    const [sortedRoundNumbers, setSortedRoundNumbers] = useState<number[]>([]);
    const [lastCalculatedRound, setLastCalculatedRound] = useState<number | null>(null);

    useEffect(() => {
        setCurrentSeason(getCurrentSeason());
        loadLeaderboard();
        checkPreSeasonPointsCalculated();
        loadRoundNames();
        loadLastCalculatedRound();
    }, []);

    const loadLastCalculatedRound = async () => {
        const round = await getLastCalculatedRound();
        setLastCalculatedRound(round);
    };

    const loadRoundNames = async () => {
        try {
            const sortedRounds = await getSortedRounds();
            const names: Record<number, string> = {};
            const roundNumbers: number[] = [];

            sortedRounds.forEach((round) => {
                roundNumbers.push(round.number);
                names[round.number] = round.name || `מחזור ${round.number}`;
            });

            setRoundNames(names);
            setSortedRoundNumbers(roundNumbers);
        } catch (error) {
            console.error('Error loading round names:', error);
        }
    };

    const loadLeaderboard = async () => {
        try {
            // טעינת טבלת מיקומים מהמערכת החדשה
            const leaderboardData = await getLeaderboard();
            setLeaderboard(leaderboardData);

            // מציאת המיקום של המשתמש הנוכחי
            if (user) {
                const userEntry = leaderboardData.find(entry => entry.uid === user.uid);
                if (userEntry) {
                    const rank = leaderboardData.findIndex(entry => entry.uid === user.uid) + 1;
                    setUserRank(rank);
                }
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            setError('שגיאה בטעינת טבלת המיקומים. אנא נסה שוב.');
        } finally {
            setLoading(false);
        }
    };

    const checkPreSeasonPointsCalculated = async () => {
        const seasonData = await getCurrentSeasonData();
        if (
            seasonData &&
            seasonData.champion &&
            seasonData.cupWinner &&
            seasonData.topScorer &&
            seasonData.topAssists &&
            seasonData.relegation1 &&
            seasonData.relegation2
        ) {
            setShowPreSeasonColumn(true);
        } else {
            setShowPreSeasonColumn(false);
        }
    };

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1:
                return <Trophy className="h-5 w-5 text-yellow-500" />;
            case 2:
                return <Medal className="h-5 w-5 text-muted-foreground" />;
            case 3:
                return <Award className="h-5 w-5 text-amber-600" />;
            default:
                return <span className="text-sm font-medium text-muted-foreground">#{rank}</span>;
        }
    };

    const getRankColor = (rank: number) => {
        switch (rank) {
            case 1: return 'rank-gold';
            case 2: return 'rank-silver';
            case 3: return 'rank-bronze';
            default: return '';
        }
    };

    if (loading) return <LoadingScreen label="טוען טבלת מיקומים..." />;

    if (error) {
        return (
            <PageShell wide>
                <div className="status-banner status-closed text-sm">{error}</div>
                <Button onClick={() => window.location.reload()}>נסה שוב</Button>
            </PageShell>
        );
    }

    return (
        <PageShell wide>
                <PageHeader title="טבלת מיקומים" subtitle={`עונה ${currentSeason}`} />

                {userRank && (
                    <Card className="border-primary/25 bg-primary/5">
                        <CardContent className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-2.5">
                                {getRankIcon(userRank)}
                                <div>
                                    <h3 className="text-sm font-semibold">המיקום שלך</h3>
                                    <p className="text-xs text-muted-foreground">מקום {userRank} מתוך {leaderboard.length}</p>
                                </div>
                            </div>
                            <p className="text-lg font-bold text-primary">
                                {leaderboard.find(entry => entry.uid === user?.uid)?.totalPoints || 0}
                            </p>
                        </CardContent>
                    </Card>
                )}

                <div className="grid grid-cols-3 gap-2">
                    <Card><CardContent className="p-2.5 text-center">
                        <Users className="mx-auto mb-1 h-4 w-4 text-sky-400" />
                        <p className="text-[10px] text-muted-foreground">משתתפים</p>
                        <p className="text-sm font-bold">{leaderboard.length}</p>
                    </CardContent></Card>
                    <Card><CardContent className="p-2.5 text-center">
                        <TrendingUp className="mx-auto mb-1 h-4 w-4 text-emerald-400" />
                        <p className="text-[10px] text-muted-foreground">מוביל</p>
                        <p className="truncate text-xs font-bold">{leaderboard[0]?.displayName || '—'}</p>
                    </CardContent></Card>
                    <Card><CardContent className="p-2.5 text-center">
                        <Trophy className="mx-auto mb-1 h-4 w-4 text-amber-400" />
                        <p className="text-[10px] text-muted-foreground">מקסימום</p>
                        <p className="text-sm font-bold">{leaderboard[0]?.totalPoints || 0}</p>
                    </CardContent></Card>
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Trophy className="h-4 w-4 text-amber-400" />
                            דירוג שחקנים
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-0">
                        <div className="overflow-x-auto scrollbar-none">
                            <table className="table-compact w-full">
                                <thead>
                                    <tr className="border-b border-border/80 text-muted-foreground">
                                        <th className="text-right font-medium">#</th>
                                        <th className="text-right font-medium">שחקן</th>
                                        <th className="text-right font-medium">סה"כ</th>
                                        {showPreSeasonColumn && (
                                            <th className="text-right font-medium">מקדימים</th>
                                        )}
                                        <th className="text-right font-medium">
                                            {lastCalculatedRound
                                                ? roundNames[lastCalculatedRound] || `מחזור ${lastCalculatedRound}`
                                                : 'מחזור'}
                                        </th>
                                        <th className="text-right font-medium">נכונות</th>
                                        <th className="text-right font-medium">מדויקות</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((entry, index) => (
                                        <tr key={entry.uid} className={`border-b border-border/50 ${getRankColor(index + 1)}`}>
                                            <td className="py-2">{getRankIcon(index + 1)}</td>
                                            <td className="py-2 font-medium">{entry.displayName || 'שחקן'}</td>
                                            <td className="py-2 font-bold text-primary">{entry.totalPoints || 0}</td>
                                            {showPreSeasonColumn && (
                                                <td className="py-3 px-4">
                                                    <span className="text-green-600 font-medium">
                                                        {entry.preSeasonPoints || 0}
                                                    </span>
                                                    {entry.preSeasonPoints > 0 && (
                                                        <div className="text-xs text-green-500 mt-1">✓ הימורים מקדימים</div>
                                                    )}
                                                </td>
                                            )}
                                            <td className="py-3 px-4">
                                                <span className="font-medium text-sky-400">
                                                    {lastCalculatedRound
                                                        ? (entry.roundPoints?.[lastCalculatedRound] ?? 0)
                                                        : 0}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-muted-foreground">
                                                    {(() => {
                                                        if (!entry.correctPredictionsMap) return 0;
                                                        return Object.values(entry.correctPredictionsMap).reduce((sum, count) => sum + count, 0);
                                                    })()}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-purple-600 font-medium">
                                                    {(() => {
                                                        if (!entry.exactPredictionsMap) return 0;
                                                        return Object.values(entry.exactPredictionsMap).reduce((sum, count) => sum + count, 0);
                                                    })()}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-primary/15 bg-primary/5">
                    <CardContent className="p-3">
                        <h3 className="mb-1 text-sm font-semibold text-primary">איך מחושבות הנקודות?</h3>
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                            <li>הימורים מקדימים — בסוף העונה</li>
                            <li>מחזור: 1 נקודה כיוון, 3 מדויק</li>
                            <li>בונוס כפול על הימור ייחודי</li>
                        </ul>
                    </CardContent>
                </Card>

                {leaderboard.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <TrendingUp className="h-4 w-4 text-sky-400" />
                                נקודות לפי מחזור
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto scrollbar-none">
                                <table className="table-compact w-full">
                                    <thead>
                                    <tr className="border-b border-border/80">
                                        <th className="text-center font-medium">מחזור</th>
                                        {leaderboard.map(entry => (
                                            <th key={entry.uid} className="min-w-[3rem] text-center font-medium">
                                                <div className="truncate text-[10px]" title={entry.displayName || ''}>
                                                    {entry.displayName?.split(' ')[0] || '—'}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                    <tbody>
                                        {sortedRoundNumbers.map((round, index) => (
                                                <tr key={round} className={index % 2 === 0 ? 'bg-secondary/30' : ''}>
                                                    <td className="whitespace-nowrap text-center text-xs font-semibold">{roundNames[round] || round}</td>
                                                    {leaderboard.map(entry => (
                                                        <td key={entry.uid} className="text-center font-medium text-primary">
                                                            {entry.roundPoints?.[round] ?? 0}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
        </PageShell>
    );
} 