import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Trophy, Medal, Award, History } from 'lucide-react';
import { getLeaderboard } from '@/lib/playerBets';
import { formatSeasonDisplay, listSeasonIds, sortSeasonIdsDesc } from '@/lib/season';
import type { PlayerBets } from '@/types';

interface PreviousSeasonTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional explicit seasonId; if provided the picker opens preselected to it */
  seasonId?: string | null;
  /** Active season id to exclude from the picker */
  excludeSeasonId?: string;
  /** Optional explicit list of season ids; if omitted, loaded from Firestore */
  availableSeasonIds?: string[];
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1: return <Trophy className="h-4 w-4 text-amber-400" />;
    case 2: return <Medal className="h-4 w-4 text-slate-400" />;
    case 3: return <Award className="h-4 w-4 text-orange-400" />;
    default: return <span className="text-xs font-medium text-muted-foreground">#{rank}</span>;
  }
}

export function getPreviousSeasonDismissKey(seasonId: string) {
  return `dismissedPreviousSeasonTable_${seasonId}`;
}

export default function PreviousSeasonTableModal({
  isOpen,
  onClose,
  seasonId: initialSeasonId,
  excludeSeasonId,
  availableSeasonIds,
}: PreviousSeasonTableModalProps) {
  const [seasons, setSeasons] = useState<string[]>(availableSeasonIds ?? []);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(initialSeasonId ?? null);
  const [leaderboard, setLeaderboard] = useState<PlayerBets[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const loadSeasons = async () => {
      if (availableSeasonIds && availableSeasonIds.length > 0) {
        const list = sortSeasonIdsDesc(
          availableSeasonIds.filter((id) => id !== excludeSeasonId)
        );
        setSeasons(list);
        if (!selectedSeasonId && list.length > 0) {
          setSelectedSeasonId(initialSeasonId ?? list[0]);
        }
        return;
      }

      setLoadingSeasons(true);
      try {
        const all = await listSeasonIds();
        const list = sortSeasonIdsDesc(all.filter((id) => id !== excludeSeasonId));
        setSeasons(list);
        if (!selectedSeasonId && list.length > 0) {
          setSelectedSeasonId(initialSeasonId ?? list[0]);
        }
      } catch (error) {
        console.error('Error loading previous seasons:', error);
      } finally {
        setLoadingSeasons(false);
      }
    };

    loadSeasons();
  }, [isOpen, availableSeasonIds, excludeSeasonId, initialSeasonId, selectedSeasonId]);

  useEffect(() => {
    if (!isOpen || !selectedSeasonId) {
      setLeaderboard([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingTable(true);
      try {
        const data = await getLeaderboard(selectedSeasonId);
        if (!cancelled) setLeaderboard(data);
      } catch (error) {
        console.error('Error loading season leaderboard:', error);
        if (!cancelled) setLeaderboard([]);
      } finally {
        if (!cancelled) setLoadingTable(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedSeasonId]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (selectedSeasonId) {
      localStorage.setItem(getPreviousSeasonDismissKey(selectedSeasonId), 'true');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <Card dir="rtl" className="flex max-h-[85vh] w-full max-w-lg flex-col shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/80 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-amber-400" />
            הימורים עונות קודמות
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8 shrink-0">
            <X size={18} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 overflow-y-auto scrollbar-none">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              בחר עונה
            </label>
            <select
              value={selectedSeasonId ?? ''}
              onChange={(e) => setSelectedSeasonId(e.target.value || null)}
              disabled={loadingSeasons || seasons.length === 0}
              className="app-select text-sm"
            >
              {seasons.length === 0 ? (
                <option value="">
                  {loadingSeasons ? 'טוען עונות...' : 'אין עונות זמינות'}
                </option>
              ) : (
                <>
                  {!selectedSeasonId && <option value="">— בחר עונה —</option>}
                  {seasons.map((id) => (
                    <option key={id} value={id}>
                      עונת {formatSeasonDisplay(id)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {selectedSeasonId && (
            <div className="rounded-xl border border-border/60 bg-card/40">
              <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
                טבלה סופית — עונת {formatSeasonDisplay(selectedSeasonId)}
              </div>
              <div className="p-2">
                {loadingTable ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">טוען טבלה...</p>
                ) : leaderboard.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">אין נתונים לעונה זו</p>
                ) : (
                  <table className="table-compact w-full">
                    <thead>
                      <tr className="border-b border-border/80 text-muted-foreground">
                        <th className="w-14 text-right font-medium">מיקום</th>
                        <th className="text-right font-medium">שם</th>
                        <th className="text-left font-medium">נקודות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry, index) => (
                        <tr key={entry.uid} className="border-b border-border/40">
                          <td className="py-2">{getRankIcon(index + 1)}</td>
                          <td className="py-2 font-medium">{entry.displayName || 'שחקן'}</td>
                          <td className="py-2 text-left font-bold text-primary">{entry.totalPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-center pt-1">
            <Button variant="outline" size="sm" onClick={handleClose}>סגור</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
