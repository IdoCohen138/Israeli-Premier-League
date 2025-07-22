import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Trophy, Medal, Award, TrendingUp, Users } from "lucide-react";
import { PlayerBets } from "@/types";
import { getLeaderboard } from "@/lib/playerBets";
import { getCurrentSeason, getCurrentSeasonData } from "@/lib/season";

export default function LeaderboardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [leaderboard, setLeaderboard] = useState<PlayerBets[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userRank, setUserRank] = useState<number | null>(null);
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [showPreSeasonColumn, setShowPreSeasonColumn] = useState(false);

    useEffect(() => {
        setCurrentSeason(getCurrentSeason());
        loadLeaderboard();
        checkPreSeasonPointsCalculated();
    }, []);

    const loadLeaderboard = async () => {
        try {
            // טעינת טבלת מיקומים מהמערכת החדשה
            const leaderboardData = await getLeaderboard();
            setLeaderboard(leaderboardData);

            // מציאת המיקום של המשתמש הנוכחי
            if (user) {
                const userEntry = leaderboardData.find(entry => entry.uid === user.uid);
                if (userEntry) {
                    const rank = leaderboardData.findIndex(entry => entry.uid === user.uid) + 1;
                    setUserRank(rank);
                }
            }
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            setError('שגיאה בטעינת טבלת המיקומים. אנא נסה שוב.');
        } finally {
            setLoading(false);
        }
    };

    const checkPreSeasonPointsCalculated = async () => {
        const seasonData = await getCurrentSeasonData();
        if (
            seasonData &&
            seasonData.champion &&
            seasonData.cupWinner &&
            seasonData.topScorer &&
            seasonData.topAssists &&
            seasonData.relegation1 &&
            seasonData.relegation2
        ) {
            setShowPreSeasonColumn(true);
        } else {
            setShowPreSeasonColumn(false);
        }
    };

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1:
                return <Trophy className="h-5 w-5 text-yellow-500" />;
            case 2:
                return <Medal className="h-5 w-5 text-gray-400" />;
            case 3:
                return <Award className="h-5 w-5 text-amber-600" />;
            default:
                return <span className="text-sm font-medium text-gray-500">#{rank}</span>;
        }
    };

    const getRankColor = (rank: number) => {
        switch (rank) {
            case 1:
                return 'bg-yellow-50 border-yellow-200';
            case 2:
                return 'bg-gray-50 border-gray-200';
            case 3:
                return 'bg-amber-50 border-amber-200';
            default:
                return 'bg-white';
        }
    };


    if (loading) {
        return (
            <div dir="rtl" className="p-4 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">טוען טבלת מיקומים...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div dir="rtl" className="p-4 min-h-screen bg-gray-50">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <p className="text-red-700">{error}</p>
                    </div>
                    <Button onClick={() => window.location.reload()}>נסה שוב</Button>
                </div>
            </div>
        );
    }

    return (
        <div dir="rtl" className="p-4 min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900">טבלת מיקומים</h1>
                        <p className="text-sm text-gray-600">דירוג השחקנים לפי נקודות - עונה {currentSeason}</p>
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2"
                    >
                        <ArrowRight size={16} />
                        חזרה לדף הבית
                    </Button>
                </div>

                {/* User Rank Card */}
                {userRank && (
                    <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {getRankIcon(userRank)}
                                    <div>
                                        <h3 className="font-semibold text-blue-900">המיקום שלך</h3>
                                        <p className="text-sm text-blue-700">מקום {userRank} מתוך {leaderboard.length}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-blue-900">
                                        {leaderboard.find(entry => entry.uid === user?.uid)?.totalPoints || 0} נקודות
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <Users className="h-8 w-8 text-blue-500" />
                                <div>
                                    <p className="text-sm text-gray-600">משתתפים</p>
                                    <p className="text-xl font-bold text-gray-900">{leaderboard.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <TrendingUp className="h-8 w-8 text-green-500" />
                                <div>
                                    <p className="text-sm text-gray-600">המוביל</p>
                                    <p className="text-lg font-bold text-gray-900">
                                        {leaderboard[0]?.displayName || 'טרם נקבע'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <Trophy className="h-8 w-8 text-yellow-500" />
                                <div>
                                    <p className="text-sm text-gray-600">נקודות מקסימום</p>
                                    <p className="text-xl font-bold text-gray-900">
                                        {leaderboard[0]?.totalPoints || 0}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Leaderboard Table */}
                <Card className="bg-white rounded-xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-5 w-5" />
                            דירוג שחקנים
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-right py-3 px-4 font-semibold">מיקום</th>
                                        <th className="text-right py-3 px-4 font-semibold">שחקן</th>
                                        <th className="text-right py-3 px-4 font-semibold">סה"כ נקודות</th>
                                        {showPreSeasonColumn && (
                                            <th className="text-right py-3 px-4 font-semibold">הימורים מקדימים</th>
                                        )}
                                        <th className="text-right py-3 px-4 font-semibold">ניקוד מחזור נוכחי</th>
                                        <th className="text-right py-3 px-4 font-semibold">תחזיות נכונות</th>
                                        <th className="text-right py-3 px-4 font-semibold">תחזיות מדויקות</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboard.map((entry, index) => (
                                        <tr 
                                            key={entry.uid} 
                                            className={`border-b hover:bg-gray-50 ${getRankColor(index + 1)}`}
                                        >
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    {getRankIcon(index + 1)}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div>
                                                    <p className="font-medium">{entry.displayName || 'שחקן אנונימי'}</p>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-bold text-lg">{entry.totalPoints || 0}</span>
                                            </td>
                                            {showPreSeasonColumn && (
                                                <td className="py-3 px-4">
                                                    <span className="text-green-600 font-medium">
                                                        {entry.preSeasonPoints || 0}
                                                    </span>
                                                    {entry.preSeasonPoints > 0 && (
                                                        <div className="text-xs text-green-500 mt-1">✓ הימורים מקדימים</div>
                                                    )}
                                                </td>
                                            )}
                                            <td className="py-3 px-4">
                                                <span className="text-blue-600 font-medium">
                                                    {(() => {
                                                        const roundNumbers = Object.keys(entry.roundPoints || {}).map(Number);
                                                        if (roundNumbers.length === 0) return 0;
                                                        const maxRound = Math.max(...roundNumbers);
                                                        return entry.roundPoints?.[maxRound] ?? 0;
                                                    })()}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-gray-600">{entry.correctPredictions || 0}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-purple-600 font-medium">{entry.exactPredictions || 0}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Info Card */}
                <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-green-900 mb-2">איך מחושבות הנקודות?</h3>
                        <ul className="text-sm text-green-800 space-y-1">
                            <li>• הימורים מקדימים: יחושב בסוף העונה ונקודות יתווספו אוטמטית לטבלה</li>
                            <li>• הימורי מחזור: 1 נקודה לכיוון נכון, 3 נקודות לתוצאה מדויקת</li>
                            <li>• בונוס כפול אם רק אתה צדקת במשחק</li>
                            <li>• הטבלה מתעדכנת בסוף כל מחזור ובסוף העונה</li>
                        </ul>
                    </CardContent>
                </Card>

                {/* 2. הוסף טבלת נקודות לפי מחזור למטה */}
                {leaderboard.length > 0 && (
                    <Card className="bg-white rounded-xl shadow-sm mt-8">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" />
                                נקודות לפי מחזור
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                                                    <thead>
                                    <tr className="border-b">
                                        <th className="text-right py-3 px-4 font-semibold text-center w-20">מחזור</th>
                                        {leaderboard.map(entry => (
                                            <th key={entry.uid} className="text-center py-3 px-2 font-semibold text-xs min-w-0">
                                                <div className="truncate" title={entry.displayName || 'שחקן אנונימי'}>
                                                    {entry.displayName || 'שחקן אנונימי'}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                    <tbody>
                                        {(() => {
                                            // מצא את כל המחזורים שהופיעו אצל כל המשתמשים
                                            const allRounds = leaderboard.flatMap(entry => Object.keys(entry.roundPoints || {}).map(Number));
                                            const maxRound = allRounds.length > 0 ? Math.max(...allRounds) : 0;
                                            return Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => (
                                                <tr key={round} className={round % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                                                    <td className="py-3 px-4 font-bold text-blue-900 text-center w-20">מחזור {round}</td>
                                                    {leaderboard.map(entry => (
                                                        <td key={entry.uid} className="py-3 px-2 text-center font-medium text-blue-700 min-w-0">
                                                            {(entry.roundPoints && entry.roundPoints[round]) !== undefined ? entry.roundPoints[round] : 0}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ));
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

            </div>
        </div>
    );
} 