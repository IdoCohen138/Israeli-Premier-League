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

interface HomeActionCardProps {
    icon: ElementType;
    title: string;
    onClick: () => void;
    accent: "emerald" | "amber" | "sky" | "violet" | "slate";
    bettingStatus?: BettingWindowStatus | null;
    featured?: boolean;
    children?: React.ReactNode;
}

function HomeActionCard({
    icon: Icon,
    title,
    onClick,
    accent,
    bettingStatus,
    featured,
    children,
}: HomeActionCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "home-action-card group",
                `home-action-card--${accent}`,
                featured && "home-action-card--featured"
            )}
        >
            <div className="home-action-card-icon-strip" aria-hidden>
                <Icon size={featured ? 22 : 20} strokeWidth={2.25} />
            </div>
            <div className="home-action-card-body">
                <span className="home-action-card-title">{title}</span>
                {children}
                {bettingStatus && (
                    <BettingStatusLine status={bettingStatus} className="home-action-card-status" />
                )}
            </div>
            <ChevronLeft
                size={16}
                strokeWidth={2.5}
                className="home-action-card-chevron shrink-0"
                aria-hidden
            />
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
    const avatarInitial = displayName.trim().charAt(0).toUpperCase();

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
                    <div className="home-hero-mesh" aria-hidden />
                    <div className="home-hero-logo-bg" aria-hidden>
                        <img src="/icons/officalIcon.png" alt="" />
                    </div>

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
                        <div className="home-hero-avatar" aria-hidden>
                            {avatarInitial}
                        </div>
                        <div className="home-hero-text">
                            <p className="home-hero-eyebrow">שלום,</p>
                            <h1 className="home-hero-name">{displayName}</h1>
                        </div>
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

                        <div className="home-card-stack">
                            <HomeActionCard
                                icon={Target}
                                title="הימורי מחזור"
                                onClick={() => navigate('/round-bets')}
                                accent="emerald"
                                featured
                            >
                                {loading ? (
                                    <span className="home-action-card-hint">טוען מחזורים...</span>
                                ) : displayRounds.length === 0 ? (
                                    <span className="home-action-card-hint">אין מחזור פתוח כרגע</span>
                                ) : (
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
                            </HomeActionCard>

                            <HomeActionCard
                                icon={Trophy}
                                title="הימורים מקדימים"
                                onClick={() => navigate('/pre-season-bets')}
                                accent="amber"
                                bettingStatus={preSeasonStatus}
                            />
                        </div>
                    </section>

                    <section className="home-section" aria-label="לוח תוצאות">
                        <h2 className="home-section-title">לוח תוצאות</h2>

                        <div className="home-card-stack">
                            <HomeActionCard
                                icon={Users}
                                title="הימורי כל המשתמשים"
                                onClick={() => navigate('/all-users-bets')}
                                accent="sky"
                            />
                            <HomeActionCard
                                icon={BarChart3}
                                title="טבלת מיקומים"
                                onClick={() => navigate('/leaderboard')}
                                accent="violet"
                            />
                            {user?.role === 'admin' && (
                                <HomeActionCard
                                    icon={Settings}
                                    title="ניהול מערכת"
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
