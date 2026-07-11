import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, AlertCircle } from "lucide-react";
import { Team } from "@/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    getSeasonPath,
    getCurrentSeason,
    resolveCurrentRound,
} from "@/lib/season";
import type { RoundSummary } from "@/lib/sorting";
import { ensureServerTimeSynced } from "@/lib/serverTime";
import {
    buildRoundNavigationUnits,
    findNavigationUnitIndex,
    getOpenRoundsForUser,
} from "@/lib/activeBettingRounds";
import { subscribeToSeasonRounds } from "@/lib/roundSubscriptions";
import RoundBettingPanel from "@/components/RoundBettingPanel";
import RoundNavScrollBar from "@/components/RoundNavScrollBar";
import PageShell from "@/components/layout/PageShell";
import PageHeader from "@/components/layout/PageHeader";
import LoadingScreen from "@/components/layout/LoadingScreen";
import EmptyState from "@/components/layout/EmptyState";

type PageEmptyState =
    | { kind: "no-rounds" }
    | { kind: "error"; message: string };

export default function RoundBetsPage() {
    const { user } = useAuth();
    const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
    const [activeRoundInUnit, setActiveRoundInUnit] = useState<number | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [emptyState, setEmptyState] = useState<PageEmptyState | null>(null);
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [sortedRounds, setSortedRounds] = useState<RoundSummary[]>([]);
    const initialNavDoneRef = useRef(false);
    const anchorRoundRef = useRef<number | null>(null);

    const navUnits = useMemo(
        () => buildRoundNavigationUnits(sortedRounds),
        [sortedRounds]
    );

    const currentUnit = navUnits[currentUnitIndex] ?? null;

    const displayedRoundNumber = currentUnit
        ? currentUnit.isGrouped
            ? activeRoundInUnit ?? currentUnit.roundNumbers[0]
            : currentUnit.roundNumbers[0]
        : null;

    useEffect(() => {
        anchorRoundRef.current = displayedRoundNumber;
    }, [displayedRoundNumber]);

    useEffect(() => {
        const unit = navUnits[currentUnitIndex];
        if (!unit) return;
        setActiveRoundInUnit((prev) =>
            prev && unit.roundNumbers.includes(prev) ? prev : unit.roundNumbers[0]
        );
    }, [currentUnitIndex, navUnits]);

    useEffect(() => {
        setCurrentSeason(getCurrentSeason());
        loadTeams();

        let cancelled = false;
        const seasonPath = getSeasonPath();

        const init = async () => {
            setLoading(true);
            setError(null);
            setEmptyState(null);
            initialNavDoneRef.current = false;
            try {
                if (user) {
                    await ensureServerTimeSynced(user.uid);
                }
            } catch (loadError) {
                console.error('Error syncing time:', loadError);
            }
        };

        init();

        const unsubscribe = subscribeToSeasonRounds(
            seasonPath,
            (rounds, allRounds) => {
                if (cancelled) return;

                setSortedRounds(rounds);

                if (rounds.length === 0) {
                    setEmptyState({ kind: "no-rounds" });
                    setError(null);
                    setLoading(false);
                    return;
                }

                setEmptyState(null);
                const units = buildRoundNavigationUnits(rounds);

                if (!initialNavDoneRef.current) {
                    const openRounds = getOpenRoundsForUser(allRounds, user?.uid);
                    const defaultRound =
                        openRounds.length > 0
                            ? openRounds[0].number
                            : null;

                    const resolveDefault = async () => {
                        const roundNum =
                            defaultRound ?? resolveCurrentRound(rounds);
                        if (cancelled) return;
                        if (roundNum) {
                            setCurrentUnitIndex(findNavigationUnitIndex(units, roundNum));
                        } else {
                            setCurrentUnitIndex(0);
                        }
                        initialNavDoneRef.current = true;
                        setLoading(false);
                    };
                    resolveDefault();
                    return;
                }

                const anchor = anchorRoundRef.current;
                if (anchor != null) {
                    const idx = findNavigationUnitIndex(units, anchor);
                    if (idx >= 0) {
                        setCurrentUnitIndex(idx);
                    }
                }
                setLoading(false);
            },
            (subError) => {
                console.error('Error subscribing to rounds:', subError);
                if (!cancelled) {
                    setEmptyState({
                        kind: "error",
                        message: "שגיאה בטעינת המחזורים. נסה לרענן את הדף.",
                    });
                    setLoading(false);
                }
            }
        );

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [user?.uid]);

    const loadTeams = async () => {
        try {
            const seasonPath = getSeasonPath();
            const teamsSnapshot = await getDocs(collection(db, seasonPath, 'teams'));
            const teamsData = teamsSnapshot.docs.map((teamDoc) => ({
                uid: teamDoc.id,
                ...teamDoc.data(),
            })) as Team[];
            setTeams(teamsData);
        } catch (loadError) {
            console.error('Error loading teams:', loadError);
        }
    };

    const handleSelectUnit = (unitIndex: number) => {
        const unit = navUnits[unitIndex];
        if (!unit) return;
        setCurrentUnitIndex(unitIndex);
        setActiveRoundInUnit(unit.roundNumbers[0]);
    };

    const handleSelectRoundInGroup = (roundNumber: number) => {
        setActiveRoundInUnit(roundNumber);
    };

    const getRoundLabel = (roundNumber: number) => {
        const meta = sortedRounds.find((round) => round.number === roundNumber);
        return meta?.name || `מחזור ${roundNumber}`;
    };

    if (loading) {
        return <LoadingScreen label="טוען הימורי מחזור..." />;
    }

    if (emptyState?.kind === "no-rounds") {
        return (
            <PageShell wide>
                <PageHeader title="הימורי מחזור" subtitle={`עונה ${currentSeason}`} />
                <EmptyState
                    icon={Calendar}
                    title="אין מחזורים בעונה"
                    description="עדיין לא נוצרו מחזורים לעונה הנוכחית. כשהמנהל יפרסם מחזורים, תוכל להזין כאן את ההימורים שלך."
                />
            </PageShell>
        );
    }

    if (emptyState?.kind === "error") {
        return (
            <PageShell wide>
                <PageHeader title="הימורי מחזור" subtitle={`עונה ${currentSeason}`} />
                <EmptyState
                    icon={AlertCircle}
                    title="לא ניתן לטעון את הדף"
                    description={emptyState.message}
                    action={
                        <Button onClick={() => window.location.reload()}>נסה שוב</Button>
                    }
                />
            </PageShell>
        );
    }

    if (error) {
        return (
            <PageShell wide>
                <PageHeader title="הימורי מחזור" subtitle={`עונה ${currentSeason}`} />
                <EmptyState
                    icon={AlertCircle}
                    title="שגיאה"
                    description={error}
                    action={
                        <Button onClick={() => window.location.reload()}>נסה שוב</Button>
                    }
                />
            </PageShell>
        );
    }

    return (
        <PageShell wide>
            <PageHeader title="הימורי מחזור" subtitle={`עונה ${currentSeason}`} />

            {displayedRoundNumber && navUnits.length > 0 && (
                <RoundNavScrollBar
                    units={navUnits}
                    activeUnitIndex={currentUnitIndex}
                    activeRoundNumber={displayedRoundNumber}
                    rounds={sortedRounds}
                    userId={user?.uid}
                    getRoundLabel={getRoundLabel}
                    onSelectUnit={handleSelectUnit}
                    onSelectRoundInGroup={handleSelectRoundInGroup}
                />
            )}

            {displayedRoundNumber && (
                <RoundBettingPanel
                    key={displayedRoundNumber}
                    roundNumber={displayedRoundNumber}
                    roundLabel={getRoundLabel(displayedRoundNumber)}
                    teams={teams}
                />
            )}

        </PageShell>
    );
}
