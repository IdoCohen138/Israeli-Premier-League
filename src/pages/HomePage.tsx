import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Trophy, Target, Users, Settings, LogOut } from "lucide-react";
import { getCurrentRound, getSeasonPath } from "@/lib/season";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function HomePage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [currentRoundNumber, setCurrentRoundNumber] = useState<number | null>(null);
    const [nextRoundTime, setNextRoundTime] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCurrentRound();
    }, []);

    const loadCurrentRound = async () => {
        try {
            const round = await getCurrentRound();
            setCurrentRoundNumber(round);
            
            // טעינת זמן המחזור הבא
            if (round) {
                await loadNextRoundTime(round);
            }
        } catch (error) {
            console.error('Error loading current round:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadNextRoundTime = async (currentRound: number) => {
        try {
            const seasonPath = getSeasonPath();
            const roundsSnapshot = await getDocs(collection(db, seasonPath, 'rounds'));
            
            const rounds = roundsSnapshot.docs
                .map(doc => ({
                    number: parseInt(doc.id),
                    startTime: doc.data().startTime || ''
                }))
                .sort((a, b) => a.number - b.number);
            
            const nextRound = rounds.find(r => r.number === currentRound + 1);
            if (nextRound && nextRound.startTime) {
                const nextRoundDate = new Date(nextRound.startTime);
                setNextRoundTime(nextRoundDate.toLocaleString('he-IL'));
            } else {
                setNextRoundTime('');
            }
        } catch (error) {
            console.error('Error loading next round time:', error);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div dir="rtl" className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-6 max-w-4xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                    <div className="text-center sm:text-right">
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ברוכים הבאים</h1>
                        <p className="text-sm text-gray-600">
                            שלום {user?.displayName || user?.email}
                        </p>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full sm:w-auto"
                    >
                        <LogOut size={16} />
                        התנתק
                    </Button>
                </div>

                {/* Main Menu */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {/* Pre-Season Bets */}
                    <Card className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer touch-target"
                          onClick={() => navigate('/pre-season-bets')}>
                        <CardContent className="p-4 sm:p-6 text-center space-y-3">
                            <Trophy className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-yellow-500" />
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900">הימורים מקדימים</h3>
                            <p className="text-xs sm:text-sm text-gray-600">
                                הימור על אלופה, גביע, יורדות ומלכי השערים
                            </p>
                        </CardContent>
                    </Card>

                    {/* Round Bets */}
                    <Card className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer touch-target"
                          onClick={() => navigate('/round-bets')}>
                        <CardContent className="p-4 sm:p-6 text-center space-y-3">
                            <Target className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-blue-500" />
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900">הימורי מחזור</h3>
                            <p className="text-xs sm:text-sm text-gray-600">
                                הימור על תוצאות מדויקות במחזור הנוכחי
                            </p>
                        </CardContent>
                    </Card>

                    {/* Leaderboard */}
                    <Card className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer touch-target"
                          onClick={() => navigate('/leaderboard')}>
                        <CardContent className="p-4 sm:p-6 text-center space-y-3">
                            <Users className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-green-500" />
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900">טבלת מיקומים</h3>
                            <p className="text-xs sm:text-sm text-gray-600">
                                צפה בדירוג השחקנים והנקודות שלך
                            </p>
                        </CardContent>
                    </Card>

                    {/* All Users Bets */}
                    <Card className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer touch-target"
                          onClick={() => navigate('/all-users-bets')}>
                        <CardContent className="p-4 sm:p-6 text-center space-y-3">
                            <Users className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-pink-500" />
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900">הימורי כל המשתמשים</h3>
                            <p className="text-xs sm:text-sm text-gray-600">
                                צפייה בהימורים של כל המשתמשים לכל מחזור
                            </p>
                        </CardContent>
                    </Card>

                    {/* Admin Panel */}
                    {user?.role === 'admin' && (
                        <Card className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer touch-target"
                              onClick={() => navigate('/admin')}>
                            <CardContent className="p-4 sm:p-6 text-center space-y-3">
                                <Settings className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-purple-500" />
                                <h3 className="text-base sm:text-lg font-semibold text-gray-900">ניהול מערכת</h3>
                                <p className="text-xs sm:text-sm text-gray-600">
                                    ניהול משחקים, מחזורים ומשתמשים
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-xs sm:text-sm text-gray-600">מחזור נוכחי</p>
                            <p className="text-xl sm:text-2xl font-bold text-blue-600">
                                {loading ? '...' : (currentRoundNumber || 'אין')}
                            </p>
                        </CardContent>
                    </Card>
                    
                    {nextRoundTime && (
                        <Card className="bg-white rounded-xl shadow-sm">
                            <CardContent className="p-4 text-center space-y-2">
                                <p className="text-xs sm:text-sm text-gray-600">מחזור הבא מתחיל</p>
                                <p className="text-sm font-semibold text-green-600">
                                    {nextRoundTime}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
} 