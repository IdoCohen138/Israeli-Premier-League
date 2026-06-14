import { useState, useEffect, useRef, type ElementType } from "react";
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
    CalendarClock,
} from "lucide-react";
import { formatSeasonDisplay, getHomeRoundInfo, listSeasonIds, getCurrentSeasonData, parseSeasonStartField } from "@/lib/season";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    ensureServerTimeSynced,
    getBettingWindowStatus,
    formatBettingStatusLine,
    type BettingWindowStatus,
} from "@/lib/serverTime";
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
                {bettingStatus?.isOpen && (
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
    const [currentRoundName, setCurrentRoundName] = useState('');
    const [currentRoundNumber, setCurrentRoundNumber] = useState<number | null>(null);
    const [nextRoundTime, setNextRoundTime] = useState('');
    const [loading, setLoading] = useState(true);
    const [modalSeasonId, setModalSeasonId] = useState<string | null>(null);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [allPreviousSeasonIds, setAllPreviousSeasonIds] = useState<string[]>([]);
    const [roundStatus, setRoundStatus] = useState<BettingWindowStatus | null>(null);
    const [preSeasonStatus, setPreSeasonStatus] = useState<BettingWindowStatus | null>(null);
    const roundBettingSourceRef = useRef<{
        deadline: string | null;
        extensions?: Record<string, string>;
    } | null>(null);
    const preSeasonDeadlineRef = useRef<string | null>(null);

    const refreshBettingStatuses = () => {
        const roundSource = roundBettingSourceRef.current;
        if (roundSource) {
            setRoundStatus(
                getBettingWindowStatus(roundSource.deadline, user?.uid, roundSource.extensions)
            );
        }
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

        const load = async () => {
            setLoading(true);
            setRoundStatus(null);
            setPreSeasonStatus(null);
            try {
                if (user?.uid) {
                    await ensureServerTimeSynced(user.uid);
                }
                if (cancelled) return;

                const info = await getHomeRoundInfo(activeSeasonId);
                if (cancelled) return;

                setCurrentRoundNumber(info.currentRoundNumber);
                setCurrentRoundName(info.currentRoundName);
                setNextRoundTime(info.nextRoundTime);

                if (info.currentRoundNumber) {
                    const roundDoc = await getDoc(
                        doc(db, 'season', activeSeasonId, 'rounds', String(info.currentRoundNumber))
                    );
                    const data = roundDoc.data();
                    roundBettingSourceRef.current = {
                        deadline: data?.startTime || null,
                        extensions: data?.bettingExtensions,
                    };
                } else {
                    roundBettingSourceRef.current = null;
                }

                const seasonData = await getCurrentSeasonData();
                if (cancelled) return;

                preSeasonDeadlineRef.current = parseSeasonStartField(seasonData?.seasonStart);

                if (info.currentRoundNumber && roundBettingSourceRef.current) {
                    setRoundStatus(
                        getBettingWindowStatus(
                            roundBettingSourceRef.current.deadline,
                            user?.uid,
                            roundBettingSourceRef.current.extensions
                        )
                    );
                }

                const seasonDeadline = preSeasonDeadlineRef.current;
                setPreSeasonStatus(seasonDeadline ? getBettingWindowStatus(seasonDeadline) : null);

                timer = setInterval(refreshBettingStatuses, 60_000);
            } catch (error) {
                console.error('Error loading home round info:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
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
    const roundDisplay = loading ? '…' : (currentRoundName || (currentRoundNumber ? `מחזור ${currentRoundNumber}` : '—'));

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

                <div className="home-hero-overlap">
                    <section className="home-round-card" aria-label="סטטוס מחזור">
                        <div className="home-round-card-top">
                            <span className="home-round-card-label">מחזור נוכחי</span>
                            <span className="home-live-badge">
                                <span className="home-live-dot" aria-hidden />
                                LIVE
                            </span>
                        </div>
                        <div className="home-round-card-bottom">
                            <p className="home-round-card-name">{roundDisplay}</p>
                            {!loading && roundStatus && (
                                <BettingStatusLine status={roundStatus} className="home-round-card-status" />
                            )}
                        </div>
                        {nextRoundTime && (
                            <div className="home-round-card-next">
                                <CalendarClock size={13} className="shrink-0 opacity-60" aria-hidden />
                                <span className="home-round-card-next-label">מחזור הבא</span>
                                <span className="home-round-card-next-value">{nextRoundTime}</span>
                            </div>
                        )}
                    </section>
                </div>

                <main className="home-main">
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
                                <span className="home-primary-cta-sub">ניחוש תוצאות למחזור הנוכחי</span>
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
