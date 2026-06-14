import { useState, useEffect, useMemo } from "react";
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

function getRelegationPicks(bets: Record<string, string>): string[] {
    const picks = [bets.relegation1, bets.relegation2].filter(Boolean);
    return [...new Set(picks)];
}

function countFilledPicks(bets: Record<string, string>): number {
    return [
        bets.champion,
        bets.cup,
        bets.relegation1,
        bets.relegation2,
        bets.topScorer,
        bets.topAssists,
    ].filter(Boolean).length;
}

function setRelegationPicks(
    bets: Record<string, string>,
    picks: string[]
): Record<string, string> {
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
                <div className="truncate text-sm font-medium text-emerald-300">{label}</div>
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
    const [currentBets, setCurrentBets] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [teamSearch, setTeamSearch] = useState("");
    const [playerSearch, setPlayerSearch] = useState("");
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

    const filteredPlayers = useMemo(() => {
        if (!playerSearch.trim()) return sortedPlayers;
        const term = playerSearch.trim();
        return sortedPlayers.filter(
            (player) => player.name.includes(term) || player.team.includes(term)
        );
    }, [sortedPlayers, playerSearch]);

    const relegationPicks = getRelegationPicks(currentBets);
    const filledPicks = countFilledPicks(currentBets);

    const progressChecks = [
        { label: "אלופה", done: !!currentBets.champion },
        { label: "גביע", done: !!currentBets.cup },
        { label: `יורדות (${relegationPicks.length}/2)`, done: relegationPicks.length === 2 },
        { label: "מלך שערים", done: !!currentBets.topScorer },
        { label: "מלך בישולים", done: !!currentBets.topAssists },
    ];

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

    const persistBets = async (newBets: Record<string, string>, savingId: string) => {
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
        const nextValue = currentBets[key] === teamId ? "" : teamId;
        await persistBets({ ...currentBets, [key]: nextValue }, key);
    };

    const handleRelegationToggle = async (teamId: string) => {
        const picks = getRelegationPicks(currentBets);

        let nextPicks: string[];
        if (picks.includes(teamId)) {
            nextPicks = picks.filter((id) => id !== teamId);
        } else if (picks.length < 2) {
            nextPicks = [...picks, teamId];
        } else {
            return;
        }

        await persistBets(setRelegationPicks(currentBets, nextPicks), "relegation");
    };

    const handlePlayerBet = async (key: PlayerBetKey, playerId: string) => {
        const nextValue = currentBets[key] === playerId ? "" : playerId;
        await persistBets({ ...currentBets, [key]: nextValue }, key);
    };

    const getTeamName = (teamId: string) => teams.find((team) => team.uid === teamId)?.name;
    const getPlayer = (playerId: string) => players.find((player) => player.uid === playerId);

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

            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium">התקדמות</span>
                        <span className="text-muted-foreground">
                            {filledPicks}/{TOTAL_PRESEASON_PICKS} בחירות
                        </span>
                    </div>
                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${(filledPicks / TOTAL_PRESEASON_PICKS) * 100}%` }}
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {progressChecks.map((item) => (
                            <span
                                key={item.label}
                                className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    item.done
                                        ? "bg-emerald-500/20 text-emerald-300"
                                        : "bg-secondary text-muted-foreground"
                                )}
                            >
                                {item.done ? "✓ " : ""}
                                {item.label}
                            </span>
                        ))}
                    </div>
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
                            <span className="text-xs text-muted-foreground">
                                {relegationPicks.length}/2 · 5 נק׳ לכל פגיעה
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            בחר שתי קבוצות. אין חשיבות לסדר — לחיצה נוספת מסירה בחירה.
                        </p>
                        {relegationPicks.length > 0 && (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {relegationPicks.map((teamId) => (
                                    <SelectionChip
                                        key={teamId}
                                        label={getTeamName(teamId) ?? ""}
                                        teamId={teamId}
                                        onClear={() => handleRelegationToggle(teamId)}
                                        disabled={!isBettingAllowed}
                                    />
                                ))}
                            </div>
                        )}
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
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="חיפוש לפי שם שחקן או קבוצה..."
                            value={playerSearch}
                            onChange={(e) => setPlayerSearch(e.target.value)}
                            className="app-select pr-10"
                            disabled={!isBettingAllowed}
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            נמצאו {filteredPlayers.length} שחקנים
                        </p>
                    </div>

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
                            players={filteredPlayers}
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
                            players={filteredPlayers}
                            selectedId={currentBets.topAssists}
                            onSelect={(playerId) => handlePlayerBet("topAssists", playerId)}
                            disabled={!isBettingAllowed || savingKey === "topAssists"}
                        />
                    </section>
                </CardContent>
            </Card>

            <Card className="border-sky-500/20 bg-sky-500/5">
                <CardContent className="p-3">
                    <h3 className="mb-1 text-sm font-semibold text-sky-300">מידע חשוב</h3>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                        <li>לחיצה על בחירה קיימת מחליפה אותה · X מסיר בחירה</li>
                        <li>לאחר סגירה לא ניתן לשנות הימורים</li>
                        <li>נקודות יוענקו בסוף העונה</li>
                    </ul>
                    <div className="mt-2 border-t border-border/50 pt-2">
                        <p className="text-xs font-semibold text-foreground">
                            ניקוד: אלופה 10 · גביע 8 · יורדת 5 (לכל קבוצה) · שערים 7 · בישולים 5
                        </p>
                    </div>
                </CardContent>
            </Card>
        </PageShell>
    );
}
