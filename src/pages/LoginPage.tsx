import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
    const { signInWithGoogle, user, loading } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // אם המשתמש מחובר, העבר אותו לדף הבית
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

    // אם עדיין טוען, הצג מסך טעינה
    if (loading) {
        return (
            <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">טוען...</p>
                </div>
            </div>
        );
    }

    // אם המשתמש מחובר, אל תציג כלום (הוא יועבר אוטומטית)
    if (user) {
        return null;
    }

    return (
        <div dir="rtl" className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm sm:max-w-md bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardContent className="p-6 sm:p-8 text-center space-y-4 sm:space-y-6">
                    <div className="space-y-2">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">ליגת העל הישראלית</h1>
                        <p className="text-sm text-gray-600">מערכת הימורים</p>
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            התחבר כדי להתחיל להמר על משחקי הכדורגל
                        </p>
                        
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}
                        
                        <Button 
                            onClick={() => {
                                handleSignIn();
                            }}
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 touch-target"
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    מתחבר...
                                </div>
                            ) : (
                                'התחבר עם Google'
                            )}
                        </Button>
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                        <p>• הימור על תוצאות מדויקות</p>
                        <p>• תחרות עם חברים</p>
                        <p>• נקודות בונוס על הימורים ייחודיים</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
} 