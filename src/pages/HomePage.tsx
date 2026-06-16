import { useState, useEffect, useRef, useMemo, type ElementType } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useNavigate } from "react-router-dom";
import {
    Trophy,
    Target,
    Users,
    Settings,
    LogOut,
    History,
    ChevronLeft,
    BarChart3,
} from "lucide-react";
import {
    formatSeasonDisplay,
    listSeasonIds,
    getCurrentSeasonData,
    parseSeasonStartField,
} from "@/lib/season";
import {
    subscribeToSeasonRounds,
    getOpenRoundsFromAll,
} from "@/lib/roundSubscriptions";
import {
    ensureServerTimeSynced,
    getBettingWindowStatus,
    formatBettingStatusLine,
    type BettingWindowStatus,
} from "@/lib/serverTime";
import {
    getHomeDisplayRounds,
    type ActiveRoundBetting,
} from "@/lib/activeBettingRounds";
import type { RoundSummary } from "@/lib/sorting";
import { cn } from "@/lib/utils";
import PreviousSeasonTableModal, { getPreviousSeasonDismissKey } from "@/components/PreviousSeasonTableModal";
import PageShell from "@/components/layout/PageShell";
import ThemeToggle from "@/components/layout/ThemeToggle";

function BettingStatusLine({
    status,
    className,
}: {
    status: BettingWindowStatus;
    className?: string;
}) {
    const line = formatBettingStatusLine(status);

    return (
        <p
            className={cn(
                "home-betting-status",
                status.isOpen ? "home-betting-status--open" : "home-betting-status--closed",
                className
            )}
        >
            <span className="home-betting-status-dot" aria-hidden />
            <span>{line}</span>
        </p>
    );
}

function ActiveRoundStatusRow({
    round,
    status,
}: {
    round: ActiveRoundBetting;
    status: BettingWindowStatus;
}) {
    return (
        <div className="home-active-round-row">
            <span className="home-active-round-name">{round.name}</span>
            <BettingStatusLine status={status} className="home-active-round-status" />
        </div>
    );
}

interface NavRowProps {
    icon: ElementType;
    title: string;
    subtitle?: string;
    onClick: () => void;
    accent?: "emerald" | "amber" | "sky" | "violet" | "slate";
    bettingStatus?: BettingWindowStatus | null;
}

function NavRow({ icon: Icon, title, subtitle, onClick, accent = "slate", bettingStatus }: NavRowProps) {
    return (
        <button type="button" onClick={onClick} className={cn("home-nav-row group", `home-nav-row--${accent}`)}>
            <ChevronLeft
                size={17}
                className="home-nav-row-chevron shrink-0"
                aria-hidden
            />
            <div className="home-nav-row-body">
                <span className="home-nav-row-title">{title}</span>
                {subtitle && <span className="home-nav-row-sub">{subtitle}</span>}
                {bettingStatus && (
                    <BettingStatusLine status={bettingStatus} className="home-nav-row-status" />
                )}
            </div>
            <div className="home-nav-row-icon" aria-hidden>
                <Icon size={19} strokeWidth={2} />
            </div>
        </button>
    );
}

