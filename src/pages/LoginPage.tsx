import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/layout/LoadingScreen";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { Trophy } from "lucide-react";

export default function LoginPage() {
    const { signInWithGoogle, user, loading } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && user) {
            navigate('/', { replace: true });
        }
    }, [user, loading, navigate]);

    const handleSignIn = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await signInWithGoogle();
        } catch (err) {
            console.error('Sign in error:', err);
            setError('שגיאה בהתחברות. אנא נסה שוב.');
        } finally {
            setIsLoading(false);
        }
    };

    if (loading) return <LoadingScreen />;
    if (user) return null;

    return (
        <div dir="rtl" className="app-shell relative flex items-center justify-center px-4 safe-bottom">
            <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
                <ThemeToggle />
            </div>
            <div className="w-full max-w-sm">
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-400/25 via-amber-500/20 to-yellow-600/15 shadow-[var(--glow-gold)] dark:border-amber-400/30 dark:from-amber-500/20 dark:via-amber-600/15 dark:to-yellow-700/10">
                        <Trophy className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">ניחושים ליגת העל</h1>
                    <p className="mt-1 text-sm text-muted-foreground">מערכת הימורים פרטית</p>
                </div>

                <div className="app-card space-y-4 p-5">
                    <p className="text-center text-sm text-muted-foreground">
                        התחבר כדי להמר על משחקי הכדורגל ולהתחרות עם החברים
                    </p>

                    {error && (
                        <div className="status-banner status-closed px-3 py-2 text-center text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    <Button onClick={handleSignIn} disabled={isLoading} className="w-full h-11">
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                                מתחבר...
                            </span>
                        ) : (
                            'התחבר עם Google'
                        )}
                    </Button>

                    <div className="grid grid-cols-1 gap-1.5 text-center text-[11px] text-muted-foreground">
                        <p>תוצאות מדויקות וכיוון נכון</p>
                        <p>בונוס על הימורים ייחודיים</p>
                        <p>טבלת מיקומים בזמן אמת</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
