import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Match, Round, Bet, Team } from "@/types";
import { collection, doc, getDocs, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSeasonPath, getCurrentSeason, getDefaultBettingRound, getSortedRounds } from "@/lib/season";
import { saveRoundBets, getPlayerRoundBets } from "@/lib/playerBets";
import { sortMatchesByStartTime, getRoundIndexInOrder } from "@/lib/sorting";
import type { RoundSummary } from "@/lib/sorting";
import {
  ensureServerTimeSynced,
  isDeadlinePassed,
  getEffectiveDeadlineForUser,
  getRemainingTimeLabel,
  BETTING_CLOSED_ERROR,
} from "@/lib/serverTime";
import { formatIsraelDateTime } from "@/lib/israelTime";
import TeamLogo from "@/components/TeamLogo";
import PageShell from "@/components/layout/PageShell";
import PageHeader from "@/components/layout/PageHeader";
import StatusBanner from "@/components/layout/StatusBanner";
import LoadingScreen from "@/components/layout/LoadingScreen";

export default function RoundBetsPage() {
    const { user } = useAuth();
    const [currentRoundNumber, setCurrentRoundNumber] = useState<number | null>(null);
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [bets, setBets] = useState<Bet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasExistingBets, setHasExistingBets] = useState(false);
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [isBettingAllowed, setIsBettingAllowed] = useState(true);
    const [timeRemaining, setTimeRemaining] = useState<string>('');
    const [hasExtension, setHasExtension] = useState(false);
    const [extensionUntil, setExtensionUntil] = useState<string>('');
    const [isRoundDataLoaded, setIsRoundDataLoaded] = useState(false);
    const [sortedRounds, setSortedRounds] = useState<RoundSummary[]>([]);

    useEffect(() => {
        setCurrentSeason(getCurrentSeason());
        loadTeams();
        loadInitialRound();
    }, []);

    // Timer effect to update countdown
    useEffect(() => {
        if (!currentRound?.startTime || !isBettingAllowed) return;
        const updateTimer = () => {
            checkBettingStatus(currentRound);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [currentRound, isBettingAllowed]);

    const loadTeams = async () => {
        try {
            const seasonPath = getSeasonPath();
            const teamsSnapshot = await getDocs(collection(db, seasonPath, 'teams'));
            const teamsData = teamsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as Team[];
            setTeams(teamsData);
        } catch (error) {
            console.error('Error loading teams:', error);
        }
    };

    const loadInitialRound = async () => {
        setLoading(true);
        try {
            if (user) {
                await ensureServerTimeSynced(user.uid);
            }

            const rounds = await getSortedRounds();
            setSortedRounds(rounds);

            const roundNum = await getDefaultBettingRound();
            if (roundNum) {
                setCurrentRoundNumber(roundNum);
                await loadRoundData(roundNum, rounds);
            } else {
                setError('לא נמצא מחזור נוכחי');
            }
        } catch (error) {
            setError('שגיאה בטעינת המחזור הנוכחי');
        } finally {
            setLoading(false);
        }
    };

    const loadRoundData = async (roundNumber: number, roundsList?: RoundSummary[]) => {
        if (!user) return;
        setIsRoundDataLoaded(false);
        setHasExistingBets(false);
        try {
            const seasonPath = getSeasonPath();
            const roundDoc = await getDoc(doc(db, seasonPath, 'rounds', roundNumber.toString()));
            if (roundDoc.exists()) {
                const data = roundDoc.data();
                const matchesSnapshot = await getDocs(collection(db, seasonPath, 'rounds', roundNumber.toString(), 'matches'));
                const matches = sortMatchesByStartTime(matchesSnapshot.docs.map((doc) => ({
                    uid: doc.id,
                    ...doc.data(),
                })) as Match[]);
                const roundData: Round = {
                    number: roundNumber,
                    name: data.name || `מחזור ${roundNumber}`,
                    matches: matches.map(m => m.uid),
                    matchesDetails: matches,
                    startTime: data.startTime || '',
                    isActive: data.isActive || false,
                    bettingExtensions: data.bettingExtensions || {},
                };
                setCurrentRound(roundData);
                checkBettingStatus(roundData);
                setCurrentRoundNumber(roundNumber);
                const existingBets = await getPlayerRoundBets(user.uid, roundNumber);
                if (existingBets) {
                    setBets(existingBets);
                    setHasExistingBets(true);
                } else {
                    setBets([]);
                    setHasExistingBets(false);
                }
                setIsRoundDataLoaded(true);
                if (roundsList) {
                    setSortedRounds(roundsList);
                } else {
                    const rounds = await getSortedRounds();
                    setSortedRounds(rounds);
                }
            } else {
                setCurrentRound(null);
                setIsRoundDataLoaded(true);
                setError('המחזור לא קיים');
            }
        } catch (error) {
            console.error('Error loading round data:', error);
            setError('שגיאה בטעינת נתוני המחזור. אנא נסה שוב.');
            setIsRoundDataLoaded(true);
        }
    };

    const handlePrevRound = () => {
        if (!currentRoundNumber) return;
        const currentIndex = getRoundIndexInOrder(sortedRounds, currentRoundNumber);
        if (currentIndex >= 0 && currentIndex < sortedRounds.length - 1) {
            loadRoundData(sortedRounds[currentIndex + 1].number);
        }
    };
    const handleNextRound = () => {
        if (!currentRoundNumber) return;
        const currentIndex = getRoundIndexInOrder(sortedRounds, currentRoundNumber);
        if (currentIndex > 0) {
            loadRoundData(sortedRounds[currentIndex - 1].number);
        }
    };

    const handleBet = async (matchId: string, homeScore: number, awayScore: number) => {
        if (!user || !currentRoundNumber) return;
        
        if (!isBettingAllowed) {
            setError('תקופת ההימורים למחזור זה הסתיימה. לא ניתן לשנות הימורים יותר.');
            return;
        }

        try {
            const newBet: Bet = {
                userId: user.uid,
                matchId,
                round: currentRoundNumber,
                homeScore,
                awayScore,
            };

            // עדכון או הוספת הימור חדש
            const updatedBets = bets.filter(bet => bet.matchId !== matchId);
            updatedBets.push(newBet);

            await saveRoundBets(user.uid, currentRoundNumber, updatedBets, user.displayName || user.email);
            
            // עדכון המצב המקומי
            setBets(updatedBets);
            setHasExistingBets(true);
            setTimeout(() => {
                // Re-fetch bets to update the saved status
                getPlayerRoundBets(user.uid, currentRoundNumber).then(newBets => {
                    if (newBets) {
                        setBets(newBets);
                        setHasExistingBets(true);
                    } else {
                        setBets([]);
                        setHasExistingBets(false);
                    }
                });
            }, 2000);
        } catch (error) {
            if (error instanceof Error && error.message === BETTING_CLOSED_ERROR) {
                setError('תקופת ההימורים למחזור זה הסתיימה. לא ניתן לשנות הימורים יותר.');
                setIsBettingAllowed(false);
                return;
            }
            console.error('Error saving bet:', error);
            setError('שגיאה בשמירת ההימור. אנא נסה שוב.');
        }
    };

    const getBetForMatch = (matchId: string) => {
        return bets.find(bet => bet.matchId === matchId);
    };

    const getTeamName = (teamId: string) => {
        return teams.find(team => team.uid === teamId)?.name || 'קבוצה לא ידועה';
    };

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
                userExtensionRaw && effectiveDeadline === userExtensionRaw && !isDeadlinePassed(effectiveDeadline)
            );

            if (isDeadlinePassed(effectiveDeadline)) {
                setIsBettingAllowed(false);
                setTimeRemaining('');
                setHasExtension(userHasActiveExtension);
                setExtensionUntil(userHasActiveExtension && typeof effectiveDeadline === 'string' ? effectiveDeadline : '');
                return;
            }

            setIsBettingAllowed(true);
            setTimeRemaining(getRemainingTimeLabel(effectiveDeadline));
            setHasExtension(userHasActiveExtension);
            setExtensionUntil(userHasActiveExtension && typeof effectiveDeadline === 'string' ? effectiveDeadline : '');
        } catch (error) {
            console.error('Error checking betting status:', error);
            setIsBettingAllowed(true);
            setTimeRemaining('');
            setHasExtension(false);
            setExtensionUntil('');
        }
    };

    const formatDateTime = (dateTimeString: string) =>
        dateTimeString ? formatIsraelDateTime(dateTimeString) : 'לא נקבע';

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
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Calendar className="h-4 w-4 text-primary" />
                                {currentRound?.name || `מחזור ${currentRoundNumber}`}
                            </CardTitle>
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="icon" onClick={handleNextRound}
                                    disabled={getRoundIndexInOrder(sortedRounds, currentRoundNumber ?? -1) <= 0}
                                    className="h-8 w-8">
                                    <ChevronRight size={16} />
                                </Button>
                                <Button variant="outline" size="icon" onClick={handlePrevRound}
                                    disabled={sortedRounds.length === 0 || getRoundIndexInOrder(sortedRounds, currentRoundNumber ?? -1) >= sortedRounds.length - 1}
                                    className="h-8 w-8">
                                    <ChevronLeft size={16} />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                {currentRound && currentRound.startTime && (
                    <StatusBanner
                        variant={isBettingAllowed ? 'open' : 'closed'}
                        icon={Clock}
                        title={isBettingAllowed
                            ? hasExtension
                                ? `${currentRound.name || `מחזור ${currentRound.number}`} — חלון הימורים פתוח עבורך`
                                : `${currentRound.name || `מחזור ${currentRound.number}`} — הימורים פעילים`
                            : `${currentRound.name || `מחזור ${currentRound.number}`} — ההימורים נסגרו`}
                        description={isBettingAllowed
                            ? hasExtension
                                ? `המנהל פתח עבורך את ההימורים. נותרו ${timeRemaining}`
                                : `נותרו ${timeRemaining} עד סגירה`
                            : 'לא ניתן לשנות או להוסיף הימורים'}
                        meta={hasExtension && extensionUntil
                            ? `הוארך עד: ${formatDateTime(extensionUntil)}`
                            : formatDateTime(currentRound.startTime)}
                    />
                )}

                {currentRound && !currentRound.startTime && (
                    <StatusBanner variant="info" icon={Clock}
                        title={currentRound.name || `מחזור ${currentRound.number}`}
                        description="שעת נעילה לא נקבעה" />
                )}

                {hasExistingBets && isBettingAllowed && isRoundDataLoaded && (
                    <StatusBanner variant="warning" icon={Clock}
                        title="הימורים קיימים"
                        description="שמירת הימור חדש תחליף את הקיים" />
                )}

                {currentRound && (
                    <div className="space-y-2">
                        <h2 className="app-section-title px-0.5">משחקי המחזור</h2>
                        {currentRound.matchesDetails?.map((match) => (
                            <Card key={match.uid}>
                                <CardContent className="p-3 sm:p-4">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                                                <TeamLogo teamId={match.homeTeamId} size="md" />
                                                <h3 className="text-xs font-semibold leading-tight sm:text-sm">{getTeamName(match.homeTeamId)}</h3>
                                            </div>
                                            <span className="text-[10px] font-medium text-muted-foreground">נגד</span>
                                            <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                                                <TeamLogo teamId={match.awayTeamId} size="md" />
                                                <h3 className="text-xs font-semibold leading-tight sm:text-sm">{getTeamName(match.awayTeamId)}</h3>
                                            </div>
                                        </div>

                                        {getBetForMatch(match.uid) && (
                                            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 py-2 text-center text-sm font-semibold text-emerald-400">
                                                ההימור שלך: {getBetForMatch(match.uid)?.homeScore} - {getBetForMatch(match.uid)?.awayScore}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-center gap-3">
                                            <input type="number" min="0" max="20"
                                                data-match={`${match.uid}-home`}
                                                className="bet-input"
                                                placeholder="?"
                                                defaultValue={getBetForMatch(match.uid)?.homeScore ?? ''}
                                                disabled={!isBettingAllowed}
                                                onChange={e => {
                                                    const homeValue = e.target.value;
                                                    const awayInput = document.querySelector(`input[data-match='${match.uid}-away']`) as HTMLInputElement;
                                                    const awayValue = awayInput?.value;
                                                    if (homeValue !== '' && awayValue !== '' && !isNaN(Number(homeValue)) && !isNaN(Number(awayValue))) {
                                                        handleBet(match.uid, Number(homeValue), Number(awayValue));
                                                    }
                                                }}
                                            />
                                            <span className="text-lg font-bold text-muted-foreground">:</span>
                                            <input type="number" min="0" max="20"
                                                data-match={`${match.uid}-away`}
                                                className="bet-input"
                                                placeholder="?"
                                                defaultValue={getBetForMatch(match.uid)?.awayScore ?? ''}
                                                disabled={!isBettingAllowed}
                                                onChange={e => {
                                                    const awayValue = e.target.value;
                                                    const homeInput = document.querySelector(`input[data-match='${match.uid}-home']`) as HTMLInputElement;
                                                    const homeValue = homeInput?.value;
                                                    if (homeValue !== '' && awayValue !== '' && !isNaN(Number(homeValue)) && !isNaN(Number(awayValue))) {
                                                        handleBet(match.uid, Number(homeValue), Number(awayValue));
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="p-3">
                        <h3 className="mb-1.5 text-sm font-semibold text-amber-300">חלוקת נקודות</h3>
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                            <li>כיוון נכון: 1 נקודה</li>
                            <li>תוצאה מדויקת: 3 נקודות</li>
                            <li>בונוס כפול אם רק אתה צדקת</li>
                        </ul>
                    </CardContent>
                </Card>
        </PageShell>
    );
} 