export default function HomePage() {
    const { user, logout } = useAuth();
    const { activeSeasonId, previousSeasonIds } = useSeason();
    const navigate = useNavigate();
    const [activeRounds, setActiveRounds] = useState<ActiveRoundBetting[]>([]);
    const [sortedRounds, setSortedRounds] = useState<RoundSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalSeasonId, setModalSeasonId] = useState<string | null>(null);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [allPreviousSeasonIds, setAllPreviousSeasonIds] = useState<string[]>([]);
    const [preSeasonStatus, setPreSeasonStatus] = useState<BettingWindowStatus | null>(null);
    const activeRoundsRef = useRef<ActiveRoundBetting[]>([]);
    const preSeasonDeadlineRef = useRef<string | null>(null);
    const [statusTick, setStatusTick] = useState(0);

    const displayRounds = useMemo(
        () => getHomeDisplayRounds(activeRounds, sortedRounds),
        [activeRounds, sortedRounds]
    );

    const roundStatuses = useMemo(
        () =>
            displayRounds.map((round) =>
                getBettingWindowStatus(round.startTime, user?.uid, round.bettingExtensions)
            ),
        [displayRounds, user?.uid, statusTick]
    );

    const refreshBettingStatuses = () => {
        setStatusTick((tick) => tick + 1);
        const seasonDeadline = preSeasonDeadlineRef.current;
        if (seasonDeadline) {
            setPreSeasonStatus(getBettingWindowStatus(seasonDeadline));
        } else {
            setPreSeasonStatus(null);
        }
    };

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | undefined;
        const seasonPath = `season/${activeSeasonId}`;

        const init = async () => {
            setLoading(true);
            setPreSeasonStatus(null);
            try {
                if (user?.uid) {
                    await ensureServerTimeSynced(user.uid);
                }
                if (cancelled) return;

                const seasonData = await getCurrentSeasonData();
                if (cancelled) return;

                preSeasonDeadlineRef.current = parseSeasonStartField(seasonData?.seasonStart);
                const seasonDeadline = preSeasonDeadlineRef.current;
                setPreSeasonStatus(seasonDeadline ? getBettingWindowStatus(seasonDeadline) : null);
            } catch (error) {
                console.error('Error loading home round info:', error);
            }
        };

        const unsubscribe = subscribeToSeasonRounds(
            seasonPath,
            (rounds, allRounds) => {
                if (cancelled) return;
                setSortedRounds(rounds);
                const openRounds = getOpenRoundsFromAll(allRounds, user?.uid);
                activeRoundsRef.current = openRounds;
                setActiveRounds(openRounds);
                setLoading(false);
            },
            (error) => console.error('Error subscribing to rounds:', error)
        );

        init();
        timer = setInterval(refreshBettingStatuses, 60_000);

        return () => {
            cancelled = true;
            unsubscribe();
            if (timer) clearInterval(timer);
        };
    }, [activeSeasonId, user?.uid]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const all = await listSeasonIds();
                if (cancelled) return;
                setAllPreviousSeasonIds(all.filter((id) => id !== activeSeasonId));
            } catch (error) {
                console.error('Error loading season list:', error);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [activeSeasonId]);

    useEffect(() => {
        if (previousSeasonIds.length === 0) return;
        const mostRecent = previousSeasonIds[0];
        const dismissed = localStorage.getItem(getPreviousSeasonDismissKey(mostRecent));
        if (!dismissed) setModalSeasonId(mostRecent);
    }, [previousSeasonIds]);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const displayName = user?.displayName || user?.email?.split('@')[0] || 'שחקן';

    const roundCtaSubtitle = loading
        ? 'טוען...'
        : displayRounds.length === 0
            ? 'אין מחזור פתוח להימורים כרגע'
            : displayRounds.length === 1
                ? `ניחוש תוצאות ל${displayRounds[0].name}`
                : `נדרש להזין הימורים ל-${displayRounds.length} מחזורים עם סגירה קרובה`;

    return (
        <PageShell showThemeToggle={false} className="home-page">
            {modalSeasonId && (
                <PreviousSeasonTableModal
                    seasonId={modalSeasonId}
                    isOpen={!!modalSeasonId}
                    onClose={() => setModalSeasonId(null)}
                    excludeSeasonId={activeSeasonId}
                />
            )}

            {showArchiveModal && (
                <PreviousSeasonTableModal
                    isOpen={showArchiveModal}
                    onClose={() => setShowArchiveModal(false)}
                    excludeSeasonId={activeSeasonId}
                    availableSeasonIds={allPreviousSeasonIds}
                />
            )}

            <div className="home-layout">
                <header className="home-hero">
                    <div className="home-hero-logo-bg" aria-hidden>
                        <img src="/icons/officalIcon.png" alt="" />
                    </div>
                    <div className="home-hero-scrim" aria-hidden />
                    <div className="home-hero-glow" aria-hidden />

                    <div className="home-hero-toolbar">
                        <ThemeToggle className="home-hero-icon-btn" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="home-hero-icon-btn gap-1.5"
                        >
                            <LogOut size={16} />
                            <span className="hidden sm:inline">יציאה</span>
                        </Button>
                    </div>

                    <div className="home-hero-brand">
                        <p className="home-hero-eyebrow">ליגת העל · ניחושים</p>
                        <h1 className="home-hero-name">{displayName}</h1>
                    </div>

                    <div className="home-hero-meta">
                        <span className="home-hero-season">עונה {formatSeasonDisplay(activeSeasonId)}</span>
                        <button
                            type="button"
                            className="home-hero-archive"
                            onClick={() => setShowArchiveModal(true)}
                        >
                            <History size={14} aria-hidden />
                            <span>ארכיון</span>
                        </button>
                    </div>
                </header>

                <main className="home-main home-main--overlap">
                    <section className="home-section" aria-label="הימורים">
                        <h2 className="home-section-title">הימורים</h2>

                        <button
                            type="button"
                            className="home-primary-cta group"
                            onClick={() => navigate('/round-bets')}
                        >
                            <ChevronLeft size={18} className="home-primary-cta-chevron" aria-hidden />
                            <div className="home-primary-cta-body">
                                <span className="home-primary-cta-title">הימורי מחזור</span>
                                <span className="home-primary-cta-sub">{roundCtaSubtitle}</span>
                                {!loading && displayRounds.length > 0 && (
                                    <div
                                        className={cn(
                                            "home-primary-cta-rounds",
                                            displayRounds.length > 1 && "home-primary-cta-rounds--split"
                                        )}
                                    >
                                        {displayRounds.map((round, index) => (
                                            <ActiveRoundStatusRow
                                                key={round.number}
                                                round={round}
                                                status={roundStatuses[index]}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="home-primary-cta-icon" aria-hidden>
                                <Target size={22} strokeWidth={2} />
                            </div>
                        </button>

                        <div className="home-nav-group">
                            <NavRow
                                icon={Trophy}
                                title="הימורים מקדימים"
                                subtitle="אלופה, גביע ויורדות"
                                onClick={() => navigate('/pre-season-bets')}
                                accent="amber"
                                bettingStatus={preSeasonStatus}
                            />
                        </div>
                    </section>

                    <section className="home-section" aria-label="לוח תוצאות">
                        <h2 className="home-section-title">לוח תוצאות</h2>

                        <div className="home-nav-group">
                            <NavRow
                                icon={Users}
                                title="הימורי כל המשתמשים"
                                subtitle="צפייה בהימורים למחזור"
                                onClick={() => navigate('/all-users-bets')}
                                accent="sky"
                            />
                            <NavRow
                                icon={BarChart3}
                                title="טבלת מיקומים"
                                subtitle="דירוג ונקודות"
                                onClick={() => navigate('/leaderboard')}
                                accent="violet"
                            />
                            {user?.role === 'admin' && (
                                <NavRow
                                    icon={Settings}
                                    title="ניהול מערכת"
                                    subtitle="מחזורים, משחקים ותוצאות"
                                    onClick={() => navigate('/admin')}
                                    accent="slate"
                                />
                            )}
                        </div>
                    </section>
                </main>
            </div>
        </PageShell>
    );
}
