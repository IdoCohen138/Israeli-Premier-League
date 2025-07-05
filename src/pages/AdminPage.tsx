import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Edit, Trash2, Calendar, Clock, Users, Settings, Trophy, Target, X } from "lucide-react";
import { Match, Round, Team, User, Player } from "@/types";
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getCurrentSeason } from "@/lib/season";
import { calculateRoundPoints, calculatePreSeasonPoints, deleteRoundPoints, recalculatePlayerPoints } from "@/lib/playerBets";
import TeamLogo from "@/components/TeamLogo";

export default function AdminPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rounds, setRounds] = useState<Round[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'rounds' | 'matches' | 'results' | 'season' | 'users'>('rounds');
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [editingRound, setEditingRound] = useState<number | null>(null);
    const [roundEditData, setRoundEditData] = useState({
        startTime: ''
    });
    const [editingResults, setEditingResults] = useState<number | null>(null);
    const [seasonEndDate, setSeasonEndDate] = useState('');
    const [seasonResults, setSeasonResults] = useState({
        champion: '',
        relegation1: '',
        relegation2: '',
        topScorer: '',
        topAssists: ''
    });
    const [players, setPlayers] = useState<Player[]>([]);
    const [playerSearchTerm, setPlayerSearchTerm] = useState('');
    const [assistSearchTerm, setAssistSearchTerm] = useState('');
    
    // State חדש לניהול חלון הוספת משחקים
    const [showAddMatchesModal, setShowAddMatchesModal] = useState(false);
    const [newRoundNumber, setNewRoundNumber] = useState<number>(0);
    const [newMatches, setNewMatches] = useState<Omit<Match, 'uid' | 'round'>[]>([]);
    const [editingMatches, setEditingMatches] = useState<number | null>(null);

    useEffect(() => {
        if (user?.role !== 'admin') {
            navigate('/');
            return;
        }
        setCurrentSeason(getCurrentSeason());
        loadData();
    }, [user, navigate]);

    const loadData = async () => {
        try {
            const seasonPath = getCurrentSeason();
            
            // טעינת מחזורים
            const roundsSnapshot = await getDocs(collection(db, 'season', seasonPath, 'rounds'));
            const roundsData = roundsSnapshot.docs.map(doc => ({ 
                number: parseInt(doc.id), 
                matches: doc.data().matches || [],
                ...doc.data() 
            } as Round));
            
            // טעינת משחקים מכל מחזור
            const roundsWithMatches = await Promise.all(
                roundsData.map(async (round) => {
                    try {
                        const matchesSnapshot = await getDocs(collection(db, 'season', seasonPath, 'rounds', round.number.toString(), 'matches'));
                        const matchesData = matchesSnapshot.docs.map(doc => ({ 
                            uid: doc.id,
                            ...doc.data() 
                        } as Match));
                        
                        return {
                            ...round,
                            matchesDetails: matchesData
                        };
                    } catch (error) {
                        console.error(`Error loading matches for round ${round.number}:`, error);
                        return {
                            ...round,
                            matchesDetails: []
                        };
                    }
                })
            );
            
            setRounds(roundsWithMatches.sort((a, b) => a.number - b.number));

            // טעינת קבוצות
            const teamsSnapshot = await getDocs(collection(db, 'season', seasonPath, 'teams'));
            const teamsData = teamsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Team));
            setTeams(teamsData);

            // טעינת משתמשים
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const usersData = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
            setUsers(usersData);

            // טעינת שחקנים
            const playersSnapshot = await getDocs(collection(db, 'season', seasonPath, 'players'));
            const playersData = playersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Player));
            setPlayers(playersData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddRound = async () => {
        const roundNumber = rounds.length + 1;
        setNewRoundNumber(roundNumber);
        setNewMatches([]);
        setShowAddMatchesModal(true);
    };

    const handleSaveRoundWithMatches = async () => {
        if (newMatches.length === 0) {
            alert('עליך להוסיף לפחות משחק אחד למחזור');
            return;
        }

        try {
            // יצירת המחזור
            const newRound: Round = {
                number: newRoundNumber,
                matches: [],
                startTime: new Date().toISOString().slice(0, 16),
                isActive: false,
            };

            await setDoc(doc(db, 'season', currentSeason, 'rounds', newRoundNumber.toString()), newRound);

            // הוספת המשחקים
            const matchIds: string[] = [];
            for (const matchData of newMatches) {
                const matchId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                const newMatch: Match = {
                    uid: matchId,
                    round: newRoundNumber,
                    ...matchData
                };

                await setDoc(doc(db, 'season', currentSeason, 'rounds', newRoundNumber.toString(), 'matches', matchId), newMatch);
                matchIds.push(matchId);
            }

            // עדכון המחזור עם רשימת המשחקים
            await updateDoc(doc(db, 'season', currentSeason, 'rounds', newRoundNumber.toString()), {
                matches: matchIds
            });

            // סגירת החלון ורענון הנתונים
            setShowAddMatchesModal(false);
            setNewMatches([]);
            setNewRoundNumber(0);
            await loadData();

            alert('המחזור והמשחקים נוצרו בהצלחה!');
        } catch (error) {
            console.error('Error creating round with matches:', error);
            alert('שגיאה ביצירת המחזור. אנא נסה שוב.');
        }
    };

    const handleAddNewMatch = () => {
        const newMatch: Omit<Match, 'uid' | 'round'> = {
            homeTeam: '',
            homeTeamId: '',
            awayTeam: '',
            awayTeamId: '',
            date: new Date().toISOString().split('T')[0],
            startTime: '20:00',
        };
        setNewMatches(prev => [...prev, newMatch]);
    };

    const handleRemoveNewMatch = (index: number) => {
        setNewMatches(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateNewMatch = (index: number, field: keyof Omit<Match, 'uid' | 'round'>, value: string) => {
        setNewMatches(prev => prev.map((match, i) => 
            i === index ? { ...match, [field]: value } : match
        ));
    };

    const handleDeleteRound = async (roundNumber: number) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק מחזור זה? זה ימחק גם את כל ההימורים והנקודות של המשתמשים במחזור זה.')) return;

        try {
            // מחיקת הנקודות של המשתמשים במחזור זה
            await deleteRoundPoints(roundNumber);
            
            // מחיקת המחזור
            await deleteDoc(doc(db, 'season', currentSeason, 'rounds', roundNumber.toString()));
            setRounds(prev => prev.filter(round => round.number !== roundNumber));
            
            alert('המחזור נמחק בהצלחה! כל ההימורים והנקודות של המשתמשים במחזור זה נמחקו.');
        } catch (error) {
            console.error('Error deleting round:', error);
            alert('שגיאה במחיקת המחזור. אנא נסה שוב.');
        }
    };

    const handleAddMatch = async (roundNumber: number) => {
        const newMatch: Match = {
            uid: Date.now().toString(),
            homeTeam: '',
            homeTeamId: '',
            awayTeam: '',
            awayTeamId: '',
            date: new Date().toISOString().split('T')[0],
            startTime: '20:00',
            round: roundNumber,
        };

        try {
            // שמירת המשחק בקולקשן המשחקים של המחזור
            const matchRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches', newMatch.uid);
            await setDoc(matchRef, newMatch);
            
            // עדכון המחזור עם ה-UID של המשחק החדש
            const roundRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString());
            const round = rounds.find(r => r.number === roundNumber);
            
            if (round) {
                const updatedMatches = [...(round.matches || []), newMatch.uid];
                
                await updateDoc(roundRef, { matches: updatedMatches });
                
                // עדכון ה-state
                setRounds(prev => prev.map(round => 
                    round.number === roundNumber 
                        ? { 
                            ...round, 
                            matches: updatedMatches,
                            matchesDetails: [...(round.matchesDetails || []), newMatch]
                        }
                        : round
                ));
            }
        } catch (error) {
            console.error('Error adding match:', error);
        }
    };

    const handleDeleteMatch = async (roundNumber: number, matchId: string) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק משחק זה?')) return;

        try {
            // מחיקת המשחק מהקולקשן של המחזור
            await deleteDoc(doc(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches', matchId));
            
            // עדכון המחזור
            const roundRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString());
            const round = rounds.find(r => r.number === roundNumber);
            
            if (round) {
                const updatedMatches = (round.matches || []).filter(id => id !== matchId);
                await updateDoc(roundRef, { matches: updatedMatches });
                
                setRounds(prev => prev.map(r => 
                    r.number === roundNumber 
                        ? { 
                            ...r, 
                            matches: updatedMatches,
                            matchesDetails: (r.matchesDetails || []).filter(match => match.uid !== matchId)
                        }
                        : r
                ));
            }
        } catch (error) {
            console.error('Error deleting match:', error);
        }
    };

    const handleUpdateUserRole = async (userId: string, newRole: 'user' | 'admin') => {
        try {
            await updateDoc(doc(db, 'users', userId), { role: newRole });
            setUsers(prev => prev.map(user => 
                user.uid === userId 
                    ? { ...user, role: newRole }
                    : user
            ));
        } catch (error) {
            console.error('Error updating user role:', error);
        }
    };

    const handleRecalculateUserPoints = async (userId: string) => {
        if (!confirm('האם אתה בטוח שברצונך לחשב מחדש את הנקודות של משתמש זה? זה עלול לקחת זמן.')) return;
        
        try {
            await recalculatePlayerPoints(userId);
            alert('הנקודות חושבו מחדש בהצלחה!');
        } catch (error) {
            console.error('Error recalculating user points:', error);
            alert('שגיאה בחישוב מחדש של הנקודות. אנא נסה שוב.');
        }
    };

    const handleEditRound = (round: Round) => {
        setEditingRound(round.number);
        setRoundEditData({
            startTime: round.startTime || ''
        });
    };

    const handleSaveRoundEdit = async () => {
        if (!editingRound) return;

        try {
            const roundRef = doc(db, 'season', currentSeason, 'rounds', editingRound.toString());
            await updateDoc(roundRef, {
                startTime: roundEditData.startTime
            });

            // עדכון ה-state
            setRounds(prev => prev.map(round => 
                round.number === editingRound 
                    ? { 
                        ...round, 
                        startTime: roundEditData.startTime
                    }
                    : round
            ));

            setEditingRound(null);
            setRoundEditData({ startTime: '' });
            
            // רענון הנתונים כדי לוודא שהשינויים נשמרו
            await loadData();
            
            alert('שעת הנעילה עודכנה בהצלחה!');
        } catch (error) {
            console.error('Error updating round:', error);
            alert('שגיאה בעדכון שעת הנעילה. אנא נסה שוב.');
        }
    };

    const handleCancelEdit = () => {
        setEditingRound(null);
        setRoundEditData({ startTime: '' });
    };

    const handleEditResults = (roundNumber: number) => {
        setEditingResults(roundNumber);
    };

    const handleSaveResults = async (roundNumber: number) => {
        try {
            const round = rounds.find(r => r.number === roundNumber);
            
            if (round && round.matchesDetails) {
                // שמירת התוצאות לכל משחק בקולקשן של המחזור
                for (const match of round.matchesDetails) {
                    if (match.actualHomeScore !== undefined && match.actualAwayScore !== undefined) {
                        const matchRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches', match.uid);
                        await updateDoc(matchRef, {
                            actualHomeScore: match.actualHomeScore,
                            actualAwayScore: match.actualAwayScore
                        });
                    }
                }
                
                // חישוב נקודות
                console.log('About to calculate round points...');
                const calculationResult = await calculateRoundPoints(roundNumber);
                
                if (calculationResult.hasIncompleteMatches) {
                    const confirmMessage = `יש משחקים ללא תוצאות:\n${calculationResult.incompleteMatches.join('\n')}\n\nהאם אתה בטוח שברצונך להמשיך?`;
                    if (!confirm(confirmMessage)) {
                        console.log('Points calculation cancelled by admin');
                        return;
                    }
                }
                
                console.log('Round points calculated successfully');
                
                setEditingResults(null);
                
                // רענון הנתונים כדי להציג את הנקודות המעודכנות
                await loadData();
                
                alert('התוצאות נשמרו והנקודות חושבו בהצלחה!');
            }
        } catch (error) {
            console.error('Error saving results:', error);
            alert('שגיאה בשמירת התוצאות. אנא נסה שוב.');
        }
    };

    const handleSaveSeasonEnd = async () => {
        try {
            const seasonRef = doc(db, 'season', currentSeason);
            await updateDoc(seasonRef, {
                seasonEnd: seasonEndDate,
                ...seasonResults
            });
            
            // חישוב נקודות להימורים מקדימים
            await calculatePreSeasonPoints();
            
            // רענון הנתונים כדי להציג את הנקודות המעודכנות
            await loadData();
            
            // ניקוי שדות החיפוש
            setPlayerSearchTerm('');
            setAssistSearchTerm('');
            
            alert('תאריך סיום העונה והתוצאות נשמרו בהצלחה! הנקודות חושבו ועודכנו.');
        } catch (error) {
            console.error('Error saving season end:', error);
            alert('שגיאה בשמירת תוצאות סוף עונה. אנא נסה שוב.');
        }
    };

    const handleEditMatches = (roundNumber: number) => {
        setEditingMatches(roundNumber);
    };

    const handleSaveMatchesEdit = async (roundNumber: number) => {
        try {
            const round = rounds.find(r => r.number === roundNumber);
            if (!round || !round.matchesDetails) return;

            // שמירת השינויים לכל משחק
            for (const match of round.matchesDetails) {
                const matchRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches', match.uid);
                await updateDoc(matchRef, {
                    homeTeam: match.homeTeam,
                    homeTeamId: match.homeTeamId,
                    awayTeam: match.awayTeam,
                    awayTeamId: match.awayTeamId,
                    date: match.date,
                    startTime: match.startTime
                });
            }

            setEditingMatches(null);
            await loadData();
            alert('המשחקים עודכנו בהצלחה!');
        } catch (error) {
            console.error('Error updating matches:', error);
            alert('שגיאה בעדכון המשחקים. אנא נסה שוב.');
        }
    };

    const handleUpdateMatch = (roundNumber: number, matchId: string, field: keyof Match, value: any) => {
        setRounds(prev => prev.map(round => 
            round.number === roundNumber 
                ? {
                    ...round,
                    matchesDetails: (round.matchesDetails || []).map(match => 
                        match.uid === matchId 
                            ? { ...match, [field]: value }
                            : match
                    )
                }
                : round
        ));
    };



    if (loading) {
        return (
            <div dir="rtl" className="p-4 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">טוען...</p>
                </div>
            </div>
        );
    }

    return (
        <div dir="rtl" className="p-4 min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900">ניהול מערכת</h1>
                        <p className="text-sm text-gray-600">פאנל ניהול למנהלי המערכת - עונה {currentSeason}</p>
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

                {/* Tabs */}
                <div className="flex space-x-4 border-b">
                    <Button
                        variant={activeTab === 'rounds' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('rounds')}
                        className="flex items-center gap-2"
                    >
                        <Calendar size={16} />
                        מחזורים
                    </Button>
                    <Button
                        variant={activeTab === 'results' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('results')}
                        className="flex items-center gap-2"
                    >
                        <Target size={16} />
                        תוצאות
                    </Button>
                    <Button
                        variant={activeTab === 'season' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('season')}
                        className="flex items-center gap-2"
                    >
                        <Trophy size={16} />
                        סיום עונה
                    </Button>
                    <Button
                        variant={activeTab === 'users' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('users')}
                        className="flex items-center gap-2"
                    >
                        <Users size={16} />
                        משתמשים
                    </Button>
                </div>

                {/* Rounds Management */}
                {activeTab === 'rounds' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">ניהול מחזורים</h2>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    onClick={loadData}
                                    className="flex items-center gap-2"
                                >
                                    <Settings size={16} />
                                    רענן נתונים
                                </Button>
                                <Button onClick={handleAddRound} className="flex items-center gap-2">
                                    <Plus size={16} />
                                    הוסף מחזור
                                </Button>
                            </div>
                        </div>

                        {rounds.length === 0 ? (
                            <Card className="bg-white rounded-xl shadow-sm">
                                <CardContent className="p-8 text-center">
                                    <div className="mb-4">
                                        <Calendar size={48} className="mx-auto text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">אין מחזורים</h3>
                                    <p className="text-gray-600 mb-4">עליך ליצור מחזורים תחילה כדי להתחיל לנהל את העונה</p>
                                    <Button 
                                        onClick={handleAddRound}
                                        className="flex items-center gap-2"
                                    >
                                        <Plus size={16} />
                                        הוסף מחזור ראשון
                                    </Button>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {rounds.map((round) => (
                                    <Card key={round.number} className="bg-white rounded-xl shadow-sm">
                                        <CardHeader>
                                            <CardTitle className="flex items-center justify-between">
                                                <span>מחזור {round.number}</span>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEditRound(round)}
                                                        className="text-blue-600 hover:text-blue-700"
                                                        title="ערוך שעת סגירת הימורים"
                                                    >
                                                        <Clock size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEditMatches(round.number)}
                                                        className="text-green-600 hover:text-green-700"
                                                        title="ערוך משחקים"
                                                    >
                                                        <Edit size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDeleteRound(round.number)}
                                                        className="text-red-600 hover:text-red-700"
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </div>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            {editingRound === round.number ? (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            תאריך ושעת תחילת מחזור (וגם סגירת הימורים)
                                                        </label>
                                                        <input
                                                            type="datetime-local"
                                                            value={roundEditData.startTime}
                                                            onChange={(e) => setRoundEditData(prev => ({ ...prev, startTime: e.target.value }))}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={handleSaveRoundEdit}
                                                            className="flex-1"
                                                        >
                                                            שמור
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={handleCancelEdit}
                                                            className="flex-1"
                                                        >
                                                            ביטול
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : editingMatches === round.number ? (
                                                <div className="space-y-3">
                                                    <div className="text-sm text-gray-600 mb-3">
                                                        <p className="font-medium mb-2">עריכת משחקים:</p>
                                                        {(round.matchesDetails || []).map((match, index) => (
                                                            <div key={match.uid} className="p-3 border rounded-lg bg-gray-50 space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm font-medium">משחק {index + 1}</span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleDeleteMatch(round.number, match.uid)}
                                                                        className="text-red-600 hover:text-red-700"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </Button>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div>
                                                                        <label className="block text-xs text-gray-600 mb-1">קבוצת בית</label>
                                                                        <select
                                                                            value={match.homeTeamId}
                                                                            onChange={(e) => {
                                                                                const team = teams.find(t => t.uid === e.target.value);
                                                                                handleUpdateMatch(round.number, match.uid, 'homeTeamId', e.target.value);
                                                                                handleUpdateMatch(round.number, match.uid, 'homeTeam', team?.name || '');
                                                                            }}
                                                                            className="w-full px-2 py-1 text-sm border rounded"
                                                                        >
                                                                            <option value="">בחר קבוצה</option>
                                                                            {teams.map(team => (
                                                                                <option key={team.uid} value={team.uid}>
                                                                                    {team.name}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs text-gray-600 mb-1">קבוצת חוץ</label>
                                                                        <select
                                                                            value={match.awayTeamId}
                                                                            onChange={(e) => {
                                                                                const team = teams.find(t => t.uid === e.target.value);
                                                                                handleUpdateMatch(round.number, match.uid, 'awayTeamId', e.target.value);
                                                                                handleUpdateMatch(round.number, match.uid, 'awayTeam', team?.name || '');
                                                                            }}
                                                                            className="w-full px-2 py-1 text-sm border rounded"
                                                                        >
                                                                            <option value="">בחר קבוצה</option>
                                                                            {teams.map(team => (
                                                                                <option key={team.uid} value={team.uid}>
                                                                                    {team.name}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div>
                                                                        <label className="block text-xs text-gray-600 mb-1">תאריך</label>
                                                                        <input
                                                                            type="date"
                                                                            value={match.date}
                                                                            onChange={(e) => handleUpdateMatch(round.number, match.uid, 'date', e.target.value)}
                                                                            className="w-full px-2 py-1 text-sm border rounded"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs text-gray-600 mb-1">שעה</label>
                                                                        <input
                                                                            type="time"
                                                                            value={match.startTime}
                                                                            onChange={(e) => handleUpdateMatch(round.number, match.uid, 'startTime', e.target.value)}
                                                                            className="w-full px-2 py-1 text-sm border rounded"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleAddMatch(round.number)}
                                                            className="w-full mt-2"
                                                        >
                                                            <Plus size={14} />
                                                            הוסף משחק
                                                        </Button>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleSaveMatchesEdit(round.number)}
                                                            className="flex-1"
                                                        >
                                                            שמור משחקים
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setEditingMatches(null)}
                                                            className="flex-1"
                                                        >
                                                            ביטול
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="text-sm text-gray-600">
                                                        <p>משחקים: {round.matchesDetails?.length || 0}</p>
                                                        {round.startTime && (
                                                            <p>תחילת מחזור: {new Date(round.startTime).toLocaleString('he-IL')}</p>
                                                        )}
                                                    </div>
                                                    {(round.matchesDetails || []).length > 0 && (
                                                        <div className="text-xs text-gray-500">
                                                            <p className="font-medium mb-1">משחקי המחזור:</p>
                                                            {(round.matchesDetails || []).slice(0, 3).map((match) => (
                                                                <div key={match.uid} className="flex items-center gap-2 mb-1">
                                                                    <TeamLogo teamId={match.homeTeamId} size="sm" />
                                                                    <span className="text-xs">
                                                                        {teams.find(t => t.uid === match.homeTeamId)?.name || match.homeTeam} 
                                                                        vs 
                                                                        {teams.find(t => t.uid === match.awayTeamId)?.name || match.awayTeam}
                                                                    </span>
                                                                    <TeamLogo teamId={match.awayTeamId} size="sm" />
                                                                </div>
                                                            ))}
                                                            {(round.matchesDetails || []).length > 3 && (
                                                                <p className="text-xs text-gray-400">ועוד {(round.matchesDetails || []).length - 3} משחקים...</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Results Management */}
                {activeTab === 'results' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">ניהול תוצאות</h2>
                            <Button 
                                variant="outline" 
                                onClick={loadData}
                                className="flex items-center gap-2"
                            >
                                <Settings size={16} />
                                רענן נתונים
                            </Button>
                        </div>
                        
                        {rounds.length === 0 ? (
                            <Card className="bg-white rounded-xl shadow-sm">
                                <CardContent className="p-8 text-center">
                                    <div className="mb-4">
                                        <Target size={48} className="mx-auto text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">אין מחזורים</h3>
                                    <p className="text-gray-600 mb-4">עליך ליצור מחזורים תחילה לפני שתוכל להזין תוצאות</p>
                                    <Button 
                                        onClick={() => setActiveTab('rounds')}
                                        className="flex items-center gap-2"
                                    >
                                        <Plus size={16} />
                                        עבור לניהול מחזורים
                                    </Button>
                                </CardContent>
                            </Card>
                        ) : (
                            rounds.map((round) => (
                                <Card key={round.number} className="bg-white rounded-xl shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between">
                                            <span>מחזור {round.number}</span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleEditResults(round.number)}
                                                    className="text-blue-600"
                                                >
                                                    הזן תוצאות
                                                </Button>
                                                {(round.matchesDetails || []).some(match => match.pointsCalculated) && (
                                                    <span className="text-green-600 text-sm">
                                                        ✓ {round.matchesDetails?.filter(match => match.pointsCalculated).length || 0} משחקים חושבו
                                                    </span>
                                                )}
                                            </div>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {(round.matchesDetails || []).map((match) => (
                                                <div
                                                    key={match.uid}
                                                    className="flex items-center justify-between p-3 rounded-lg border bg-gray-50"
                                                >
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-4">
                                                            <div className="text-center flex-1">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <TeamLogo teamId={match.homeTeamId} size="sm" />
                                                                    <p className="font-medium">
                                                                        {teams.find(t => t.uid === match.homeTeamId)?.name || match.homeTeam || 'קבוצה לא נבחרה'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="text-center mx-4">
                                                                <div className="text-sm text-gray-600">נגד</div>
                                                                <div className="text-xs text-gray-500">
                                                                    {match.date} - {match.startTime}
                                                                </div>
                                                            </div>
                                                            <div className="text-center flex-1">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <p className="font-medium">
                                                                        {teams.find(t => t.uid === match.awayTeamId)?.name || match.awayTeam || 'קבוצה לא נבחרה'}
                                                                    </p>
                                                                    <TeamLogo teamId={match.awayTeamId} size="sm" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {editingResults === round.number ? (
                                                            <>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="20"
                                                                    placeholder="0"
                                                                    className="w-16 h-10 text-center border rounded"
                                                                    defaultValue={match.actualHomeScore || ''}
                                                                    onChange={(e) => {
                                                                        const updatedMatches = round.matchesDetails?.map(m => 
                                                                            m.uid === match.uid 
                                                                                ? { ...m, actualHomeScore: parseInt(e.target.value) || 0 }
                                                                                : m
                                                                        ) || [];
                                                                        setRounds(prev => prev.map(r => 
                                                                            r.number === round.number 
                                                                                ? { ...r, matchesDetails: updatedMatches }
                                                                                : r
                                                                        ));
                                                                    }}
                                                                />
                                                                <span className="text-lg font-semibold">-</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="20"
                                                                    placeholder="0"
                                                                    className="w-16 h-10 text-center border rounded"
                                                                    defaultValue={match.actualAwayScore || ''}
                                                                    onChange={(e) => {
                                                                        const updatedMatches = round.matchesDetails?.map(m => 
                                                                            m.uid === match.uid 
                                                                                ? { ...m, actualAwayScore: parseInt(e.target.value) || 0 }
                                                                                : m
                                                                        ) || [];
                                                                        setRounds(prev => prev.map(r => 
                                                                            r.number === round.number 
                                                                                ? { ...r, matchesDetails: updatedMatches }
                                                                                : r
                                                                        ));
                                                                    }}
                                                                />
                                                            </>
                                                        ) : (
                                                            <div className="text-center">
                                                                {match.actualHomeScore !== undefined && match.actualAwayScore !== undefined ? (
                                                                    <div>
                                                                        <p className="font-semibold">
                                                                            {match.actualHomeScore} - {match.actualAwayScore}
                                                                        </p>
                                                                        {match.pointsCalculated && (
                                                                            <p className="text-xs text-green-600">✓ חושבו נקודות</p>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-gray-500">לא הוזן</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {(round.matchesDetails || []).length === 0 && (
                                                <div className="text-center py-6 text-gray-500">
                                                    <div className="mb-2">
                                                        <Settings size={24} className="mx-auto text-gray-400" />
                                                    </div>
                                                    <p className="font-medium">אין משחקים במחזור זה</p>
                                                </div>
                                            )}
                                            {editingResults === round.number && (
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleSaveResults(round.number)}
                                                    >
                                                        שמור תוצאות
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setEditingResults(null)}
                                                    >
                                                        ביטול
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                )}

                {/* Season End Management */}
                {activeTab === 'season' && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">סיום עונה</h2>
                        
                        <Card className="bg-white rounded-xl shadow-sm">
                            <CardHeader>
                                <CardTitle>הזנת תוצאות סוף עונה</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        תאריך ושעת סיום העונה
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={seasonEndDate}
                                        onChange={(e) => setSeasonEndDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            אלופה
                                        </label>
                                        <select
                                            value={seasonResults.champion}
                                            onChange={(e) => setSeasonResults(prev => ({ ...prev, champion: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        >
                                            <option value="">בחר קבוצה</option>
                                            {teams.map(team => (
                                                <option key={team.uid} value={team.uid}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            יורדת ראשונה
                                        </label>
                                        <select
                                            value={seasonResults.relegation1}
                                            onChange={(e) => setSeasonResults(prev => ({ ...prev, relegation1: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        >
                                            <option value="">בחר קבוצה</option>
                                            {teams.map(team => (
                                                <option key={team.uid} value={team.uid}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            יורדת שנייה
                                        </label>
                                        <select
                                            value={seasonResults.relegation2}
                                            onChange={(e) => setSeasonResults(prev => ({ ...prev, relegation2: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        >
                                            <option value="">בחר קבוצה</option>
                                            {teams.map(team => (
                                                <option key={team.uid} value={team.uid}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            מלך שערים
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={playerSearchTerm}
                                                onChange={(e) => setPlayerSearchTerm(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                                placeholder="חפש שחקן..."
                                            />
                                            {playerSearchTerm && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                                    {players
                                                        .filter(player => 
                                                            player.name.toLowerCase().includes(playerSearchTerm.toLowerCase())
                                                        )
                                                        .map(player => (
                                                            <div
                                                                key={player.uid}
                                                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                                                                onClick={() => {
                                                                    setSeasonResults(prev => ({ ...prev, topScorer: player.uid }));
                                                                    setPlayerSearchTerm(player.name);
                                                                }}
                                                            >
                                                                <TeamLogo teamId={player.teamId} size="sm" />
                                                                <span>{player.name} - {teams.find(t => t.uid === player.teamId)?.name || player.team}</span>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            )}
                                        </div>
                                        {seasonResults.topScorer && (
                                            <p className="text-sm text-green-600 mt-1">
                                                נבחר: {players.find(p => p.uid === seasonResults.topScorer)?.name}
                                            </p>
                                        )}
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            מלך בישולים
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={assistSearchTerm}
                                                onChange={(e) => setAssistSearchTerm(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                                placeholder="חפש שחקן..."
                                            />
                                            {assistSearchTerm && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                                    {players
                                                        .filter(player => 
                                                            player.name.toLowerCase().includes(assistSearchTerm.toLowerCase())
                                                        )
                                                        .map(player => (
                                                            <div
                                                                key={player.uid}
                                                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                                                                onClick={() => {
                                                                    setSeasonResults(prev => ({ ...prev, topAssists: player.uid }));
                                                                    setAssistSearchTerm(player.name);
                                                                }}
                                                            >
                                                                <TeamLogo teamId={player.teamId} size="sm" />
                                                                <span>{player.name} - {teams.find(t => t.uid === player.teamId)?.name || player.team}</span>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            )}
                                        </div>
                                        {seasonResults.topAssists && (
                                            <p className="text-sm text-green-600 mt-1">
                                                נבחר: {players.find(p => p.uid === seasonResults.topAssists)?.name}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex justify-end">
                                    <Button
                                        onClick={handleSaveSeasonEnd}
                                        className="flex items-center gap-2"
                                    >
                                        <Trophy size={16} />
                                        שמור תוצאות סוף עונה
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Users Management */}
                {activeTab === 'users' && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">ניהול משתמשים</h2>
                        
                        <Card className="bg-white rounded-xl shadow-sm">
                            <CardContent>
                                <div className="space-y-3">
                                    {users.map((user) => (
                                        <div
                                            key={user.uid}
                                            className="flex items-center justify-between p-3 rounded-lg border bg-gray-50"
                                        >
                                            <div>
                                                <p className="font-medium">{user.displayName || user.email}</p>
                                                <p className="text-sm text-gray-600">{user.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={user.role}
                                                    onChange={(e) => handleUpdateUserRole(user.uid, e.target.value as 'user' | 'admin')}
                                                    className="border rounded px-2 py-1 text-sm"
                                                >
                                                    <option value="user">משתמש</option>
                                                    <option value="admin">מנהל</option>
                                                </select>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRecalculateUserPoints(user.uid)}
                                                    className="text-blue-600 hover:text-blue-700"
                                                    title="חשב מחדש נקודות"
                                                >
                                                    <Settings size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Stats Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-gray-600">מחזורים</p>
                            <p className="text-2xl font-bold text-blue-600">{rounds.length}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-gray-600">משחקים</p>
                            <p className="text-2xl font-bold text-green-600">
                                {rounds.reduce((sum, round) => sum + (round.matchesDetails?.length || 0), 0)}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-gray-600">משתמשים</p>
                            <p className="text-2xl font-bold text-purple-600">{users.length}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-white rounded-xl shadow-sm">
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-gray-600">מנהלים</p>
                            <p className="text-2xl font-bold text-orange-600">
                                {users.filter(u => u.role === 'admin').length}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Modal להוספת משחקים למחזור חדש */}
            {showAddMatchesModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-semibold">הוסף משחקים למחזור {newRoundNumber}</h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setShowAddMatchesModal(false);
                                        setNewMatches([]);
                                        setNewRoundNumber(0);
                                    }}
                                >
                                    <X size={20} />
                                </Button>
                            </div>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="text-sm text-gray-600">
                                <p>הוסף משחקים למחזור החדש. עליך להוסיף לפחות משחק אחד.</p>
                            </div>
                            
                            {newMatches.map((match, index) => (
                                <div key={index} className="p-4 border rounded-lg bg-gray-50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">משחק {index + 1}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveNewMatch(index)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                קבוצת בית
                                            </label>
                                            <select
                                                value={match.homeTeamId}
                                                onChange={(e) => {
                                                    const team = teams.find(t => t.uid === e.target.value);
                                                    handleUpdateNewMatch(index, 'homeTeamId', e.target.value);
                                                    handleUpdateNewMatch(index, 'homeTeam', team?.name || '');
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            >
                                                <option value="">בחר קבוצה</option>
                                                {teams.map(team => (
                                                    <option key={team.uid} value={team.uid}>
                                                        {team.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                קבוצת חוץ
                                            </label>
                                            <select
                                                value={match.awayTeamId}
                                                onChange={(e) => {
                                                    const team = teams.find(t => t.uid === e.target.value);
                                                    handleUpdateNewMatch(index, 'awayTeamId', e.target.value);
                                                    handleUpdateNewMatch(index, 'awayTeam', team?.name || '');
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            >
                                                <option value="">בחר קבוצה</option>
                                                {teams.map(team => (
                                                    <option key={team.uid} value={team.uid}>
                                                        {team.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                תאריך
                                            </label>
                                            <input
                                                type="date"
                                                value={match.date}
                                                onChange={(e) => handleUpdateNewMatch(index, 'date', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                שעה
                                            </label>
                                            <input
                                                type="time"
                                                value={match.startTime}
                                                onChange={(e) => handleUpdateNewMatch(index, 'startTime', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            
                            <Button
                                onClick={handleAddNewMatch}
                                variant="outline"
                                className="w-full"
                            >
                                <Plus size={16} />
                                הוסף משחק
                            </Button>
                        </div>
                        
                        <div className="p-6 border-t bg-gray-50 flex gap-3">
                            <Button
                                onClick={handleSaveRoundWithMatches}
                                disabled={newMatches.length === 0}
                                className="flex-1"
                            >
                                צור מחזור עם משחקים
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowAddMatchesModal(false);
                                    setNewMatches([]);
                                    setNewRoundNumber(0);
                                }}
                                className="flex-1"
                            >
                                ביטול
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 