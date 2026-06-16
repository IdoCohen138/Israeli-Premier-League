import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Team } from "@/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    getSeasonPath,
    getCurrentSeason,
    getPrimaryRound,
} from "@/lib/season";
import type { RoundSummary } from "@/lib/sorting";
import { ensureServerTimeSynced } from "@/lib/serverTime";
import {
    buildRoundNavigationUnits,
    findNavigationUnitIndex,
    formatNavigationUnitLabel,
    getOpenRoundsForUser,
} from "@/lib/activeBettingRounds";
import { subscribeToSeasonRounds } from "@/lib/roundSubscriptions";
import RoundBettingPanel from "@/components/RoundBettingPanel";
import PageShell from "@/components/layout/PageShell";
import PageHeader from "@/components/layout/PageHeader";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { cn } from "@/lib/utils";

export default function RoundBetsPage() {
    const { user } = useAuth();
    const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
    const [activeRoundInUnit, setActiveRoundInUnit] = useState<number | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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
                    setError('לא נמצאו מחזורים');
                    setLoading(false);
                    return;
                }

                setError(null);
                const units = buildRoundNavigationUnits(rounds);

                if (!initialNavDoneRef.current) {
                    const openRounds = getOpenRoundsForUser(allRounds, user?.uid);
                    const defaultRound =
                        openRounds.length > 0
                            ? openRounds[0].number
                            : null;

                    const resolveDefault = async () => {
                        const roundNum = defaultRound ?? (await getPrimaryRound(undefined, user?.uid));
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
                    setError('שגיאה בטעינת המחזור');
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

    const handlePrevUnit = () => {
        if (currentUnitIndex < navUnits.length - 1) {
            setCurrentUnitIndex(currentUnitIndex + 1);
        }
    };

    const handleNextUnit = () => {
        if (currentUnitIndex > 0) {
            setCurrentUnitIndex(currentUnitIndex - 1);
        }
    };

    const getRoundLabel = (roundNumber: number) => {
        const meta = sortedRounds.find((round) => round.number === roundNumber);
        return meta?.name || `מחזור ${roundNumber}`;
    };

    const unitTitle = currentUnit
        ? formatNavigationUnitLabel(currentUnit, getRoundLabel)
        : '—';

    if (loading) {
        return <LoadingScreen label="טוען הימורי מחזור..." />;
    }

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
            <PageHeader title="הימורי מחזור" subtitle={`עונה ${currentSeason}`} />

            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <CardTitle className="flex items-start gap-2 text-base leading-snug">
                                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <span className="break-words">{unitTitle}</span>
                            </CardTitle>
                            {currentUnit?.isGrouped && (
                                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                                    מחזורים עם סגירה קרובה — כל הימור נשמר בנפרד
                                </p>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleNextUnit}
                                disabled={currentUnitIndex <= 0}
                                className="h-8 w-8"
                                aria-label="מחזור קודם בזמן"
                            >
                                <ChevronRight size={16} />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handlePrevUnit}
                                disabled={navUnits.length === 0 || currentUnitIndex >= navUnits.length - 1}
                                className="h-8 w-8"
                                aria-label="מחזור הבא בזמן"
                            >
                                <ChevronLeft size={16} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {currentUnit?.isGrouped && (
                <div className="round-bets-pair-switcher" role="tablist" aria-label="בחירת מחזור ביחידה">
                    {currentUnit.roundNumbers.map((roundNumber) => {
                        const isActive = displayedRoundNumber === roundNumber;
                        const roundLabel = getRoundLabel(roundNumber);
                        return (
                            <button
                                key={roundNumber}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                className={cn(
                                    "round-bets-pair-tab",
                                    isActive && "round-bets-pair-tab--active"
                                )}
                                onClick={() => setActiveRoundInUnit(roundNumber)}
                            >
                                <span className="round-bets-pair-tab-label">{roundLabel}</span>
                            </button>
                        );
                    })}
                </div>
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
