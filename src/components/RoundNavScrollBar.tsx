import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
    isRoundOpenForUser,
    type RoundNavigationUnit,
} from '@/lib/activeBettingRounds';
import { parseRoundDisplayLabel } from '@/lib/roundLabels';
import type { RoundSummary } from '@/lib/sorting';

interface RoundNavScrollBarProps {
    units: RoundNavigationUnit[];
    activeUnitIndex: number;
    activeRoundNumber: number;
    rounds: RoundSummary[];
    userId?: string | null;
    getRoundLabel: (roundNumber: number) => string;
    onSelectUnit: (unitIndex: number) => void;
    onSelectRoundInGroup: (roundNumber: number) => void;
    groupedHint?: string;
}

function RoundPillLabel({
    roundNumber,
    fullName,
}: {
    roundNumber: number;
    fullName: string;
}) {
    const { full, compact } = parseRoundDisplayLabel(fullName, roundNumber);

    return (
        <span className="round-nav-pill-compact" title={full}>
            {compact}
        </span>
    );
}

export default function RoundNavScrollBar({
    units,
    activeUnitIndex,
    activeRoundNumber,
    rounds,
    userId,
    getRoundLabel,
    onSelectUnit,
    onSelectRoundInGroup,
    groupedHint = 'מחזורים עם סגירה קרובה — יש להזין הימור לכל מחזור בנפרד',
}: RoundNavScrollBarProps) {
    const activeUnitRef = useRef<HTMLButtonElement>(null);
    const currentUnit = units[activeUnitIndex] ?? null;

    useEffect(() => {
        activeUnitRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
        });
    }, [activeUnitIndex]);

    const isUnitOpen = (unit: RoundNavigationUnit) =>
        unit.roundNumbers.some((roundNumber) => {
            const round = rounds.find((entry) => entry.number === roundNumber);
            return round ? isRoundOpenForUser(round, userId) : false;
        });

    const groupedUnitTitle = (unit: RoundNavigationUnit) =>
        unit.roundNumbers.map((n) => getRoundLabel(n)).join(' · ');

    return (
        <div className="round-nav-scroll-bar" role="navigation" aria-label="ניווט מחזורים">
            <div className="round-nav-scroll-wrap">
                <div className="round-nav-scroll-track" role="tablist" aria-label="תקופות מחזורים">
                    {units.map((unit, unitIndex) => {
                        const isActive = unitIndex === activeUnitIndex;
                        const isOpen = isUnitOpen(unit);

                        return (
                            <button
                                key={unit.roundNumbers.join('-')}
                                ref={isActive ? activeUnitRef : undefined}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                title={unit.isGrouped ? groupedUnitTitle(unit) : getRoundLabel(unit.roundNumbers[0])}
                                className={cn(
                                    'round-nav-pill',
                                    unit.isGrouped && 'round-nav-pill--grouped',
                                    isActive && 'round-nav-pill--active'
                                )}
                                onClick={() => onSelectUnit(unitIndex)}
                            >
                                {unit.isGrouped ? (
                                    <span className="round-nav-pill-group">
                                        {unit.roundNumbers.map((roundNumber, index) => (
                                            <span key={roundNumber} className="round-nav-pill-group-item">
                                                {index > 0 && (
                                                    <span className="round-nav-pill-sep" aria-hidden>
                                                        ·
                                                    </span>
                                                )}
                                                <RoundPillLabel
                                                    roundNumber={roundNumber}
                                                    fullName={getRoundLabel(roundNumber)}
                                                />
                                            </span>
                                        ))}
                                    </span>
                                ) : (
                                    <RoundPillLabel
                                        roundNumber={unit.roundNumbers[0]}
                                        fullName={getRoundLabel(unit.roundNumbers[0])}
                                    />
                                )}
                                {isOpen && (
                                    <span
                                        className={cn(
                                            'round-nav-pill-dot',
                                            isActive && 'round-nav-pill-dot--active'
                                        )}
                                        aria-hidden
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {currentUnit?.isGrouped && (
                <div className="round-nav-sub-bar">
                    <p className="round-nav-sub-bar-hint">
                        {groupedHint}
                    </p>
                    <div
                        className="round-bets-pair-switcher"
                        role="tablist"
                        aria-label="בחירת מחזור בקבוצה"
                    >
                        {currentUnit.roundNumbers.map((roundNumber) => {
                            const isActive = activeRoundNumber === roundNumber;
                            const roundLabel = getRoundLabel(roundNumber);

                            return (
                                <button
                                    key={roundNumber}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    className={cn(
                                        'round-bets-pair-tab',
                                        isActive && 'round-bets-pair-tab--active'
                                    )}
                                    onClick={() => onSelectRoundInGroup(roundNumber)}
                                >
                                    <RoundPillLabel
                                        roundNumber={roundNumber}
                                        fullName={roundLabel}
                                    />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
