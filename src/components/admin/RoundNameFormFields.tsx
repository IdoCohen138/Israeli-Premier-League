import {
    buildRoundCompactName,
    buildRoundFullName,
    ROUND_KIND_OPTIONS,
    ROUND_SEASON_PHASE_OPTIONS,
    type RoundNameParts,
} from '@/lib/roundNameFormat';

interface RoundNameFormFieldsProps {
    parts: RoundNameParts;
    onChange: (parts: RoundNameParts) => void;
    numberDisabled?: boolean;
    /** מזהה פנימי ייחודי של המחזור ב-Firestore — לא משתנה בעריכת שם */
    internalRoundId?: number;
}

export default function RoundNameFormFields({
    parts,
    onChange,
    numberDisabled = false,
    internalRoundId,
}: RoundNameFormFieldsProps) {
    return (
        <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/30 p-3">
            {internalRoundId != null && (
                <p className="text-[11px] text-muted-foreground">
                    מזהה פנימי: <span className="font-medium text-foreground">{internalRoundId}</span>
                    {' '}(ייחודי — לא משתנה בעדכון שם)
                </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
                <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                        מס&apos; מחזור (בשם)
                    </label>
                    <input
                        type="number"
                        min={1}
                        value={parts.number}
                        disabled={numberDisabled}
                        onChange={(e) =>
                            onChange({
                                ...parts,
                                number: Math.max(1, Number(e.target.value) || 1),
                            })
                        }
                        className="app-select text-sm"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                        שלב עונה
                    </label>
                    <select
                        value={parts.seasonPhase}
                        onChange={(e) =>
                            onChange({
                                ...parts,
                                seasonPhase: e.target.value as RoundNameParts['seasonPhase'],
                            })
                        }
                        className="app-select text-sm"
                    >
                        {ROUND_SEASON_PHASE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">
                        סוג מחזור
                    </label>
                    <select
                        value={parts.roundKind}
                        onChange={(e) =>
                            onChange({
                                ...parts,
                                roundKind: e.target.value as RoundNameParts['roundKind'],
                            })
                        }
                        className="app-select text-sm"
                    >
                        {ROUND_KIND_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                <p>
                    <span className="font-medium text-foreground">שם מלא: </span>
                    {buildRoundFullName(parts)}
                </p>
                <p className="mt-1">
                    <span className="font-medium text-foreground">תצוגה בסרגל: </span>
                    {buildRoundCompactName(parts)}
                </p>
            </div>
        </div>
    );
}
