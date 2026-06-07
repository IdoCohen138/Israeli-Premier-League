import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
    Trophy,
    Medal,
    Award,
    TrendingUp,
    Users,
    ChevronDown,
    ChevronUp,
    Target,
    Crosshair,
} from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import PageHeader from "@/components/layout/PageHeader";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { PlayerBets } from "@/types";
import { getLeaderboard } from "@/lib/playerBets";
import { getCurrentSeason, getCurrentSeasonData, getLastCalculatedRound, getSortedRounds } from "@/lib/season";
import { cn } from "@/lib/utils";

function sumMap(map?: Record<number, number>): number {
    if (!map) return 0;
    return Object.values(map).reduce((sum, count) => sum + count, 0);
}

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
    const [expandedUids, setExpandedUids] = useState<Set<string>>(new Set());
    const [showRoundBreakdown, setShowRoundBreakdown] = useState(false);

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
            const leaderboardData = await getLeaderboard();
            setLeaderboard(leaderboardData);

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

    const toggleExpanded = (uid: string) => {
        setExpandedUids((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });
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
                return <span className="w-5 text-center text-sm font-semibold text-muted-foreground">{rank}</span>;
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

    const lastRoundLabel = lastCalculatedRound
        ? roundNames[lastCalculatedRound] || `מחזור ${lastCalculatedRound}`
        : 'מחזור אחרון';

    const roundsNewestFirst = [...sortedRoundNumbers].reverse();

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
                        <p className="text-xs text-muted-foreground">לחץ על שחקן לפרטים נוספים</p>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="leaderboard-list">
                            {leaderboard.map((entry, index) => {
                                const rank = index + 1;
                                const isExpanded = expandedUids.has(entry.uid!);
                                const isCurrentUser = entry.uid === user?.uid;
                                const lastRoundPoints = lastCalculatedRound
                                    ? (entry.roundPoints?.[lastCalculatedRound] ?? 0)
                                    : 0;

                                return (
                                    <div
                                        key={entry.uid}
                                        className={cn("leaderboard-item", getRankColor(rank))}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleExpanded(entry.uid!)}
                                            className={cn(
                                                "leaderboard-item-main",
                                                isCurrentUser && "leaderboard-item-main--current"
                                            )}
                                            aria-expanded={isExpanded}
                                        >
                                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                                <span className="shrink-0">{getRankIcon(rank)}</span>
                                                <span className="truncate font-medium">
                                                    {entry.displayName || 'שחקן'}
                                                    {isCurrentUser && (
                                                        <span className="mr-1.5 text-[10px] font-normal text-primary">(אתה)</span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <span className="text-base font-bold tabular-nums text-primary sm:text-lg">
                                                    {entry.totalPoints || 0}
                                                </span>
                                                <ChevronDown
                                                    size={16}
                                                    className={cn(
                                                        "text-muted-foreground transition-transform duration-200",
                                                        isExpanded && "rotate-180"
                                                    )}
                                                />
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="leaderboard-item-details">
                                                <div className="leaderboard-stat">
                                                    <p className="leaderboard-stat-label">{lastRoundLabel}</p>
                                                    <p className="leaderboard-stat-value text-sky-500">{lastRoundPoints}</p>
                                                </div>
                                                <div className="leaderboard-stat">
                                                    <p className="leaderboard-stat-label flex items-center justify-center gap-1">
                                                        <Target size={11} />
                                                        נכונות
                                                    </p>
                                                    <p className="leaderboard-stat-value text-muted-foreground">
                                                        {sumMap(entry.correctPredictionsMap)}
                                                    </p>
                                                </div>
                                                <div className="leaderboard-stat">
                                                    <p className="leaderboard-stat-label flex items-center justify-center gap-1">
                                                        <Crosshair size={11} />
                                                        מדויקות
                                                    </p>
                                                    <p className="leaderboard-stat-value text-purple-500">
                                                        {sumMap(entry.exactPredictionsMap)}
                                                    </p>
                                                </div>
                                                {showPreSeasonColumn && (
                                                    <div className="leaderboard-stat">
                                                        <p className="leaderboard-stat-label">הימורים מקדימים</p>
                                                        <p className="leaderboard-stat-value text-emerald-500">
                                                            {entry.preSeasonPoints || 0}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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

                {leaderboard.length > 0 && sortedRoundNumbers.length > 0 && (
                    <Card className="overflow-hidden">
                        <CardContent className="space-y-0 p-3 sm:p-4">
                            <button
                                type="button"
                                onClick={() => setShowRoundBreakdown((v) => !v)}
                                className={cn(
                                    "round-breakdown-toggle",
                                    showRoundBreakdown && "rounded-b-none border-b-0"
                                )}
                                aria-expanded={showRoundBreakdown}
                            >
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 shrink-0 text-sky-400" />
                                    <div>
                                        <p className="text-sm font-semibold">נקודות לפי מחזור</p>
                                        <p className="text-xs text-muted-foreground">
                                            {leaderboard.length} שחקנים · {sortedRoundNumbers.length} מחזורים
                                        </p>
                                    </div>
                                </div>
                                {showRoundBreakdown ? (
                                    <ChevronUp size={18} className="shrink-0 text-muted-foreground" />
                                ) : (
                                    <ChevronDown size={18} className="shrink-0 text-muted-foreground" />
                                )}
                            </button>

                            {showRoundBreakdown && (
                                <div className="round-breakdown-panel">
                                    <p className="border-b border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground sm:text-xs">
                                        מחזורים אחרונים ליד השם · גלול לשאר המחזורים
                                    </p>
                                    <div className="round-breakdown-scroll">
                                        <table className="round-points-table">
                                            <thead>
                                                <tr>
                                                    <th className="sticky-player-col px-3 text-right">שחקן</th>
                                                    <th className="sticky-total-col">סה"כ</th>
                                                    {roundsNewestFirst.map((round) => {
                                                        const name = roundNames[round] || `מחזור ${round}`;
                                                        return (
                                                            <th
                                                                key={round}
                                                                className="round-col-header"
                                                                title={name}
                                                            >
                                                                <span className="round-col-header-text">{name}</span>
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leaderboard.map((entry, index) => (
                                                    <tr
                                                        key={entry.uid}
                                                        className={cn(
                                                            index % 2 === 0 ? 'bg-secondary/20' : '',
                                                            entry.uid === user?.uid && 'round-points-row--current'
                                                        )}
                                                    >
                                                        <td className="sticky-player-col px-3">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                                                    {index + 1}
                                                                </span>
                                                                <span className="truncate text-xs sm:text-sm">
                                                                    {entry.displayName || 'שחקן'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="sticky-total-col font-bold text-primary">
                                                            {entry.totalPoints || 0}
                                                        </td>
                                                        {roundsNewestFirst.map((round) => {
                                                            const name = roundNames[round] || `מחזור ${round}`;
                                                            const pts = entry.roundPoints?.[round] ?? 0;
                                                            return (
                                                                <td
                                                                    key={round}
                                                                    className={cn(
                                                                        "round-col",
                                                                        pts > 0 && "round-col-has-points"
                                                                    )}
                                                                    title={`${name}: ${pts} נקודות`}
                                                                >
                                                                    {pts > 0 ? pts : '·'}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
        </PageShell>
    );
}
