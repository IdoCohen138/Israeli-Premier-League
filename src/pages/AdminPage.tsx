import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Plus, Edit, Trash2, Calendar, Clock, Users, Settings, Trophy, Target, X, TrendingDown, UserPlus } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import AdminMatchRow from "@/components/admin/AdminMatchRow";
import { Match, Round, Team, User, Player } from "@/types";
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc, writeBatch, getDoc, deleteField } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getCurrentSeason, openNewSeason, getNextSeasonId, formatSeasonDisplay, setActiveSeason, setSeasonOpen, listSeasonIds, sortSeasonIdsDesc } from "@/lib/season";
import { sortRoundsByStartTime, sortMatchesByStartTime } from "@/lib/sorting";
import { calculateRoundPoints, calculatePreSeasonPoints, deleteRoundPoints, recalculatePlayerPoints, cancelMatch, restoreCancelledMatch, grantUserBettingExtension, revokeUserBettingExtension } from "@/lib/playerBets";
import { formatIsraelDateTime } from "@/lib/israelTime";
import { isDeadlinePassed } from "@/lib/serverTime";
import { useSeason } from "@/contexts/SeasonContext";
import PageShell from "@/components/layout/PageShell";
import PageHeader from "@/components/layout/PageHeader";
import LoadingScreen from "@/components/layout/LoadingScreen";

