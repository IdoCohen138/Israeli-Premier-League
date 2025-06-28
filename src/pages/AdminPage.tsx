import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Edit, Trash2, Calendar, Clock, Users, Settings } from "lucide-react";
import { Match, Round, Team, User } from "@/types";
import { collection, doc, getDocs, setDoc, deleteDoc, addDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rounds, setRounds] = useState<Round[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'rounds' | 'matches' | 'users'>('rounds');

    useEffect(() => {
        if (user?.role !== 'admin') {
            navigate('/');
            return;
        }
        loadData();
    }, [user, navigate]);

    const loadData = async () => {
        try {
            // טעינת מחזורים
            const roundsSnapshot = await getDocs(collection(db, 'season', 'current', 'rounds'));
            const roundsData = roundsSnapshot.docs.map(doc => ({ 
                number: parseInt(doc.id), 
                ...doc.data() 
            } as Round));
            setRounds(roundsData.sort((a, b) => a.number - b.number));

            // טעינת קבוצות
            const teamsSnapshot = await getDocs(collection(db, 'season', 'current', 'teams'));
            const teamsData = teamsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Team));
            setTeams(teamsData);

            // טעינת משתמשים
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const usersData = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
            setUsers(usersData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddRound = async () => {
        const roundNumber = rounds.length + 1;
        const newRound: Round = {
            number: roundNumber,
            matches: [],
            closingTime: new Date().toISOString().split('T')[0],
            endTime: new Date().toISOString().split('T')[0],
            isActive: false,
        };

        try {
            await setDoc(doc(db, 'season', 'current', 'rounds', roundNumber.toString()), newRound);
            setRounds(prev => [...prev, newRound]);
        } catch (error) {
            console.error('Error adding round:', error);
        }
    };

    const handleDeleteRound = async (roundNumber: number) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק מחזור זה?')) return;

        try {
            await deleteDoc(doc(db, 'season', 'current', 'rounds', roundNumber.toString()));
            setRounds(prev => prev.filter(round => round.number !== roundNumber));
        } catch (error) {
            console.error('Error deleting round:', error);
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
            const roundRef = doc(db, 'season', 'current', 'rounds', roundNumber.toString());
            const roundDoc = await getDocs(collection(db, 'season', 'current', 'rounds'));
            const roundData = roundDoc.docs.find(doc => parseInt(doc.id) === roundNumber);
            
            if (roundData) {
                const updatedMatches = [...roundData.data().matches, newMatch];
                await updateDoc(roundRef, { matches: updatedMatches });
                
                setRounds(prev => prev.map(round => 
                    round.number === roundNumber 
                        ? { ...round, matches: [...round.matches, newMatch] }
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
            const roundRef = doc(db, 'season', 'current', 'rounds', roundNumber.toString());
            const round = rounds.find(r => r.number === roundNumber);
            
            if (round) {
                const updatedMatches = round.matches.filter(match => match.uid !== matchId);
                await updateDoc(roundRef, { matches: updatedMatches });
                
                setRounds(prev => prev.map(r => 
                    r.number === roundNumber 
                        ? { ...r, matches: updatedMatches }
                        : r
                ));
            }
        } catch (error) {
            console.error('Error deleting match:', error);
        }
    };

    const handleCancelMatch = async (roundNumber: number, matchId: string) => {
        try {
            const roundRef = doc(db, 'season', 'current', 'rounds', roundNumber.toString());
            const round = rounds.find(r => r.number === roundNumber);
            
            if (round) {
                const updatedMatches = round.matches.map(match => 
                    match.uid === matchId 
                        ? { ...match, isCancelled: true }
                        : match
                );
                await updateDoc(roundRef, { matches: updatedMatches });
                
                setRounds(prev => prev.map(r => 
                    r.number === roundNumber 
                        ? { ...r, matches: updatedMatches }
                        : r
                ));
            }
        } catch (error) {
            console.error('Error cancelling match:', error);
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
                        <p className="text-sm text-gray-600">פאנל ניהול למנהלי המערכת</p>
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
                        variant={activeTab === 'matches' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('matches')}
                        className="flex items-center gap-2"
                    >
                        <Settings size={16} />
                        משחקים
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
                            <Button onClick={handleAddRound} className="flex items-center gap-2">
                                <Plus size={16} />
                                הוסף מחזור
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {rounds.map((round) => (
                                <Card key={round.number} className="bg-white rounded-xl shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between">
                                            <span>מחזור {round.number}</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteRound(round.number)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="text-sm text-gray-600">
                                            <p>משחקים: {round.matches.length}</p>
                                            <p>סטטוס: {round.isActive ? 'פעיל' : 'לא פעיל'}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleAddMatch(round.number)}
                                            >
                                                הוסף משחק
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* Matches Management */}
                {activeTab === 'matches' && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">ניהול משחקים</h2>
                        
                        {rounds.map((round) => (
                            <Card key={round.number} className="bg-white rounded-xl shadow-sm">
                                <CardHeader>
                                    <CardTitle>מחזור {round.number}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {round.matches.map((match) => (
                                            <div
                                                key={match.uid}
                                                className={`flex items-center justify-between p-3 rounded-lg border ${
                                                    match.isCancelled ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                                                }`}
                                            >
                                                <div>
                                                    <p className="font-medium">
                                                        {teams.find(t => t.uid === match.homeTeamId)?.name || match.homeTeam} 
                                                        נגד {teams.find(t => t.uid === match.awayTeamId)?.name || match.awayTeam}
                                                    </p>
                                                    <p className="text-sm text-gray-600">
                                                        {match.date} - {match.startTime}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    {!match.isCancelled && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleCancelMatch(round.number, match.uid)}
                                                            className="text-orange-600"
                                                        >
                                                            בטל משחק
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleDeleteMatch(round.number, match.uid)}
                                                        className="text-red-600"
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
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
                                {rounds.reduce((sum, round) => sum + round.matches.length, 0)}
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
        </div>
    );
} 