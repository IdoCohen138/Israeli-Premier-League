import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, ListX } from "lucide-react";
import { Match, Round, Bet, Team } from "@/types";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath } from "@/lib/season";
import { saveRoundBets, getPlayerRoundBets } from "@/lib/playerBets";
import { sortMatchesByStartTime } from "@/lib/sorting";
import {
    ensureServerTimeSynced,
    isDeadlinePassed,
    getEffectiveDeadlineForUser,
    getRemainingTimeLabel,
    BETTING_CLOSED_ERROR,
} from "@/lib/serverTime";
import { formatIsraelDateTime } from "@/lib/israelTime";
import TeamLogo from "@/components/TeamLogo";
import StatusBanner from "@/components/layout/StatusBanner";
import EmptyState from "@/components/layout/EmptyState";

interface RoundBettingPanelProps {
    roundNumber: number;
    teams: Team[];
    roundLabel: string;
}

export default function RoundBettingPanel({
    roundNumber,
    teams,
    roundLabel,
}: RoundBettingPanelProps) {
    const { user } = useAuth();
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [bets, setBets] = useState<Bet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBettingAllowed, setIsBettingAllowed] = useState(true);
    const [timeRemaining, setTimeRemaining] = useState('');
    const [hasExtension, setHasExtension] = useState(false);
    const [extensionUntil, setExtensionUntil] = useState('');

    useEffect(() => {
        if (!user) return;

        let cancelled = false;
        let matchesCache: Match[] | null = null;
        const seasonPath = getSeasonPath();
        const roundRef = doc(db, seasonPath, 'rounds', roundNumber.toString());

        const buildRound = (
            data: Record<string, unknown>,
            matches: Match[]
        ): Round => ({
            number: roundNumber,
            name: (data.name as string) || `מחזור ${roundNumber}`,
            matches: matches.map((m) => m.uid),
            matchesDetails: matches,
            startTime: (data.startTime as string) || '',
            isActive: (data.isActive as boolean) || false,
            bettingExtensions: (data.bettingExtensions as Record<string, string>) || {},
        });

        const applyRound = async (data: Record<string, unknown>) => {
            if (!matchesCache) {
                const matchesSnapshot = await getDocs(
                    collection(db, seasonPath, 'rounds', roundNumber.toString(), 'matches')
                );
                if (cancelled) return;

                matchesCache = sortMatchesByStartTime(
                    matchesSnapshot.docs.map((matchDoc) => ({
                        uid: matchDoc.id,
                        ...matchDoc.data(),
                    })) as Match[]
                );

                const existingBets = await getPlayerRoundBets(user.uid, roundNumber);
                if (cancelled) return;
                setBets(existingBets ?? []);
            }

            const roundData = buildRound(data, matchesCache);
            setCurrentRound(roundData);
            checkBettingStatus(roundData);
            setError(null);
            setLoading(false);
        };

        setLoading(true);
        setError(null);
        setBets([]);

        ensureServerTimeSynced(user.uid).catch(() => undefined);

        const unsubscribe = onSnapshot(
            roundRef,
            (snapshot) => {
                if (cancelled) return;
                if (!snapshot.exists()) {
                    setCurrentRound(null);
                    setError('המחזור לא קיים');
                    setLoading(false);
                    return;
                }
                applyRound(snapshot.data()).catch((loadError) => {
                    console.error('Error loading round data:', loadError);
                    if (!cancelled) {
                        setError('שגיאה בטעינת נתוני המחזור');
                        setLoading(false);
                    }
                });
            },
            (subError) => {
                console.error('Error subscribing to round:', subError);
                if (!cancelled) {
                    setError('שגיאה בטעינת נתוני המחזור');
                    setLoading(false);
                }
            }
        );

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [roundNumber, user]);

    useEffect(() => {
        if (!currentRound?.startTime || !isBettingAllowed) return;
        const updateTimer = () => {
            if (currentRound) checkBettingStatus(currentRound);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [currentRound, isBettingAllowed]);

    const checkBettingStatus = (round: Round) => {
        if (!round.startTime) {
            setIsBettingAllowed(true);
            setTimeRemaining('');
            setHasExtension(false);
            setExtensionUntil('');
            return;
        }

        try {
            const userExtensionRaw = user?.uid ? round.bettingExtensions?.[user.uid] : undefined;
            const effectiveDeadline = getEffectiveDeadlineForUser(
                round.startTime,
                user?.uid,
                round.bettingExtensions
            );

            const userHasActiveExtension = Boolean(
                userExtensionRaw &&
                    effectiveDeadline === userExtensionRaw &&
                    !isDeadlinePassed(effectiveDeadline)
            );

            if (isDeadlinePassed(effectiveDeadline)) {
                setIsBettingAllowed(false);
                setTimeRemaining('');
                setHasExtension(userHasActiveExtension);
                setExtensionUntil(
                    userHasActiveExtension && typeof effectiveDeadline === 'string'
                        ? effectiveDeadline
                        : ''
                );
                return;
            }

            setIsBettingAllowed(true);
            setTimeRemaining(getRemainingTimeLabel(effectiveDeadline));
            setHasExtension(userHasActiveExtension);
            setExtensionUntil(
                userHasActiveExtension && typeof effectiveDeadline === 'string'
                    ? effectiveDeadline
                    : ''
            );
        } catch (statusError) {
            console.error('Error checking betting status:', statusError);
            setIsBettingAllowed(true);
            setTimeRemaining('');
            setHasExtension(false);
            setExtensionUntil('');
        }
    };

    const handleBet = async (matchId: string, homeScore: number, awayScore: number) => {
        if (!user) return;

        if (!isBettingAllowed) {
            setError('תקופת ההימורים למחזור זה הסתיימה. לא ניתן לשנות הימורים יותר.');
            return;
        }

        try {
            const newBet: Bet = {
                userId: user.uid,
                matchId,
                round: roundNumber,
                homeScore,
                awayScore,
            };

            const updatedBets = bets.filter((bet) => bet.matchId !== matchId);
            updatedBets.push(newBet);

            await saveRoundBets(user.uid, roundNumber, updatedBets, user.displayName || user.email);

            setBets(updatedBets);
            setError(null);

            setTimeout(() => {
                getPlayerRoundBets(user.uid, roundNumber).then((newBets) => {
                    if (newBets) {
                        setBets(newBets);
                    } else {
                        setBets([]);
                    }
                });
            }, 2000);
        } catch (saveError) {
            if (saveError instanceof Error && saveError.message === BETTING_CLOSED_ERROR) {
                setError('תקופת ההימורים למחזור זה הסתיימה. לא ניתן לשנות הימורים יותר.');
                setIsBettingAllowed(false);
                return;
            }
            console.error('Error saving bet:', saveError);
            setError('שגיאה בשמירת ההימור. אנא נסה שוב.');
        }
    };

    const getBetForMatch = (matchId: string) => bets.find((bet) => bet.matchId === matchId);

    const getTeamName = (teamId: string) =>
        teams.find((team) => team.uid === teamId)?.name || 'קבוצה לא ידועה';

    const formatDateTime = (dateTimeString: string) =>
        dateTimeString ? formatIsraelDateTime(dateTimeString) : 'לא נקבע';

    if (loading) {
        return (
            <div className="round-betting-panel round-betting-panel--loading">
                <p className="text-sm text-muted-foreground">טוען {roundLabel}...</p>
            </div>
        );
    }

    if (error && !currentRound) {
        return (
            <div className="round-betting-panel">
                <div className="status-banner status-closed text-sm">{error}</div>
            </div>
        );
    }

    return (
        <div className="round-betting-panel">
            {currentRound && currentRound.startTime && (
                <StatusBanner
                    variant={isBettingAllowed ? 'open' : 'closed'}
                    icon={Clock}
                    title={
                        isBettingAllowed
                            ? hasExtension
                                ? 'חלון הימורים פתוח עבורך'
                                : 'הימורים פעילים'
                            : 'ההימורים נסגרו'
                    }
                    description={
                        isBettingAllowed
                            ? hasExtension
                                ? `המנהל פתח עבורך את ההימורים. נותרו ${timeRemaining}`
                                : `נותרו ${timeRemaining} עד סגירה`
                            : 'לא ניתן לשנות או להוסיף הימורים'
                    }
                    meta={
                        hasExtension && extensionUntil
                            ? `הוארך עד: ${formatDateTime(extensionUntil)}`
                            : formatDateTime(currentRound.startTime)
                    }
                />
            )}

            {currentRound && !currentRound.startTime && (
                <StatusBanner
                    variant="info"
                    icon={Clock}
                    title="שעת נעילה לא נקבעה"
                    description="לא ניתן לדעת מתי ייסגרו ההימורים"
                />
            )}

            {error && (
                <div className="status-banner status-closed text-sm">{error}</div>
            )}

            {currentRound && (
                <div className="space-y-2">
                    {(currentRound.matchesDetails?.length ?? 0) === 0 ? (
                        <EmptyState
                            icon={ListX}
                            title="אין משחקים במחזור"
                            description="למחזור זה עדיין לא שויכו משחקים. כשהמנהל יוסיף משחקים, תוכל להזין הימורים כאן."
                        />
                    ) : (
                    currentRound.matchesDetails?.map((match) => (
                        <Card key={match.uid}>
                            <CardContent className="p-3 sm:p-4">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                                            <TeamLogo teamId={match.homeTeamId} size="md" />
                                            <h3 className="text-xs font-semibold leading-tight sm:text-sm">
                                                {getTeamName(match.homeTeamId)}
                                            </h3>
                                        </div>
                                        <span className="text-[10px] font-medium text-muted-foreground">נגד</span>
                                        <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                                            <TeamLogo teamId={match.awayTeamId} size="md" />
                                            <h3 className="text-xs font-semibold leading-tight sm:text-sm">
                                                {getTeamName(match.awayTeamId)}
                                            </h3>
                                        </div>
                                    </div>

                                    {getBetForMatch(match.uid) && (
                                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 py-2 text-center text-sm font-semibold text-emerald-400">
                                            ההימור שלך: {getBetForMatch(match.uid)?.homeScore} -{' '}
                                            {getBetForMatch(match.uid)?.awayScore}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-center gap-3">
                                        <input
                                            type="number"
                                            min="0"
                                            max="20"
                                            data-match={`${roundNumber}-${match.uid}-home`}
                                            className="bet-input"
                                            placeholder="?"
                                            defaultValue={getBetForMatch(match.uid)?.homeScore ?? ''}
                                            disabled={!isBettingAllowed}
                                            onChange={(e) => {
                                                const homeValue = e.target.value;
                                                const awayInput = document.querySelector(
                                                    `input[data-match='${roundNumber}-${match.uid}-away']`
                                                ) as HTMLInputElement;
                                                const awayValue = awayInput?.value;
                                                if (
                                                    homeValue !== '' &&
                                                    awayValue !== '' &&
                                                    !isNaN(Number(homeValue)) &&
                                                    !isNaN(Number(awayValue))
                                                ) {
                                                    handleBet(match.uid, Number(homeValue), Number(awayValue));
                                                }
                                            }}
                                        />
                                        <span className="text-lg font-bold text-muted-foreground">:</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="20"
                                            data-match={`${roundNumber}-${match.uid}-away`}
                                            className="bet-input"
                                            placeholder="?"
                                            defaultValue={getBetForMatch(match.uid)?.awayScore ?? ''}
                                            disabled={!isBettingAllowed}
                                            onChange={(e) => {
                                                const awayValue = e.target.value;
                                                const homeInput = document.querySelector(
                                                    `input[data-match='${roundNumber}-${match.uid}-home']`
                                                ) as HTMLInputElement;
                                                const homeValue = homeInput?.value;
                                                if (
                                                    homeValue !== '' &&
                                                    awayValue !== '' &&
                                                    !isNaN(Number(homeValue)) &&
                                                    !isNaN(Number(awayValue))
                                                ) {
                                                    handleBet(match.uid, Number(homeValue), Number(awayValue));
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                    )}
                </div>
            )}
        </div>
    );
}