export default function AdminPage() {
    const { user } = useAuth();
    const { seasonOpen, config, refreshConfig } = useSeason();
    const navigate = useNavigate();
    const [rounds, setRounds] = useState<Round[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'rounds' | 'matches' | 'results' | 'cancellations' | 'season' | 'users'>('rounds');
    const [currentSeason, setCurrentSeason] = useState<string>('');
    const [editingRound, setEditingRound] = useState<number | null>(null);
    const [roundEditData, setRoundEditData] = useState({
        startTime: '',
        name: ''
    });
    const [editingResults, setEditingResults] = useState<number | null>(null);

    const [seasonResults, setSeasonResults] = useState({
        champion: '',
        relegation1: '',
        relegation2: '',
        topScorer: '',
        topAssists: '',
        cupWinner: ''
    });
    const [players, setPlayers] = useState<Player[]>([]);
    const [playerSearchTerm, setPlayerSearchTerm] = useState('');
    const [assistSearchTerm, setAssistSearchTerm] = useState('');
    
    // State חדש לניהול חלון הוספת משחקים
    const [showAddMatchesModal, setShowAddMatchesModal] = useState(false);
    const [newRoundNumber, setNewRoundNumber] = useState<number>(0);
    const [newMatches, setNewMatches] = useState<Omit<Match, 'uid' | 'round'>[]>([]);
    const [editingMatches, setEditingMatches] = useState<number | null>(null);

    // 1. סטייט חיווי חישוב נקודות
    const [isCalculatingPoints, setIsCalculatingPoints] = useState(false);

    // סטייט לשעת סגירת הימורים מקדימים
    const [seasonStart, setSeasonStart] = useState<string>("");
    const [isOpeningSeason, setIsOpeningSeason] = useState(false);
    const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
    const [isChangingSeason, setIsChangingSeason] = useState(false);
    const [isTogglingAccess, setIsTogglingAccess] = useState(false);

    const [extensionRoundNumber, setExtensionRoundNumber] = useState<number | null>(null);
    const [extensionTargetUserId, setExtensionTargetUserId] = useState<string>('');
    const [extensionDeadline, setExtensionDeadline] = useState<string>('');
    const [isGrantingExtension, setIsGrantingExtension] = useState(false);

    useEffect(() => {
        if (user?.role !== 'admin') {
            navigate('/');
            return;
        }
        setCurrentSeason(getCurrentSeason());
        loadData();
        loadAvailableSeasons();
    }, [user, navigate]);

    useEffect(() => {
        if (!config?.activeSeasonId) return;
        setCurrentSeason(config.activeSeasonId);
        loadData();
    }, [config?.activeSeasonId]);

    const loadAvailableSeasons = async () => {
        try {
            const seasons = await listSeasonIds();
            setAvailableSeasons(seasons);
        } catch (error) {
            console.error('Error loading seasons:', error);
        }
    };

    // שליפת ערכי סוף עונה מה-DB כאשר נכנסים לטאב סיום עונה
    useEffect(() => {
        if (activeTab === 'season' && currentSeason) {
            const fetchSeasonResults = async () => {
                const seasonRef = doc(db, 'season', currentSeason);
                const seasonSnap = await getDoc(seasonRef);
                if (seasonSnap.exists()) {
                    const data = seasonSnap.data();
                    setSeasonResults({
                        champion: data.champion || '',
                        cupWinner: data.cupWinner || '',
                        relegation1: data.relegation1 || '',
                        relegation2: data.relegation2 || '',
                        topScorer: data.topScorer || '',
                        topAssists: data.topAssists || ''
                    });
                    // עיבוד seasonStart
                    let start = '';
                    if (data.seasonStart) {
                        if (typeof data.seasonStart === 'string') {
                            start = data.seasonStart.slice(0, 16); // YYYY-MM-DDTHH:mm
                        } else if (data.seasonStart.toDate) {
                            // Firestore Timestamp
                            const d = data.seasonStart.toDate();
                            start = d.toISOString().slice(0, 16);
                        }
                    }
                    setSeasonStart(start);
                }
            };
            fetchSeasonResults();
        }
        // eslint-disable-next-line
    }, [activeTab, currentSeason]);

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
                        const matchesData = sortMatchesByStartTime(matchesSnapshot.docs.map(doc => ({ 
                            uid: doc.id,
                            ...doc.data() 
                        } as Match)));
                        
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
            
            setRounds(sortRoundsByStartTime(roundsWithMatches));

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
                name: `מחזור ${newRoundNumber}`,
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
            date: '', // חובה לפי הטיפוס, אך לא מוצג למשתמש
            startTime: '', // חובה לפי הטיפוס, אך לא מוצג למשתמש
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
                            matchesDetails: sortMatchesByStartTime([...(round.matchesDetails || []), newMatch])
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
            startTime: round.startTime || '',
            name: round.name || `מחזור ${round.number}`
        });
    };

    const handleSaveRoundEdit = async () => {
        if (!editingRound) return;

        try {
            const roundRef = doc(db, 'season', currentSeason, 'rounds', editingRound.toString());
            await updateDoc(roundRef, {
                startTime: roundEditData.startTime,
                name: roundEditData.name
            });

            // עדכון ה-state
            setRounds(prev => prev.map(round => 
                round.number === editingRound 
                    ? { 
                        ...round, 
                        startTime: roundEditData.startTime,
                        name: roundEditData.name
                    }
                    : round
            ));

            setEditingRound(null);
            setRoundEditData({ startTime: '', name: '' });
            
            // רענון הנתונים כדי לוודא שהשינויים נשמרו
            await loadData();
            
            alert('פרטי המחזור עודכנו בהצלחה!');
        } catch (error) {
            console.error('Error updating round:', error);
            alert('שגיאה בעדכון פרטי המחזור. אנא נסה שוב.');
        }
    };

    const handleCancelEdit = () => {
        setEditingRound(null);
        setRoundEditData({ startTime: '', name: '' });
    };

    const handleEditResults = (roundNumber: number) => {
        setEditingResults(roundNumber);
    };

    // 3. עדכון handleSaveResults
    const handleSaveResults = async (roundNumber: number) => {
        if (isCalculatingPoints) return;
        setIsCalculatingPoints(true);
        try {
            const round = rounds.find(r => r.number === roundNumber);
            
            if (round && round.matchesDetails) {
                // בדוק אם יש משחקים ללא תוצאה (רק לא מבוטלים)
                const incompleteMatches = round.matchesDetails.filter(
                    m => !m.isCancelled && (m.actualHomeScore === undefined || m.actualHomeScore === null || m.actualAwayScore === undefined || m.actualAwayScore === null)
                );
                if (incompleteMatches.length > 0) {
                    const msg = 'יש משחקים ללא תוצאה:\n' + incompleteMatches.map(m => `${m.homeTeam} - ${m.awayTeam}`).join('\n') + '\n\nהאם להמשיך ולחשב נקודות?';
                    if (!window.confirm(msg)) {
                        setIsCalculatingPoints(false);
                        return;
                    }
                }
                // שמירת התוצאות לכל משחק בקולקשן של המחזור (רק לא מבוטלים)
                for (const match of round.matchesDetails) {
                    const matchRef = doc(db, 'season', currentSeason, 'rounds', roundNumber.toString(), 'matches', match.uid);
                    if (match.isCancelled) {
                        // ודא שב-DB המשחק מסומן כמבוטל
                        await updateDoc(matchRef, { isCancelled: true, actualHomeScore: null, actualAwayScore: null });
                    } else if (match.actualHomeScore !== undefined && match.actualHomeScore !== null && match.actualAwayScore !== undefined && match.actualAwayScore !== null) {
                        await updateDoc(matchRef, {
                            actualHomeScore: match.actualHomeScore,
                            actualAwayScore: match.actualAwayScore,
                            isCancelled: deleteField()
                        });
                    }
                }       
                const calculationResult = await calculateRoundPoints(roundNumber);
                if (calculationResult.hasIncompleteMatches) {
                    const confirmMessage = `יש משחקים ללא תוצאות:\n${calculationResult.incompleteMatches.join('\n')}\n\nהאם אתה בטוח שברצונך להמשיך?`;
                    if (!confirm(confirmMessage)) {
                        setIsCalculatingPoints(false);
                        return;
                    }
                }                    
                setEditingResults(null);
                await loadData();
                alert('התוצאות נשמרו והנקודות חושבו בהצלחה!');
            }
        } catch (error) {
            console.error(error);
            alert('שגיאה בשמירת התוצאות. אנא נסה שוב.');
        } finally {
            setIsCalculatingPoints(false);
        }
    };

    // פונקציה לבדיקה אם כל השדות מלאים
        const isSeasonEndFormValid = () => {
        return seasonResults.champion &&
               seasonResults.relegation1 &&
               seasonResults.relegation2 &&
               seasonResults.topScorer &&
               seasonResults.topAssists &&
               seasonResults.cupWinner;
    };

    const handleSaveSeasonEnd = async () => {
        // בדיקה שכל השדות מלאים
        if (!isSeasonEndFormValid()) {
            alert('עליך למלא את כל הפרטים לפני שמירת תוצאות סוף העונה');
            return;
        }

        try {
            const seasonRef = doc(db, 'season', currentSeason);
            await updateDoc(seasonRef, {
                ...seasonResults
            });
            
            // חישוב נקודות להימורים מקדימים
            await calculatePreSeasonPoints();
            
            // רענון הנתונים כדי להציג את הנקודות המעודכנות
            await loadData();
            
            // ניקוי שדות החיפוש
            setPlayerSearchTerm('');
            setAssistSearchTerm('');
            
            alert('התוצאות נשמרו בהצלחה! הנקודות חושבו ועודכנו.');
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
                    // date: match.date, // הוסר
                    // startTime: match.startTime, // הוסר
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

    // 2. ביטול משחק (isCancelled) - פונקציה חדשה
    const handleCancelMatch = async (roundNumber: number, matchId: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך לבטל משחק זה? אם המשחק כבר חושב, הנקודות יורדו מהמשתמשים.')) return;
        
        try {
            await cancelMatch(roundNumber, matchId);
            await loadData(); // רענון הנתונים
            alert('המשחק בוטל בהצלחה!');
        } catch (error) {
            console.error('Error cancelling match:', error);
            alert('שגיאה בביטול המשחק. אנא נסה שוב.');
        }
    };

    // איפוס תוצאות מחזור
    const handleResetRoundResults = async (roundNumber: number) => {
        if (!window.confirm('האם אתה בטוח שברצונך לאפס את כל התוצאות והנקודות של מחזור זה?')) return;
        try {
            const seasonId = currentSeason;
            // שלוף את כל המשחקים במחזור
            const matchesSnap = await getDocs(collection(db, 'season', seasonId, 'rounds', roundNumber.toString(), 'matches'));
            const matchIds = matchesSnap.docs.map(doc => doc.id);
            // אפס תוצאות בכל משחק
            const batch = writeBatch(db);
            for (const matchDoc of matchesSnap.docs) {
                batch.update(matchDoc.ref, {
                    actualHomeScore: null,
                    actualAwayScore: null,
                    pointsCalculated: false
                });
            }
            // שלוף את כל המשתמשים
            const playerBetsSnap = await getDocs(collection(db, 'season', seasonId, 'playerBets'));
            for (const userDoc of playerBetsSnap.docs) {
                const playerBetsData = userDoc.data();
                const roundBetsRef = doc(db, 'season', seasonId, 'playerBets', userDoc.id, 'roundBetsCollection', roundNumber.toString());
                const roundBetsSnap = await getDoc(roundBetsRef);
                let roundPointsToSubtract = 0;
                let correctPredictionsToSubtract = 0;
                let exactPredictionsToSubtract = 0;
                
                if (roundBetsSnap.exists()) {
                    const bets = roundBetsSnap.data().bets || [];
                    // אפס נקודות רק למשחקים של המחזור הזה
                    const updatedBets = bets.map((bet: any) => {
                        if (matchIds.includes(bet.matchId)) {
                            roundPointsToSubtract += bet.points || 0;
                            if (bet.isExactResult) {
                                exactPredictionsToSubtract += 1;
                            } else if (bet.isCorrectDirection) {
                                correctPredictionsToSubtract += 1;
                            }
                            return {
                                ...bet,
                                points: 0,
                                isExactResult: false,
                                isCorrectDirection: false
                            };
                        }
                        return bet;
                    });
                    batch.update(roundBetsRef, { bets: updatedBets });
                }
                
                // עדכון הנקודות והסטטיסטיקות של המשתמש
                const updatedRoundPoints = { ...(playerBetsData.roundPoints || {}) };
                const updatedCorrectPredictionsMap = { ...(playerBetsData.correctPredictionsMap || {}) };
                const updatedExactPredictionsMap = { ...(playerBetsData.exactPredictionsMap || {}) };
                
                // חסירת הנקודות של המחזור
                if (updatedRoundPoints[roundNumber]) {
                    roundPointsToSubtract = updatedRoundPoints[roundNumber];
                    delete updatedRoundPoints[roundNumber];
                }
                
                // חסירת התחזיות המדויקות והכיוון של המחזור
                const correctPredictionsFromMap = updatedCorrectPredictionsMap[roundNumber] || 0;
                const exactPredictionsFromMap = updatedExactPredictionsMap[roundNumber] || 0;
                delete updatedCorrectPredictionsMap[roundNumber];
                delete updatedExactPredictionsMap[roundNumber];
                
                const newTotalPoints = (playerBetsData.totalPoints || 0) - roundPointsToSubtract;
                const newCorrectPredictions = (playerBetsData.correctPredictions || 0) - correctPredictionsToSubtract - correctPredictionsFromMap;
                const newExactPredictions = (playerBetsData.exactPredictions || 0) - exactPredictionsToSubtract - exactPredictionsFromMap;
                
                batch.update(userDoc.ref, {
                    roundPoints: updatedRoundPoints,
                    totalPoints: newTotalPoints < 0 ? 0 : newTotalPoints,
                    correctPredictions: newCorrectPredictions < 0 ? 0 : newCorrectPredictions,
                    exactPredictions: newExactPredictions < 0 ? 0 : newExactPredictions,
                    correctPredictionsMap: updatedCorrectPredictionsMap,
                    exactPredictionsMap: updatedExactPredictionsMap
                });
            }
            await batch.commit();
            await loadData();
            alert('כל התוצאות והנקודות של המחזור אופסו בהצלחה!');
        } catch (error) {
            console.error('Error resetting round results:', error);
            alert('שגיאה באיפוס התוצאות.');
        }
    };

    // כפתור איפוס כללי לסוף עונה
    const handleResetAllSeasonResults = async () => {
        if (!window.confirm('האם לאפס את כל בחירות סוף העונה? זה יוריד את הנקודות מהימורים מקדימים מכל המשתמשים.')) return;
        try {
            const seasonRef = doc(db, 'season', currentSeason);
            await updateDoc(seasonRef, {
                champion: '',
                cupWinner: '',
                relegation1: '',
                relegation2: '',
                topScorer: '',
                topAssists: ''
            });
            
            // חסירת נקודות הימורים מקדימים מכל המשתמשים
            const playerBetsSnap = await getDocs(collection(db, 'season', currentSeason, 'playerBets'));
            const batch = writeBatch(db);
            
            for (const userDoc of playerBetsSnap.docs) {
                const playerBetsData = userDoc.data();
                const preSeasonPoints = playerBetsData.preSeasonPoints || 0;
                const totalPoints = playerBetsData.totalPoints || 0;
                
                if (preSeasonPoints > 0) {
                    const newTotalPoints = totalPoints - preSeasonPoints;
                    batch.update(userDoc.ref, {
                        preSeasonPoints: 0,
                        totalPoints: newTotalPoints < 0 ? 0 : newTotalPoints
                    });
                }
            }
            
            await batch.commit();
            
            setSeasonResults({
                champion: '',
                cupWinner: '',
                relegation1: '',
                relegation2: '',
                topScorer: '',
                topAssists: ''
            });
            
            await loadData();
            alert('כל בחירות סוף העונה אופסו בהצלחה! הנקודות מהימורים מקדימים הורדו מכל המשתמשים.');
        } catch (error) {
            console.error('Error resetting season results:', error);
            alert('שגיאה באיפוס בחירות סוף העונה.');
        }
    };

    // פונקציה לשמירת שעת סגירת הימורים מקדימים
    const handleSaveSeasonStart = async () => {
        if (!seasonStart) return;
        try {
            const seasonRef = doc(db, 'season', currentSeason);
            // שמור כ-ISO string
            await updateDoc(seasonRef, { seasonStart });
            alert('שעת סגירת ההימורים המקדימים עודכנה בהצלחה!');
        } catch (error) {
            alert('שגיאה בעדכון שעת סגירת ההימורים.');
        }
    };

    const handleOpenNewSeason = async () => {
        const activeId = config?.activeSeasonId ?? currentSeason;
        const newSeasonId = getNextSeasonId(activeId);

        if (!window.confirm(`לפתוח את עונת ${formatSeasonDisplay(newSeasonId)}?\nהמשתמשים יוכלו להיכנס לאפליקציה ולצפות בטבלת עונת ${formatSeasonDisplay(activeId)}.`)) {
            return;
        }

        setIsOpeningSeason(true);
        try {
            await openNewSeason(newSeasonId);
            await refreshConfig();
            await loadAvailableSeasons();
            setCurrentSeason(newSeasonId);
            alert(`עונת ${formatSeasonDisplay(newSeasonId)} נפתחה בהצלחה!`);
            navigate('/');
        } catch (error) {
            console.error('Error opening new season:', error);
            alert('שגיאה בפתיחת העונה החדשה.');
        } finally {
            setIsOpeningSeason(false);
        }
    };

    const handleToggleSeasonAccess = async () => {
        const activeId = config?.activeSeasonId ?? currentSeason;
        const opening = !seasonOpen;

        const message = opening
            ? `לפתוח גישה למשתמשים לעונת ${formatSeasonDisplay(activeId)}?\nהמשתמשים יוכלו להיכנס לאפליקציה.`
            : 'להכניס את האפליקציה למצב "בבנייה" ולחסום גישה למשתמשים רגילים?';

        if (!window.confirm(message)) return;

        setIsTogglingAccess(true);
        try {
            await setSeasonOpen(opening);
            await refreshConfig();
            alert(opening ? 'הגישה נפתחה למשתמשים.' : 'האפליקציה הועברה למצב בבנייה.');
        } catch (error) {
            console.error('Error toggling season access:', error);
            alert('שגיאה בעדכון מצב הגישה.');
        } finally {
            setIsTogglingAccess(false);
        }
    };

    const handleActiveSeasonChange = async (seasonId: string) => {
        if (!seasonId || seasonId === config?.activeSeasonId) return;

        if (!window.confirm(`להגדיר את עונת ${formatSeasonDisplay(seasonId)} כעונה הנוכחית לכל המשתמשים?`)) {
            return;
        }

        setIsChangingSeason(true);
        try {
            await setActiveSeason(seasonId);
            await refreshConfig();
            setCurrentSeason(seasonId);
            await loadData();
            alert(`עונת ${formatSeasonDisplay(seasonId)} הוגדרה כעונה הנוכחית.\n${seasonOpen ? '' : 'שים לב: הגישה למשתמשים עדיין סגורה — לחץ "פתח גישה למשתמשים".'}`);
        } catch (error) {
            console.error('Error changing active season:', error);
            alert('שגיאה בעדכון העונה הנוכחית.');
        } finally {
            setIsChangingSeason(false);
        }
    };

    const seasonOptions = sortSeasonIdsDesc(
        Array.from(new Set([config?.activeSeasonId ?? currentSeason, ...availableSeasons].filter(Boolean)))
    );

    const getDefaultExtensionDeadline = (): string => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(tomorrow);
        const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
        return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
    };

    const openExtensionPanel = (roundNumber: number) => {
        setExtensionRoundNumber(roundNumber);
        setExtensionTargetUserId('');
        setExtensionDeadline(getDefaultExtensionDeadline());
    };

    const closeExtensionPanel = () => {
        setExtensionRoundNumber(null);
        setExtensionTargetUserId('');
        setExtensionDeadline('');
    };

    const handleGrantExtension = async (roundNumber: number) => {
        if (!extensionTargetUserId) {
            alert('בחר משתמש');
            return;
        }
        if (!extensionDeadline) {
            alert('הזן תאריך ושעה לסגירת ההארכה');
            return;
        }

        const targetUser = users.find(u => u.uid === extensionTargetUserId);
        const userLabel = targetUser?.displayName || targetUser?.email || extensionTargetUserId;

        if (!window.confirm(`לפתוח את ההימורים במחזור ${roundNumber} עבור ${userLabel} עד ${new Date(extensionDeadline).toLocaleString('he-IL')}?`)) {
            return;
        }

        setIsGrantingExtension(true);
        try {
            await grantUserBettingExtension(roundNumber, extensionTargetUserId, extensionDeadline);
            await loadData();
            alert(`חלון ההימורים נפתח עבור ${userLabel}.`);
            setExtensionTargetUserId('');
        } catch (error) {
            console.error('Error granting extension:', error);
            alert('שגיאה בפתיחת חלון ההימורים.');
        } finally {
            setIsGrantingExtension(false);
        }
    };

    const handleRevokeExtension = async (roundNumber: number, targetUserId: string) => {
        const targetUser = users.find(u => u.uid === targetUserId);
        const userLabel = targetUser?.displayName || targetUser?.email || targetUserId;

        if (!window.confirm(`לבטל את הארכת ההימורים של ${userLabel} למחזור ${roundNumber}?`)) {
            return;
        }

        try {
            await revokeUserBettingExtension(roundNumber, targetUserId);
            await loadData();
        } catch (error) {
            console.error('Error revoking extension:', error);
            alert('שגיאה בביטול ההארכה.');
        }
    };

    if (loading) return <LoadingScreen label="טוען פאנל ניהול..." />;

    return (
        <PageShell admin>
                <PageHeader title="ניהול מערכת" subtitle={`עונה ${formatSeasonDisplay(config?.activeSeasonId ?? currentSeason)}`} />

                <Card>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <label htmlFor="active-season" className="mb-1.5 block text-sm font-medium text-foreground">
                                עונה נוכחית (לכל המשתמשים)
                            </label>
                            <select
                                id="active-season"
                                className="app-select"
                                value={config?.activeSeasonId ?? currentSeason}
                                onChange={(e) => handleActiveSeasonChange(e.target.value)}
                                disabled={isChangingSeason || seasonOptions.length === 0}
                            >
                                {seasonOptions.length === 0 ? (
                                    <option value={currentSeason}>{formatSeasonDisplay(currentSeason)}</option>
                                ) : (
                                    seasonOptions.map((seasonId) => (
                                        <option key={seasonId} value={seasonId}>
                                            {formatSeasonDisplay(seasonId)}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                        {isChangingSeason && (
                            <p className="text-xs text-muted-foreground">מעדכן עונה...</p>
                        )}
                    </CardContent>
                </Card>

                <Card className={seasonOpen ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}>
                    <CardContent className="space-y-3 p-4">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">גישת משתמשים לאפליקציה</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {seasonOpen
                                        ? `פתוח — משתמשים רואים את עונת ${formatSeasonDisplay(config?.activeSeasonId ?? currentSeason)}`
                                        : 'סגור — משתמשים רואים מסך "בבנייה"'}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    בחירת עונה נוכחית לבדה לא פותחת גישה. יש ללחוץ כאן.
                                </p>
                            </div>
                            <Button
                                variant={seasonOpen ? 'outline' : 'default'}
                                onClick={handleToggleSeasonAccess}
                                disabled={isTogglingAccess}
                                className="mt-2 w-full shrink-0 sm:mt-0 sm:w-auto"
                            >
                                {isTogglingAccess
                                    ? 'מעדכן...'
                                    : seasonOpen
                                        ? 'סגור גישה (בבנייה)'
                                        : 'פתח גישה למשתמשים'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="admin-tab-bar">
                    <button type="button" onClick={() => setActiveTab('rounds')}
                        className={`admin-tab ${activeTab === 'rounds' ? 'admin-tab-active' : ''}`}>
                        <Calendar size={14} className="inline ml-1" />מחזורים
                    </button>
                    <button type="button" onClick={() => setActiveTab('results')}
                        className={`admin-tab ${activeTab === 'results' ? 'admin-tab-active' : ''}`}>
                        <Target size={14} className="inline ml-1" />תוצאות
                    </button>
                    <button type="button" onClick={() => setActiveTab('cancellations')}
                        className={`admin-tab ${activeTab === 'cancellations' ? 'admin-tab-active' : ''}`}>
                        <X size={14} className="inline ml-1" />ביטולים
                    </button>
                    <button type="button" onClick={() => setActiveTab('season')}
                        className={`admin-tab ${activeTab === 'season' ? 'admin-tab-active' : ''}`}>
                        <Trophy size={14} className="inline ml-1" />סיום עונה
                    </button>
                    <button type="button" onClick={() => setActiveTab('users')}
                        className={`admin-tab ${activeTab === 'users' ? 'admin-tab-active' : ''}`}>
                        <Users size={14} className="inline ml-1" />משתמשים
                    </button>
                </div>

                {/* Rounds Management */}
                {activeTab === 'rounds' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">ניהול מחזורים</h2>
                            <div className="flex gap-2">
                                <Button onClick={handleAddRound} className="flex items-center gap-2">
                                    <Plus size={16} />
                                    הוסף מחזור
                                </Button>
                            </div>
                        </div>

                        {rounds.length === 0 ? (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <div className="mb-4">
                                        <Calendar size={48} className="mx-auto text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-medium text-foreground mb-2">אין מחזורים</h3>
                                    <p className="text-muted-foreground mb-4">עליך ליצור מחזורים תחילה כדי להתחיל לנהל את העונה</p>
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
                                    <Card key={round.number}>
                                        <CardHeader>
                                            <CardTitle className="flex items-center justify-between">
                                                <span>{round.name || `מחזור ${round.number}`}</span>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEditRound(round)}
                                                        className="text-sky-400 hover:text-sky-300"
                                                        title="ערוך שעת סגירת הימורים"
                                                    >
                                                        <Clock size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => extensionRoundNumber === round.number ? closeExtensionPanel() : openExtensionPanel(round.number)}
                                                        className="text-amber-400 hover:text-amber-300"
                                                        title="פתח חלון הימורים למשתמש ספציפי"
                                                    >
                                                        <UserPlus size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEditMatches(round.number)}
                                                        className="text-emerald-400 hover:text-emerald-300"
                                                        title="ערוך משחקים"
                                                    >
                                                        <Edit size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDeleteRound(round.number)}
                                                        className="text-red-400 hover:text-red-300"
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
                                                        <label className="block text-sm font-medium text-foreground mb-1">
                                                            שם המחזור
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={roundEditData.name}
                                                            onChange={(e) => setRoundEditData(prev => ({ ...prev, name: e.target.value }))}
                                                            className="app-select text-sm"
                                                            placeholder="למשל: מחזור 1 - עונה סדירהפתיחה, מחזור 1 - פלייאוף עליון וכו'"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-foreground mb-1">
                                                            תאריך ושעת תחילת מחזור (וגם סגירת הימורים)
                                                        </label>
                                                        <input
                                                            type="datetime-local"
                                                            value={roundEditData.startTime}
                                                            onChange={(e) => setRoundEditData(prev => ({ ...prev, startTime: e.target.value }))}
                                                            className="app-select text-sm"
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
                                                    <div className="text-sm text-muted-foreground mb-3">
                                                        <p className="font-medium mb-2">עריכת משחקים:</p>
                                                        {(round.matchesDetails || []).map((match, index) => (
                                                            <div key={match.uid} className="p-3 border rounded-lg bg-secondary/60 space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm font-medium">משחק {index + 1}</span>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleDeleteMatch(round.number, match.uid)}
                                                                        className="text-red-400 hover:text-red-300"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </Button>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div>
                                                                        <label className="block text-xs text-muted-foreground mb-1">קבוצת בית</label>
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
                                                                        <label className="block text-xs text-muted-foreground mb-1">קבוצת חוץ</label>
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
                                                                {/* שדה תאריך הוסר */}
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
                                                    <div className="text-sm text-muted-foreground">
                                                        <p>משחקים: {round.matchesDetails?.length || 0}</p>
                                                        {round.startTime && (
                                                            <p>תחילת מחזור: {new Date(round.startTime).toLocaleString('he-IL')}</p>
                                                        )}
                                                    </div>
                                                    {(round.matchesDetails || []).length > 0 && (
                                                        <div className="text-xs text-muted-foreground">
                                                            <p className="font-medium mb-1">משחקי המחזור:</p>
                                                            {(round.matchesDetails || []).slice(0, 3).map((match) => (
                                                                <AdminMatchRow
                                                                    key={match.uid}
                                                                    homeTeamId={match.homeTeamId}
                                                                    awayTeamId={match.awayTeamId}
                                                                    homeName={teams.find(t => t.uid === match.homeTeamId)?.name || match.homeTeam || '—'}
                                                                    awayName={teams.find(t => t.uid === match.awayTeamId)?.name || match.awayTeam || '—'}
                                                                    className="border-0 bg-transparent p-0 shadow-none"
                                                                />
                                                            ))}
                                                            {(round.matchesDetails || []).length > 3 && (
                                                                <p className="text-xs text-muted-foreground">ועוד {(round.matchesDetails || []).length - 3} משחקים...</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {(() => {
                                                        const extensions = Object.entries(round.bettingExtensions || {}) as [string, string][];
                                                        const activeExtensions = extensions.filter(([, until]) => !isDeadlinePassed(until));
                                                        if (activeExtensions.length === 0) return null;
                                                        return (
                                                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                                                                <p className="mb-1 font-semibold text-amber-300">
                                                                    חלונות הימורים פעילים ({activeExtensions.length}):
                                                                </p>
                                                                <ul className="space-y-1">
                                                                    {activeExtensions.map(([uid, until]) => {
                                                                        const u = users.find(x => x.uid === uid);
                                                                        return (
                                                                            <li key={uid} className="flex items-center justify-between gap-2">
                                                                                <span className="truncate">
                                                                                    {u?.displayName || u?.email || uid}
                                                                                    <span className="text-muted-foreground"> · עד {formatIsraelDateTime(until)}</span>
                                                                                </span>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    onClick={() => handleRevokeExtension(round.number, uid)}
                                                                                    className="h-6 w-6 shrink-0 p-0 text-red-400 hover:text-red-300"
                                                                                    title="בטל הארכה"
                                                                                >
                                                                                    <X size={14} />
                                                                                </Button>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        );
                                                    })()}

                                                    {extensionRoundNumber === round.number && (
                                                        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                                                            <div className="flex items-center justify-between">
                                                                <p className="font-semibold text-amber-300">פתיחת הימורים למשתמש</p>
                                                                <Button variant="ghost" size="sm" onClick={closeExtensionPanel} className="h-6 w-6 p-0">
                                                                    <X size={14} />
                                                                </Button>
                                                            </div>
                                                            <div>
                                                                <label className="mb-1 block text-xs font-medium text-muted-foreground">משתמש</label>
                                                                <select
                                                                    value={extensionTargetUserId}
                                                                    onChange={(e) => setExtensionTargetUserId(e.target.value)}
                                                                    className="app-select text-sm"
                                                                >
                                                                    <option value="">בחר משתמש...</option>
                                                                    {users.map(u => (
                                                                        <option key={u.uid} value={u.uid}>
                                                                            {u.displayName || u.email || u.uid}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="mb-1 block text-xs font-medium text-muted-foreground">סגירת חלון ההימורים (זמן ישראל)</label>
                                                                <input
                                                                    type="datetime-local"
                                                                    value={extensionDeadline}
                                                                    onChange={(e) => setExtensionDeadline(e.target.value)}
                                                                    className="app-select text-sm"
                                                                />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleGrantExtension(round.number)}
                                                                    disabled={isGrantingExtension || !extensionTargetUserId || !extensionDeadline}
                                                                    className="flex-1"
                                                                >
                                                                    {isGrantingExtension ? 'פותח...' : 'פתח חלון הימורים'}
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={closeExtensionPanel}
                                                                    className="flex-1"
                                                                >
                                                                    ביטול
                                                                </Button>
                                                            </div>
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
                            <h2 className="text-xl font-semibold">תוצאות מחזורים</h2>
                            {/* כפתור רענון הוסר */}
                        </div>
                        
                        {rounds.length === 0 ? (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <div className="mb-4">
                                        <Target size={48} className="mx-auto text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-medium text-foreground mb-2">אין מחזורים</h3>
                                    <p className="text-muted-foreground mb-4">עליך ליצור מחזורים תחילה לפני שתוכל להזין תוצאות</p>
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
                                <Card key={round.number}>
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between">
                                            <span>{round.name || `מחזור ${round.number}`}</span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleEditResults(round.number)}
                                                    className="text-sky-400"
                                                >
                                                    הזן תוצאות
                                                </Button>
                                                {(round.matchesDetails || []).some(match => match.pointsCalculated) && (
                                                    <span className="text-green-600 text-sm">
                                                        ✓ {round.matchesDetails?.filter(match => match.pointsCalculated).length || 0} משחקים חושבו
                                                    </span>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleResetRoundResults(round.number)}
                                                    className="text-orange-600 hover:text-orange-700"
                                                >
                                                    אפס תוצאות מחזור
                                                </Button>
                                            </div>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {(round.matchesDetails || []).map((match) => (
                                                <AdminMatchRow
                                                    key={match.uid}
                                                    homeTeamId={match.homeTeamId}
                                                    awayTeamId={match.awayTeamId}
                                                    homeName={teams.find(t => t.uid === match.homeTeamId)?.name || match.homeTeam || 'קבוצה לא נבחרה'}
                                                    awayName={teams.find(t => t.uid === match.awayTeamId)?.name || match.awayTeam || 'קבוצה לא נבחרה'}
                                                    isCancelled={match.isCancelled}
                                                >
                                                    {editingResults === round.number ? (
                                                        match.isCancelled ? (
                                                            <span className="text-sm font-bold text-red-400">משחק זה בוטל</span>
                                                        ) : (
                                                            <>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="20"
                                                                    placeholder="0"
                                                                    className="admin-score-input"
                                                                    defaultValue={match.actualHomeScore ?? ''}
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
                                                                <span className="text-lg font-semibold text-muted-foreground">-</span>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="20"
                                                                    placeholder="0"
                                                                    className="admin-score-input"
                                                                    defaultValue={match.actualAwayScore ?? ''}
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
                                                        )
                                                    ) : (
                                                        <div className="text-center">
                                                            {(match.actualHomeScore !== undefined && match.actualHomeScore !== null) && (match.actualAwayScore !== undefined && match.actualAwayScore !== null) ? (
                                                                <div>
                                                                    <p className="font-semibold">
                                                                        {match.actualHomeScore} - {match.actualAwayScore}
                                                                    </p>
                                                                    {match.pointsCalculated && (
                                                                        <p className="text-xs text-green-600">✓ חושבו נקודות</p>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <p className="text-muted-foreground">לא הוזן</p>
                                                            )}
                                                            {match.isCancelled && (
                                                                <div className="mt-1 font-bold text-red-400">משחק זה בוטל</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </AdminMatchRow>
                                            ))}
                                            {(round.matchesDetails || []).length === 0 && (
                                                <div className="text-center py-6 text-muted-foreground">
                                                    <div className="mb-2">
                                                        <Settings size={24} className="mx-auto text-muted-foreground" />
                                                    </div>
                                                    <p className="font-medium">אין משחקים במחזור זה</p>
                                                </div>
                                            )}
                                            {editingResults === round.number && (
                                                <div className="flex gap-2 justify-end">
                                                    {/* 5. כפתור שמירת תוצאות עם חיווי */}
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleSaveResults(round.number)}
                                                        disabled={isCalculatingPoints}
                                                    >
                                                        {isCalculatingPoints ? (
                                                            <>
                                                                <span className="animate-spin inline-block mr-2 w-4 h-4 border-b-2 border-blue-600 rounded-full"></span>
                                                                מחשב נקודות...
                                                            </>
                                                        ) : (
                                                            'שמור תוצאות'
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setEditingResults(null)}
                                                        disabled={isCalculatingPoints}
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

                {/* Match Cancellations Management */}
                {activeTab === 'cancellations' && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">ניהול ביטול משחקים</h2>
                        <p className="text-muted-foreground mb-4">
                            כאן תוכל לבטל משחקים. אם המשחק כבר חושב ונקודות חושבו עבורו, הנקודות יורדו מהמשתמשים.
                        </p>

                        {rounds.length === 0 ? (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <div className="mb-4">
                                        <X size={48} className="mx-auto text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-medium text-foreground mb-2">אין מחזורים</h3>
                                    <p className="text-muted-foreground">אין מחזורים זמינים לביטול משחקים</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {rounds.map((round) => (
                                    <Card key={round.number}>
                                        <CardHeader>
                                            <CardTitle>{round.name || `מחזור ${round.number}`}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-3">
                                                {(round.matchesDetails || []).map((match) => (
                                                    <AdminMatchRow
                                                        key={match.uid}
                                                        homeTeamId={match.homeTeamId}
                                                        awayTeamId={match.awayTeamId}
                                                        homeName={teams.find(t => t.uid === match.homeTeamId)?.name || match.homeTeam || 'קבוצה לא נבחרה'}
                                                        awayName={teams.find(t => t.uid === match.awayTeamId)?.name || match.awayTeam || 'קבוצה לא נבחרה'}
                                                        isCancelled={match.isCancelled}
                                                    >
                                                        {match.isCancelled ? (
                                                            <>
                                                                <span className="text-sm font-bold text-red-400">משחק זה בוטל</span>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={async () => {
                                                                        try {
                                                                            await restoreCancelledMatch(round.number, match.uid);
                                                                            await loadData();
                                                                            alert('המשחק הוחזר בהצלחה!');
                                                                        } catch (error) {
                                                                            console.error('Error restoring match:', error);
                                                                            alert('שגיאה בהחזרת המשחק. אנא נסה שוב.');
                                                                        }
                                                                    }}
                                                                    className="text-emerald-400 hover:text-emerald-300"
                                                                >
                                                                    החזר משחק
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="text-center">
                                                                    {(match.actualHomeScore !== undefined && match.actualHomeScore !== null) &&
                                                                     (match.actualAwayScore !== undefined && match.actualAwayScore !== null) ? (
                                                                        <div>
                                                                            <p className="font-semibold">
                                                                                {match.actualHomeScore} - {match.actualAwayScore}
                                                                            </p>
                                                                            {match.pointsCalculated && (
                                                                                <p className="text-xs text-green-600">✓ חושבו נקודות</p>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-muted-foreground">לא הוזן</p>
                                                                    )}
                                                                </div>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleCancelMatch(round.number, match.uid)}
                                                                    className="text-red-400 hover:text-red-300"
                                                                >
                                                                    בטל משחק
                                                                </Button>
                                                            </>
                                                        )}
                                                    </AdminMatchRow>
                                                ))}
                                                {(round.matchesDetails || []).length === 0 && (
                                                    <div className="text-center py-6 text-muted-foreground">
                                                        <div className="mb-2">
                                                            <X size={24} className="mx-auto text-muted-foreground" />
                                                        </div>
                                                        <p className="font-medium">אין משחקים במחזור זה</p>
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Season End Management */}
                {activeTab === 'season' && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">סיום עונה</h2>

                        {/* פתיחת עונה חדשה */}
                        {!seasonOpen && (
                            <Card className="bg-amber-50 border-amber-200 rounded-xl shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-amber-900">פתיחת עונה חדשה</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-sm text-amber-800">
                                        האפליקציה כרגע במצב "בבנייה" עבור עונת{' '}
                                        {formatSeasonDisplay(getNextSeasonId(config?.activeSeasonId ?? currentSeason))}.
                                        {' '}לאחר פתיחת העונה, המשתמשים יוכלו להיכנס ולצפות בטבלה הסופית של עונת{' '}
                                        {formatSeasonDisplay(config?.activeSeasonId ?? currentSeason)}.
                                    </p>
                                    <Button
                                        onClick={handleOpenNewSeason}
                                        disabled={isOpeningSeason}
                                        className="bg-amber-600 hover:bg-amber-700"
                                    >
                                        {isOpeningSeason
                                            ? 'פותח עונה...'
                                            : `פתח עונת ${formatSeasonDisplay(getNextSeasonId(config?.activeSeasonId ?? currentSeason))}`}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {seasonOpen && (config?.previousSeasonIds?.length ?? 0) > 0 && (
                            <Card className="bg-emerald-500/10 border-emerald-500/25 rounded-xl shadow-sm">
                                <CardContent className="p-4">
                                    <p className="text-sm text-emerald-300">
                                        עונת {formatSeasonDisplay(config!.activeSeasonId)} פתוחה.
                                        {' '}טבלאות עונות קודמות זמינות בדף הבית:{' '}
                                        {config!.previousSeasonIds.map((id) => formatSeasonDisplay(id)).join(', ')}.
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* שעת סגירת ההימורים המקדימים - בראש הטאב */}
                        <div className="flex flex-col items-center justify-center mb-6">
                            <label className="block text-base font-bold text-foreground mb-2">שעת סגירת ההימורים המקדימים</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="datetime-local"
                                    value={seasonStart}
                                    onChange={e => setSeasonStart(e.target.value)}
                                    className="border rounded px-3 py-2 text-sm"
                                />
                                <Button variant="outline" onClick={handleSaveSeasonStart} disabled={!seasonStart}>
                                    שמור שעה
                                </Button>
                            </div>
                            {seasonStart && (
                                <div className="text-xs text-muted-foreground mt-1">שעה נוכחית: {new Date(seasonStart).toLocaleString('he-IL')}</div>
                            )}
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>הזנת תוצאות סוף עונה</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">

                                
                                {/* תוצאות קבוצות */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* אלופה */}
                                    <div className={`p-4 rounded-lg border ${seasonResults.champion ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-secondary/60 border-border'}`}>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            <Trophy size={16} className="inline mr-2" />
                                            אלופה
                                            {seasonResults.champion && (
                                                <span className="ml-2 text-green-700 text-xs font-bold inline-flex items-center">✓ הוזן</span>
                                            )}
                                        </label>
                                        <select
                                            value={seasonResults.champion}
                                            onChange={(e) => setSeasonResults(prev => ({ ...prev, champion: e.target.value }))}
                                            className={`app-select ${seasonResults.champion ? 'border-emerald-500/40' : ''}`}
                                        >
                                            <option value="">בחר קבוצה</option>
                                            {teams.filter((team: any) => team.uid !== 'Q7TYlRWO48TYKm7IPZnj').map((team: any) => (
                                                <option key={team.uid} value={team.uid}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                        {seasonResults.champion && (
                                            <div className="mt-2 p-2 bg-emerald-500/15 rounded-lg flex items-center gap-2">
                                                <TeamLogo teamId={seasonResults.champion} size="sm" />
                                                <span className="text-sm font-medium text-green-800">
                                                    {teams.find(t => t.uid === seasonResults.champion)?.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {/* זוכת גביע */}
                                    <div className={`p-4 rounded-lg border ${seasonResults.cupWinner ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-secondary/60 border-border'}`}>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            <Trophy size={16} className="inline mr-2" />
                                            זוכת גביע
                                            {seasonResults.cupWinner && (
                                                <span className="ml-2 text-green-700 text-xs font-bold inline-flex items-center">✓ הוזן</span>
                                            )}
                                        </label>
                                        <select
                                            value={seasonResults.cupWinner}
                                            onChange={(e) => setSeasonResults(prev => ({ ...prev, cupWinner: e.target.value }))}
                                            className={`app-select ${seasonResults.cupWinner ? 'border-emerald-500/40' : ''}`}
                                        >
                                            <option value="">בחר קבוצה</option>
                                            {teams.map((team: any) => (
                                                <option key={team.uid} value={team.uid}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                        {seasonResults.cupWinner && (
                                            <div className="mt-2 p-2 bg-emerald-500/15 rounded-lg flex items-center gap-2">
                                                <TeamLogo teamId={seasonResults.cupWinner} size="sm" />
                                                <span className="text-sm font-medium text-green-800">
                                                    {teams.find(t => t.uid === seasonResults.cupWinner)?.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {/* יורדת ראשונה */}
                                    <div className={`p-4 rounded-lg border ${seasonResults.relegation1 ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-secondary/60 border-border'}`}>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            <TrendingDown size={16} className="inline mr-2" />
                                            יורדת ראשונה
                                            {seasonResults.relegation1 && (
                                                <span className="ml-2 text-green-700 text-xs font-bold inline-flex items-center">✓ הוזן</span>
                                            )}
                                        </label>
                                        <select
                                            value={seasonResults.relegation1}
                                            onChange={(e) => setSeasonResults(prev => ({ ...prev, relegation1: e.target.value }))}
                                            className={`app-select ${seasonResults.relegation1 ? 'border-emerald-500/40' : ''}`}
                                        >
                                            <option value="">בחר קבוצה</option>
                                            {teams.filter((team: any) => team.uid !== 'Q7TYlRWO48TYKm7IPZnj').map((team: any) => (
                                                <option key={team.uid} value={team.uid}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                        {seasonResults.relegation1 && (
                                            <div className="mt-2 p-2 bg-emerald-500/15 rounded-lg flex items-center gap-2">
                                                <TeamLogo teamId={seasonResults.relegation1} size="sm" />
                                                <span className="text-sm font-medium text-green-800">
                                                    {teams.find(t => t.uid === seasonResults.relegation1)?.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {/* יורדת שנייה */}
                                    <div className={`p-4 rounded-lg border ${seasonResults.relegation2 ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-secondary/60 border-border'}`}>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            <TrendingDown size={16} className="inline mr-2" />
                                            יורדת שנייה
                                            {seasonResults.relegation2 && (
                                                <span className="ml-2 text-green-700 text-xs font-bold inline-flex items-center">✓ הוזן</span>
                                            )}
                                        </label>
                                        <select
                                            value={seasonResults.relegation2}
                                            onChange={(e) => setSeasonResults(prev => ({ ...prev, relegation2: e.target.value }))}
                                            className={`app-select ${seasonResults.relegation2 ? 'border-emerald-500/40' : ''}`}
                                        >
                                            <option value="">בחר קבוצה</option>
                                            {teams.filter((team: any) => team.uid !== 'Q7TYlRWO48TYKm7IPZnj').map((team: any) => (
                                                <option key={team.uid} value={team.uid}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                        {seasonResults.relegation2 && (
                                            <div className="mt-2 p-2 bg-emerald-500/15 rounded-lg flex items-center gap-2">
                                                <TeamLogo teamId={seasonResults.relegation2} size="sm" />
                                                <span className="text-sm font-medium text-green-800">
                                                    {teams.find(t => t.uid === seasonResults.relegation2)?.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* תוצאות שחקנים */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* מלך שערים */}
                                    <div className={`p-4 rounded-lg border ${seasonResults.topScorer ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-secondary/60 border-border'}`}>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            <Target size={16} className="inline mr-2" />
                                            מלך שערים
                                            {seasonResults.topScorer && (
                                                <span className="ml-2 text-green-700 text-xs font-bold inline-flex items-center">✓ הוזן</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={playerSearchTerm}
                                                onChange={(e) => setPlayerSearchTerm(e.target.value)}
                                                className={`app-select ${seasonResults.topScorer ? 'border-emerald-500/40' : ''}`}
                                                placeholder="חפש שחקן..."
                                            />
                                            {playerSearchTerm && (
                                                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                                                    {players
                                                        .filter(player => 
                                                            player.name.toLowerCase().includes(playerSearchTerm.toLowerCase())
                                                        )
                                                        .map(player => (
                                                            <div
                                                                key={player.uid}
                                                                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-secondary/80"
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
                                            <div className="mt-2 p-2 bg-emerald-500/15 rounded-lg flex items-center gap-2">
                                                <TeamLogo teamId={players.find(p => p.uid === seasonResults.topScorer)?.teamId || ''} size="sm" />
                                                <span className="text-sm font-medium text-green-800">
                                                    {players.find(p => p.uid === seasonResults.topScorer)?.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* מלך בישולים */}
                                    <div className={`p-4 rounded-lg border ${seasonResults.topAssists ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-secondary/60 border-border'}`}>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            <Target size={16} className="inline mr-2" />
                                            מלך בישולים
                                            {seasonResults.topAssists && (
                                                <span className="ml-2 text-green-700 text-xs font-bold inline-flex items-center">✓ הוזן</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={assistSearchTerm}
                                                onChange={(e) => setAssistSearchTerm(e.target.value)}
                                                className={`app-select ${seasonResults.topAssists ? 'border-emerald-500/40' : ''}`}
                                                placeholder="חפש שחקן..."
                                            />
                                            {assistSearchTerm && (
                                                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                                                    {players
                                                        .filter(player => 
                                                            player.name.toLowerCase().includes(assistSearchTerm.toLowerCase())
                                                        )
                                                        .map(player => (
                                                            <div
                                                                key={player.uid}
                                                                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-secondary/80"
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
                                            <div className="mt-2 p-2 bg-emerald-500/15 rounded-lg flex items-center gap-2">
                                                <TeamLogo teamId={players.find(p => p.uid === seasonResults.topAssists)?.teamId || ''} size="sm" />
                                                <span className="text-sm font-medium text-green-800">
                                                    {players.find(p => p.uid === seasonResults.topAssists)?.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                

                                
                                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-stretch">
                                    <Button
                                        onClick={handleSaveSeasonEnd}
                                        disabled={!isSeasonEndFormValid()}
                                        className={`h-11 w-full gap-2 text-sm sm:flex-1 ${!isSeasonEndFormValid() ? 'cursor-not-allowed opacity-50' : ''}`}
                                    >
                                        <Trophy size={16} className="shrink-0" />
                                        <span className="truncate">שמור תוצאות סוף עונה</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={handleResetAllSeasonResults}
                                        className="h-11 w-full gap-2 border-orange-500/40 text-sm text-orange-700 dark:text-orange-400 sm:flex-1"
                                    >
                                        <span className="truncate">איפוס כל בחירות סוף עונה</span>
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
                        
                        <Card>
                            <CardContent>
                                <div className="space-y-3">
                                    {users.map((user) => (
                                        <div
                                            key={user.uid}
                                            className="flex items-center justify-between p-3 rounded-lg border bg-secondary/60"
                                        >
                                            <div>
                                                <p className="font-medium">{user.displayName || user.email}</p>
                                                <p className="text-sm text-muted-foreground">{user.email}</p>
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
                                                    className="text-sky-400 hover:text-sky-300"
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
                    <Card>
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-muted-foreground">מחזורים</p>
                            <p className="text-2xl font-bold text-sky-400">{rounds.length}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-muted-foreground">משחקים</p>
                            <p className="text-2xl font-bold text-green-600">
                                {rounds.reduce((sum, round) => sum + (round.matchesDetails?.length || 0), 0)}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-muted-foreground">משתמשים</p>
                            <p className="text-2xl font-bold text-purple-600">{users.length}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4 text-center space-y-2">
                            <p className="text-sm text-muted-foreground">מנהלים</p>
                            <p className="text-2xl font-bold text-orange-600">
                                {users.filter(u => u.role === 'admin').length}
                            </p>
                        </CardContent>
                    </Card>
                </div>

            {/* Modal להוספת משחקים למחזור חדש */}
            {showAddMatchesModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="app-card mx-4 max-h-[90vh] w-full max-w-4xl overflow-y-auto shadow-xl">
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
                            <div className="text-sm text-muted-foreground">
                                <p>הוסף משחקים למחזור החדש. עליך להוסיף לפחות משחק אחד.</p>
                            </div>
                            
                            {newMatches.map((match, index) => (
                                <div key={index} className="p-4 border rounded-lg bg-secondary/60 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">משחק {index + 1}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveNewMatch(index)}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1">
                                                קבוצת בית
                                            </label>
                                            <select
                                                value={match.homeTeamId}
                                                onChange={(e) => {
                                                    const team = teams.find(t => t.uid === e.target.value);
                                                    handleUpdateNewMatch(index, 'homeTeamId', e.target.value);
                                                    handleUpdateNewMatch(index, 'homeTeam', team?.name || '');
                                                }}
                                                className="app-select"
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
                                            <label className="block text-sm font-medium text-foreground mb-1">
                                                קבוצת חוץ
                                            </label>
                                            <select
                                                value={match.awayTeamId}
                                                onChange={(e) => {
                                                    const team = teams.find(t => t.uid === e.target.value);
                                                    handleUpdateNewMatch(index, 'awayTeamId', e.target.value);
                                                    handleUpdateNewMatch(index, 'awayTeam', team?.name || '');
                                                }}
                                                className="app-select"
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
                                            <label className="block text-sm font-medium text-foreground mb-1">
                                                תאריך
                                            </label>
                                            <input
                                                type="date"
                                                value={match.date}
                                                onChange={(e) => handleUpdateNewMatch(index, 'date', e.target.value)}
                                                className="app-select"
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
                        
                        <div className="p-6 border-t bg-secondary/60 flex gap-3">
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
        </PageShell>
    );
} 