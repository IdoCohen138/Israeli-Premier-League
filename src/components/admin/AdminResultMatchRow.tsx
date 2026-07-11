import { Ban, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TeamLogo from '@/components/TeamLogo';
import { cn } from '@/lib/utils';
import type { Match } from '@/types';

interface AdminResultMatchRowProps {
    match: Match;
    homeName: string;
    awayName: string;
    isEditing: boolean;
    isCalculatingPoints: boolean;
    onHomeScoreChange: (value: string) => void;
    onAwayScoreChange: (value: string) => void;
    onCancel: () => void;
    onRestore: () => void;
}

export default function AdminResultMatchRow({
    match,
    homeName,
    awayName,
    isEditing,
    isCalculatingPoints,
    onHomeScoreChange,
    onAwayScoreChange,
    onCancel,
    onRestore,
}: AdminResultMatchRowProps) {
    const hasSavedScore =
        match.actualHomeScore !== undefined &&
        match.actualHomeScore !== null &&
        match.actualAwayScore !== undefined &&
        match.actualAwayScore !== null;

    return (
        <div
            className={cn(
                'admin-result-match-card',
                match.isCancelled && 'admin-result-match-card--cancelled'
            )}
        >
            <div className="admin-result-match-action">
                {match.isCancelled ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onRestore}
                        disabled={isCalculatingPoints}
                        className="admin-result-match-action-btn admin-result-match-action-btn--restore"
                        title="החזר משחק"
                        aria-label="החזר משחק"
                    >
                        <RotateCcw size={14} />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        disabled={isCalculatingPoints}
                        className="admin-result-match-action-btn admin-result-match-action-btn--cancel"
                        title="בטל משחק"
                        aria-label="בטל משחק"
                    >
                        <Ban size={14} />
                    </Button>
                )}
            </div>

            <div className="match-bet-grid">
                <div className="match-bet-side">
                    <TeamLogo teamId={match.homeTeamId} size="sm" />
                    <span className="match-bet-team-name">{homeName}</span>
                </div>

                <div className="match-bet-scores">
                    {match.isCancelled ? (
                        <span className="admin-result-match-cancelled-label">בוטל</span>
                    ) : isEditing ? (
                        <>
                            <input
                                type="number"
                                min="0"
                                max="20"
                                placeholder="?"
                                className="bet-input bet-input--match"
                                defaultValue={match.actualHomeScore ?? ''}
                                disabled={isCalculatingPoints}
                                onChange={(e) => onHomeScoreChange(e.target.value)}
                                aria-label={`תוצאה בית ${homeName}`}
                            />
                            <span className="match-bet-colon" aria-hidden>
                                :
                            </span>
                            <input
                                type="number"
                                min="0"
                                max="20"
                                placeholder="?"
                                className="bet-input bet-input--match"
                                defaultValue={match.actualAwayScore ?? ''}
                                disabled={isCalculatingPoints}
                                onChange={(e) => onAwayScoreChange(e.target.value)}
                                aria-label={`תוצאה חוץ ${awayName}`}
                            />
                        </>
                    ) : hasSavedScore ? (
                        <span className="admin-result-match-score">
                            {match.actualHomeScore} : {match.actualAwayScore}
                        </span>
                    ) : (
                        <span className="admin-result-match-empty">לא הוזן</span>
                    )}
                </div>

                <div className="match-bet-side">
                    <TeamLogo teamId={match.awayTeamId} size="sm" />
                    <span className="match-bet-team-name">{awayName}</span>
                </div>
            </div>

            {!match.isCancelled && match.pointsCalculated && !isEditing && (
                <span className="admin-result-match-calculated" aria-label="נקודות חושבו">
                    ✓
                </span>
            )}
        </div>
    );
}
