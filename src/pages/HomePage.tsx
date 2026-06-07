import { useState, useEffect, type ElementType } from "react";
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
    CalendarDays,
    ChevronLeft,
    BarChart3,
    Sparkles,
} from "lucide-react";
import { formatSeasonDisplay, getHomeRoundInfo, listSeasonIds } from "@/lib/season";
import PreviousSeasonTableModal, { getPreviousSeasonDismissKey } from "@/components/PreviousSeasonTableModal";
import PageShell from "@/components/layout/PageShell";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

interface ActionCardProps {
    icon: ElementType;
    title: string;
    subtitle: string;
    onClick: () => void;
    variant?: "primary" | "gold" | "default";
    featured?: boolean;
}

function ActionCard({ icon: Icon, title, subtitle, onClick, variant = "default", featured }: ActionCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "home-action-card group text-right",
                variant === "primary" && "home-action-card--primary",
                variant === "gold" && "home-action-card--gold",
                featured && "home-action-card--featured sm:col-span-2"
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <ChevronLeft size={16} className="mt-1 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-x-0.5" />
                <div className="min-w-0 flex-1">
                    <div className="home-action-icon">
                        <Icon size={featured ? 22 : 18} />
                    </div>
                    <h3 className="home-action-title">{title}</h3>
                    <p className="home-action-subtitle">{subtitle}</p>
                </div>
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
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            try {
                const info = await getHomeRoundInfo(activeSeasonId);
                if (cancelled) return;
                setCurrentRoundNumber(info.currentRoundNumber);
                setCurrentRoundName(info.currentRoundName);
                setNextRoundTime(info.nextRoundTime);
            } catch (error) {
                console.error('Error loading home round info:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [activeSeasonId]);

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
                {/* Header */}
                <header className="home-header">
                    <div className="home-header-top">
                        <ThemeToggle className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="home-header-btn gap-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                        >
                            <LogOut size={15} />
                            <span className="hidden sm:inline">יציאה</span>
                        </Button>
                    </div>

                    <div className="home-header-brand">
                        <div className="home-header-logo">
                            <Trophy size={20} />
                        </div>
                        <div>
                            <p className="home-header-league">ניחושים · ליגת העל</p>
                            <h1 className="home-header-user">{displayName}</h1>
                        </div>
                    </div>

                    <div className="home-header-meta">
                        <span className="home-header-season">עונה {formatSeasonDisplay(activeSeasonId)}</span>
                    </div>
                </header>

                {/* Live status strip */}
                <section className="home-status-strip" aria-label="סטטוס מחזור">
                    <div className="home-status-item home-status-item--highlight">
                        <CalendarDays size={15} className="shrink-0 opacity-70" />
                        <div className="min-w-0">
                            <p className="home-status-label">מחזור נוכחי</p>
                            <p className="home-status-value">{roundDisplay}</p>
                        </div>
                    </div>
                    {nextRoundTime && (
                        <div className="home-status-item">
                            <Sparkles size={15} className="shrink-0 opacity-70" />
                            <div className="min-w-0">
                                <p className="home-status-label">מחזור הבא</p>
                                <p className="home-status-value-sm">{nextRoundTime}</p>
                            </div>
                        </div>
                    )}
                </section>

                {/* Primary actions */}
                <section aria-label="פעולות עיקריות">
                    <p className="home-section-label">הימורים</p>
                    <div className="home-actions-grid">
                        <ActionCard
                            icon={Target}
                            title="הימורי מחזור"
                            subtitle="ניחוש תוצאות מדויקות"
                            onClick={() => navigate('/round-bets')}
                            variant="primary"
                            featured
                        />
                        <ActionCard
                            icon={Trophy}
                            title="הימורים מקדימים"
                            subtitle="אלופה, גביע, יורדות ומלכי השערים"
                            onClick={() => navigate('/pre-season-bets')}
                            variant="gold"
                            featured
                        />
                    </div>
                </section>

                {/* Secondary actions */}
                <section aria-label="מידע וסטטיסטיקה">
                    <p className="home-section-label">לוח תוצאות</p>
                    <div className="home-actions-grid home-actions-grid--secondary">
                        <ActionCard
                            icon={BarChart3}
                            title="טבלת מיקומים"
                            subtitle="דירוג ונקודות"
                            onClick={() => navigate('/leaderboard')}
                        />
                        <ActionCard
                            icon={Users}
                            title="הימורי משתמשים"
                            subtitle="צפייה בהימורי המשתמשים למחזור/הימורים מקדימים"
                            onClick={() => navigate('/all-users-bets')}
                        />
                        <ActionCard
                            icon={History}
                            title="ארכיון עונות"
                            subtitle={
                                allPreviousSeasonIds.length > 0
                                    ? `${allPreviousSeasonIds.length} עונות קודמות`
                                    : 'אין עדיין ארכיון'
                            }
                            onClick={() => setShowArchiveModal(true)}
                        />
                        {user?.role === 'admin' && (
                            <ActionCard
                                icon={Settings}
                                title="ניהול מערכת"
                                subtitle="מחזורים, משחקים ותוצאות"
                                onClick={() => navigate('/admin')}
                            />
                        )}
                    </div>
                </section>
            </div>
        </PageShell>
    );
}
