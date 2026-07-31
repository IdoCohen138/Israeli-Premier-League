import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
    Trophy,
    TrendingDown,
    Target,
    Zap,
    Search,
    Clock,
    AlertCircle,
    Check,
    X,
    Users,
} from "lucide-react";
import { Team, Player } from "@/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath, getCurrentSeason, getCurrentSeasonData } from "@/lib/season";
import { savePreSeasonBets, getPlayerPreSeasonBets } from "@/lib/playerBets";
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
import { cn } from "@/lib/utils";

const OTHER_TEAM_ID = "Q7TYlRWO48TYKm7IPZnj";

type SingleTeamBetKey = "champion" | "cup";
type PlayerBetKey = "topScorer" | "topAssists";

function sortByName<T extends { name: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

const TOTAL_PRESEASON_PICKS = 6;

type PreSeasonBets = Record<string, string>;

interface ProgressCheck {
    id: string;
    label: string;
    done: boolean;
}

interface PreSeasonProgress {
    filledPicks: number;
    totalPicks: number;
    progressPercent: number;
    isComplete: boolean;
    checks: ProgressCheck[];
    relegationPicks: string[];
}

function getRelegationPicks(bets: PreSeasonBets): string[] {
    const picks = [bets.relegation1, bets.relegation2].filter(Boolean);
    return [...new Set(picks)];
}

function countFilledPicks(bets: PreSeasonBets): number {
    let count = 0;
    if (bets.champion) count++;
    if (bets.cup) count++;
    count += getRelegationPicks(bets).length;
    if (bets.topScorer) count++;
    if (bets.topAssists) count++;
    return count;
}

function computePreSeasonProgress(bets: PreSeasonBets): PreSeasonProgress {
    const relegationPicks = getRelegationPicks(bets);
    const filledPicks = countFilledPicks(bets);
    const checks: ProgressCheck[] = [
        { id: "champion", label: "אלופה", done: !!bets.champion },
        { id: "cup", label: "גביע", done: !!bets.cup },
        {
            id: "relegation",
            label: `יורדות (${relegationPicks.length}/2)`,
            done: relegationPicks.length === 2,
        },
        { id: "topScorer", label: "מלך שערים", done: !!bets.topScorer },
        { id: "topAssists", label: "מלך בישולים", done: !!bets.topAssists },
    ];
    const isComplete = filledPicks === TOTAL_PRESEASON_PICKS && checks.every((item) => item.done);

    return {
        filledPicks,
        totalPicks: TOTAL_PRESEASON_PICKS,
        progressPercent: Math.min(100, (filledPicks / TOTAL_PRESEASON_PICKS) * 100),
        isComplete,
        checks,
        relegationPicks,
    };
}

interface PickSummaryItem {
    key: string;
    label: string;
    sublabel: string;
    teamId?: string;
}

function buildPickSummary(
    bets: PreSeasonBets,
    relegationPicks: string[],
    getTeamName: (teamId: string) => string | undefined,
    getPlayer: (playerId: string) => Player | undefined
): PickSummaryItem[] {
    const items: PickSummaryItem[] = [];

    if (bets.champion) {
        items.push({
            key: "champion",
            label: getTeamName(bets.champion) ?? "קבוצה לא ידועה",
            sublabel: "אלופה",
            teamId: bets.champion,
        });
    }
    if (bets.cup) {
        items.push({
            key: "cup",
            label: getTeamName(bets.cup) ?? "קבוצה לא ידועה",
            sublabel: "גביע",
            teamId: bets.cup,
        });
    }
    relegationPicks.forEach((teamId) => {
        items.push({
            key: `relegation-${teamId}`,
            label: getTeamName(teamId) ?? "קבוצה לא ידועה",
            sublabel: "יורדת ליגה",
            teamId,
        });
    });
    if (bets.topScorer) {
        const player = getPlayer(bets.topScorer);
        items.push({
            key: "topScorer",
            label: player?.name ?? "שחקן לא ידוע",
            sublabel: "מלך שערים",
            teamId: player?.teamId,
        });
    }
    if (bets.topAssists) {
        const player = getPlayer(bets.topAssists);
        items.push({
            key: "topAssists",
            label: player?.name ?? "שחקן לא ידוע",
            sublabel: "מלך בישולים",
            teamId: player?.teamId,
        });
    }

    return items;
}

function setRelegationPicks(
    bets: PreSeasonBets,
    picks: string[]
): PreSeasonBets {
    return {
        ...bets,
        relegation1: picks[0] ?? "",
        relegation2: picks[1] ?? "",
    };
}

interface TeamPickerProps {
    teams: Team[];
    selectedId?: string;
    selectedIds?: string[];
    maxSelections?: number;
    onSelect?: (teamId: string) => void;
    onToggle?: (teamId: string) => void;
    disabled?: boolean;
}

function TeamPicker({
    teams,
    selectedId,
    selectedIds = [],
    maxSelections = 1,
    onSelect,
    onToggle,
    disabled,
}: TeamPickerProps) {
    const isMulti = maxSelections > 1;
    const atMax = isMulti && selectedIds.length >= maxSelections;

    return (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {teams.map((team) => {
                const isSelected = isMulti
                    ? selectedIds.includes(team.uid)
                    : selectedId === team.uid;
                const isDisabled = disabled || (atMax && !isSelected);

                return (
                    <button
                        key={team.uid}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                            if (isMulti) {
                                onToggle?.(team.uid);
                            } else {
                                onSelect?.(team.uid);
                            }
                        }}
                        className={cn(
                            "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-center transition",
                            isSelected
                                ? "border-emerald-500/50 bg-emerald-500/15 ring-1 ring-emerald-500/40"
                                : "border-border/70 bg-secondary/50 hover:border-primary/30 hover:bg-secondary/80",
                            isDisabled && !isSelected && "cursor-not-allowed opacity-40"
                        )}
                    >
                        <TeamLogo teamId={team.uid} size="xs" />
                        <span className="line-clamp-2 text-[10px] font-medium leading-tight">
                            {team.name}
                        </span>
                        {isSelected && (
                            <Check className="h-3 w-3 text-emerald-400" aria-hidden />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

interface PlayerPickerProps {
    players: Player[];
    selectedId?: string;
    onSelect: (playerId: string) => void;
    disabled?: boolean;
}

function PlayerPicker({ players, selectedId, onSelect, disabled }: PlayerPickerProps) {
    return (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-1.5">
            {players.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">לא נמצאו שחקנים</p>
            ) : (
                players.map((player) => {
                    const isSelected = selectedId === player.uid;
                    return (
                        <button
                            key={player.uid}
                            type="button"
                            disabled={disabled}
                            onClick={() => onSelect(player.uid)}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-right transition",
                                isSelected
                                    ? "border-emerald-500/50 bg-emerald-500/15 ring-1 ring-emerald-500/30"
                                    : "border-transparent bg-secondary/40 hover:bg-secondary/70"
                            )}
                        >
                            <TeamLogo teamId={player.teamId} size="sm" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{player.name}</div>
                                <div className="truncate text-xs text-muted-foreground">{player.team}</div>
                            </div>
                            {isSelected && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                        </button>
                    );
                })
            )}
        </div>
    );
}

interface SelectionChipProps {
    label: string;
    sublabel?: string;
    teamId?: string;
    onClear?: () => void;
    disabled?: boolean;
}

function SelectionChip({ label, sublabel, teamId, onClear, disabled }: SelectionChipProps) {
    return (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            {teamId && <TeamLogo teamId={teamId} size="sm" />}
            <div className="min-w-0 flex-1 text-right">
                <div className="truncate text-sm font-medium text-emerald-700 dark:text-emerald-300">{label}</div>
                {sublabel && (
                    <div className="truncate text-xs text-muted-foreground">{sublabel}</div>
                )}
            </div>
            {onClear && !disabled && (
                <button
                    type="button"
                    onClick={onClear}
                    className="rounded-lg p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                    aria-label="נקה בחירה"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

export default function PreSeasonBetsPage() {
    const { user } = useAuth();
    const [teams, setTeams] = useState<Team[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [currentBets, setCurrentBets] = useState<PreSeasonBets>({});
    const currentBetsRef = useRef(currentBets);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [teamSearch, setTeamSearch] = useState("");
    const [scorerSearch, setScorerSearch] = useState("");
    const [assistsSearch, setAssistsSearch] = useState("");
    const [currentSeason, setCurrentSeason] = useState("");
    const [seasonStartDate, setSeasonStartDate] = useState("");
    const [isBettingAllowed, setIsBettingAllowed] = useState(true);
    const [timeRemaining, setTimeRemaining] = useState("");
    const [savingKey, setSavingKey] = useState<string | null>(null);

    useEffect(() => {
        setCurrentSeason(getCurrentSeason());
        loadData();
    }, [user]);

    useEffect(() => {
        currentBetsRef.current = currentBets;
    }, [currentBets]);

    useEffect(() => {
        if (!seasonStartDate || !isBettingAllowed) return;

        const updateTimer = () => {
            if (!seasonStartDate) return;

            if (isDeadlinePassed(seasonStartDate)) {
                setIsBettingAllowed(false);
                setTimeRemaining("");
                return;
            }

            setIsBettingAllowed(true);
            setTimeRemaining(getRemainingTimeLabel(seasonStartDate));
        };

        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [seasonStartDate, isBettingAllowed]);

    const sortedTeams = useMemo(() => sortByName(teams), [teams]);
    const sortedPlayers = useMemo(() => sortByName(players), [players]);

    const leagueTeams = useMemo(
        () => sortedTeams.filter((team) => team.uid !== OTHER_TEAM_ID),
        [sortedTeams]
    );

    const filteredLeagueTeams = useMemo(() => {
        if (!teamSearch.trim()) return leagueTeams;
        const term = teamSearch.trim();
        return leagueTeams.filter((team) => team.name.includes(term));
    }, [leagueTeams, teamSearch]);

    const filteredCupTeams = useMemo(() => {
        if (!teamSearch.trim()) return sortedTeams;
        const term = teamSearch.trim();
        return sortedTeams.filter((team) => team.name.includes(term));
    }, [sortedTeams, teamSearch]);

    const filterPlayersBySearch = (search: string) => {
        if (!search.trim()) return sortedPlayers;
        const term = search.trim();
        return sortedPlayers.filter(
            (player) => player.name.includes(term) || player.team.includes(term)
        );
    };

    const filteredScorerPlayers = useMemo(
        () => filterPlayersBySearch(scorerSearch),
        [sortedPlayers, scorerSearch]
    );

    const filteredAssistsPlayers = useMemo(
        () => filterPlayersBySearch(assistsSearch),
        [sortedPlayers, assistsSearch]
    );

    const progress = useMemo(() => computePreSeasonProgress(currentBets), [currentBets]);
    const { filledPicks, isComplete: isProgressComplete, checks: progressChecks, relegationPicks } =
        progress;

    const getTeamName = (teamId: string) => teams.find((team) => team.uid === teamId)?.name;
    const getPlayer = (playerId: string) => players.find((player) => player.uid === playerId);

    const pickSummary = useMemo(
        () => buildPickSummary(currentBets, relegationPicks, getTeamName, getPlayer),
        [currentBets, relegationPicks, teams, players]
    );

    const loadData = async () => {
        if (!user) return;

        try {
            await ensureServerTimeSynced(user.uid);

            const seasonPath = getSeasonPath();
            const seasonData = await getCurrentSeasonData();

            if (seasonData?.seasonStart) {
                let startDateValue: string;

                if (seasonData.seasonStart.toDate) {
                    startDateValue = seasonData.seasonStart.toDate().toISOString();
                } else if (typeof seasonData.seasonStart === "string") {
                    startDateValue = seasonData.seasonStart;
                } else {
                    startDateValue = new Date(seasonData.seasonStart).toISOString();
                }

                setSeasonStartDate(startDateValue);

                if (isDeadlinePassed(startDateValue)) {
                    setIsBettingAllowed(false);
                    setTimeRemaining("");
                } else {
                    setIsBettingAllowed(true);
                    setTimeRemaining(getRemainingTimeLabel(startDateValue));
                }
            }

            const teamsSnapshot = await getDocs(collection(db, seasonPath, "teams"));
            setTeams(
                teamsSnapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as Team)
            );

            const playersSnapshot = await getDocs(collection(db, seasonPath, "players"));
            setPlayers(
                playersSnapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as Player)
            );

            const existingBets = await getPlayerPreSeasonBets(user.uid);
            if (existingBets) {
                setCurrentBets(existingBets as Record<string, string>);
            }
        } catch (loadError) {
            console.error("Error loading data:", loadError);
            setError("שגיאה בטעינת הנתונים. אנא נסה שוב.");
        } finally {
            setLoading(false);
        }
    };

    const persistBets = async (newBets: PreSeasonBets, savingId: string) => {
        if (!user) return;

        if (!isBettingAllowed) {
            setError("תקופת ההימורים המקדימים הסתיימה. לא ניתן לשנות הימורים יותר.");
            return;
        }

        setSavingKey(savingId);
        try {
            await savePreSeasonBets(user.uid, newBets, user.displayName || user.email);
            setCurrentBets(newBets);
            setError(null);
        } catch (saveError) {
            if (saveError instanceof Error && saveError.message === BETTING_CLOSED_ERROR) {
                setError("תקופת ההימורים המקדימים הסתיימה. לא ניתן לשנות הימורים יותר.");
                setIsBettingAllowed(false);
                return;
            }
            console.error("Error saving bet:", saveError);
            setError("שגיאה בשמירת ההימור. אנא נסה שוב.");
        } finally {
            setSavingKey(null);
        }
    };

    const handleTeamBet = async (key: SingleTeamBetKey, teamId: string) => {
        const prev = currentBetsRef.current;
        const nextValue = prev[key] === teamId ? "" : teamId;
        await persistBets({ ...prev, [key]: nextValue }, key);
    };

    const handleRelegationToggle = async (teamId: string) => {
        const prev = currentBetsRef.current;
        const picks = getRelegationPicks(prev);

        let nextPicks: string[];
        if (picks.includes(teamId)) {
            nextPicks = picks.filter((id) => id !== teamId);
        } else if (picks.length < 2) {
            nextPicks = [...picks, teamId];
        } else {
            return;
        }

        await persistBets(setRelegationPicks(prev, nextPicks), "relegation");
    };

    const handlePlayerBet = async (key: PlayerBetKey, playerId: string) => {
        const prev = currentBetsRef.current;
        const nextValue = prev[key] === playerId ? "" : playerId;
        await persistBets({ ...prev, [key]: nextValue }, key);
    };

    if (loading) return <LoadingScreen label="טוען הימורים מקדימים..." />;

    if (error && !teams.length) {
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
                    variant={isBettingAllowed ? "open" : "closed"}
                    icon={isBettingAllowed ? Clock : AlertCircle}
                    title={isBettingAllowed ? "הימורים מקדימים פעילים" : "תקופת ההימורים הסתיימה"}
                    description={
                        isBettingAllowed
                            ? `נותרו ${timeRemaining} · סגירה: ${formatIsraelDateTime(seasonStartDate)}`
                            : `סגירה: ${formatIsraelDateTime(seasonStartDate)}`
                    }
                />
            )}

            {error && (
                <StatusBanner variant="closed" icon={AlertCircle} title="שגיאה" description={error} />
            )}

            <Card
                className={cn(
                    isProgressComplete
                        ? "border-emerald-500/40"
                        : "border-red-500/30 bg-red-500/10"
                )}
            >
                <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">
                            {isProgressComplete ? "כל ההימורים הושלמו" : "התקדמות"}
                        </span>
                        <span
                            className={cn(
                                "font-semibold tabular-nums",
                                isProgressComplete ? "text-emerald-600 dark:text-emerald-400" : "text-red-400"
                            )}
                        >
                            {filledPicks}/{TOTAL_PRESEASON_PICKS} בחירות
                        </span>
                    </div>
                    <div
                        className={cn(
                            "mb-3 h-2.5 overflow-hidden rounded-full bg-secondary",
                            isProgressComplete ? "ring-1 ring-emerald-500/30" : ""
                        )}
                    >
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-300",
                                isProgressComplete ? "bg-emerald-500" : "bg-red-500"
                            )}
                            style={{ width: `${progress.progressPercent}%` }}
                        />
                    </div>
                    {!isProgressComplete && (
                        <p className="mb-2 text-xs font-medium text-red-400">
                            יש למלא את כל 6 ההימורים
                        </p>
                    )}
                    <div className="mb-3 flex flex-wrap gap-1.5">
                        {progressChecks.map((item) => (
                            <span
                                key={item.id}
                                className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    item.done
                                        ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                        : "bg-red-500/20 text-red-600 dark:text-red-300"
                                )}
                            >
                                {item.done ? "✓ " : ""}
                                {item.label}
                            </span>
                        ))}
                    </div>

                    {pickSummary.length > 0 && (
                        <div className="space-y-2 border-t border-border/60 pt-3">
                            <p className="text-xs font-semibold text-foreground">הבחירות שלי</p>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                                {pickSummary.map((pick) => (
                                    <SelectionChip
                                        key={pick.key}
                                        label={pick.label}
                                        sublabel={pick.sublabel}
                                        teamId={pick.teamId}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Trophy className="h-5 w-5 text-yellow-500" />
                        הימורי קבוצות
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="חיפוש קבוצה..."
                            value={teamSearch}
                            onChange={(e) => setTeamSearch(e.target.value)}
                            className="app-select pr-10"
                            disabled={!isBettingAllowed}
                        />
                    </div>

                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">אלופה</h3>
                            {savingKey === "champion" && (
                                <span className="text-xs text-muted-foreground">שומר...</span>
                            )}
                        </div>
                        {currentBets.champion && (
                            <SelectionChip
                                label={getTeamName(currentBets.champion) ?? ""}
                                teamId={currentBets.champion}
                                onClear={() => handleTeamBet("champion", currentBets.champion)}
                                disabled={!isBettingAllowed}
                            />
                        )}
                        <TeamPicker
                            teams={filteredLeagueTeams}
                            selectedId={currentBets.champion}
                            onSelect={(teamId) => handleTeamBet("champion", teamId)}
                            disabled={!isBettingAllowed || savingKey === "champion"}
                        />
                    </section>

                    <section className="space-y-3 border-t border-border/60 pt-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">זוכת גביע</h3>
                            {savingKey === "cup" && (
                                <span className="text-xs text-muted-foreground">שומר...</span>
                            )}
                        </div>
                        {currentBets.cup && (
                            <SelectionChip
                                label={getTeamName(currentBets.cup) ?? ""}
                                teamId={currentBets.cup}
                                onClear={() => handleTeamBet("cup", currentBets.cup)}
                                disabled={!isBettingAllowed}
                            />
                        )}
                        <TeamPicker
                            teams={filteredCupTeams}
                            selectedId={currentBets.cup}
                            onSelect={(teamId) => handleTeamBet("cup", teamId)}
                            disabled={!isBettingAllowed || savingKey === "cup"}
                        />
                    </section>

                    <section className="space-y-3 border-t border-border/60 pt-5">
                        <div className="flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-sm font-semibold">
                                <TrendingDown className="h-4 w-4 text-red-400" />
                                שתי קבוצות שירדו ליגה
                            </h3>
                            <span className="text-xs text-muted-foreground">5 נק׳ לכל פגיעה</span>
                        </div>

                        <div
                            className={cn(
                                "space-y-3 rounded-xl border p-3",
                                relegationPicks.length === 2
                                    ? "border-emerald-500/30 bg-emerald-500/10"
                                    : "border-red-500/30 bg-red-500/10"
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <p
                                    className={cn(
                                        "text-xs font-semibold",
                                        relegationPicks.length === 2 ? "text-emerald-400" : "text-red-400"
                                    )}
                                >
                                    {relegationPicks.length === 0 &&
                                        "יש לבחור שתי קבוצות — לא מספיק לבחור רק אחת"}
                                    {relegationPicks.length === 1 &&
                                        "נבחרה קבוצה אחת — בחר עוד קבוצה אחת"}
                                    {relegationPicks.length === 2 && "נבחרו שתי הקבוצות"}
                                </p>
                                <span
                                    className={cn(
                                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                                        relegationPicks.length === 2
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : "bg-red-500/20 text-red-300"
                                    )}
                                >
                                    {relegationPicks.length}/2
                                </span>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                {[currentBets.relegation1, currentBets.relegation2].map((teamId, index) =>
                                    teamId ? (
                                        <SelectionChip
                                            key={teamId}
                                            label={getTeamName(teamId) ?? ""}
                                            sublabel={`בחירה ${index + 1}`}
                                            teamId={teamId}
                                            onClear={() => handleRelegationToggle(teamId)}
                                            disabled={!isBettingAllowed}
                                        />
                                    ) : (
                                        <div
                                            key={`empty-${index}`}
                                            className="flex items-center gap-2 rounded-xl border border-dashed border-red-500/40 bg-red-500/5 px-3 py-2.5"
                                        >
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-xs font-bold text-red-400">
                                                {index + 1}
                                            </span>
                                            <div className="min-w-0 flex-1 text-right">
                                                <div className="text-xs font-medium text-red-400">
                                                    {index === 0 ? "בחר קבוצה ראשונה" : "בחר קבוצה שנייה"}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    לחץ על קבוצה מהרשימה למטה
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            אין חשיבות לסדר הבחירות — לחיצה נוספת על קבוצה נבחרת מסירה אותה.
                        </p>
                        <TeamPicker
                            teams={filteredLeagueTeams}
                            selectedIds={relegationPicks}
                            maxSelections={2}
                            onToggle={handleRelegationToggle}
                            disabled={!isBettingAllowed || savingKey === "relegation"}
                        />
                    </section>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-5 w-5 text-sky-400" />
                        הימורי שחקנים
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-sm font-semibold">
                                <Target className="h-4 w-4 text-green-400" />
                                מלך השערים
                            </h3>
                            {savingKey === "topScorer" && (
                                <span className="text-xs text-muted-foreground">שומר...</span>
                            )}
                        </div>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="חיפוש שחקן למלך השערים..."
                                value={scorerSearch}
                                onChange={(e) => setScorerSearch(e.target.value)}
                                className="app-select pr-10"
                                disabled={!isBettingAllowed}
                            />
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                נמצאו {filteredScorerPlayers.length} שחקנים
                            </p>
                        </div>
                        {currentBets.topScorer && (
                            <SelectionChip
                                label={getPlayer(currentBets.topScorer)?.name ?? ""}
                                sublabel={getPlayer(currentBets.topScorer)?.team}
                                teamId={getPlayer(currentBets.topScorer)?.teamId}
                                onClear={() => handlePlayerBet("topScorer", currentBets.topScorer)}
                                disabled={!isBettingAllowed}
                            />
                        )}
                        <PlayerPicker
                            players={filteredScorerPlayers}
                            selectedId={currentBets.topScorer}
                            onSelect={(playerId) => handlePlayerBet("topScorer", playerId)}
                            disabled={!isBettingAllowed || savingKey === "topScorer"}
                        />
                    </section>

                    <section className="space-y-3 border-t border-border/60 pt-5">
                        <div className="flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-sm font-semibold">
                                <Zap className="h-4 w-4 text-purple-400" />
                                מלך הבישולים
                            </h3>
                            {savingKey === "topAssists" && (
                                <span className="text-xs text-muted-foreground">שומר...</span>
                            )}
                        </div>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="חיפוש שחקן למלך הבישולים..."
                                value={assistsSearch}
                                onChange={(e) => setAssistsSearch(e.target.value)}
                                className="app-select pr-10"
                                disabled={!isBettingAllowed}
                            />
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                נמצאו {filteredAssistsPlayers.length} שחקנים
                            </p>
                        </div>
                        {currentBets.topAssists && (
                            <SelectionChip
                                label={getPlayer(currentBets.topAssists)?.name ?? ""}
                                sublabel={getPlayer(currentBets.topAssists)?.team}
                                teamId={getPlayer(currentBets.topAssists)?.teamId}
                                onClear={() => handlePlayerBet("topAssists", currentBets.topAssists)}
                                disabled={!isBettingAllowed}
                            />
                        )}
                        <PlayerPicker
                            players={filteredAssistsPlayers}
                            selectedId={currentBets.topAssists}
                            onSelect={(playerId) => handlePlayerBet("topAssists", playerId)}
                            disabled={!isBettingAllowed || savingKey === "topAssists"}
                        />
                    </section>
                </CardContent>
            </Card>

            <Card className="border-sky-500/20 bg-sky-500/5">
                <CardContent className="p-3">
                    <p className="text-xs font-semibold text-foreground">
                        ניקוד: אלופה 10 · גביע 8 · יורדת 5 (לכל קבוצה) · שערים 7 · בישולים 5
                    </p>
                </CardContent>
            </Card>
        </PageShell>
    );
}
