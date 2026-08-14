import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
    isRoundOpenForUser,
    type RoundNavigationUnit,
} from '@/lib/activeBettingRounds';
import { parseRoundDisplayLabel, shouldShowFullRoundCaption } from '@/lib/roundLabels';
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
    const { compact } = parseRoundDisplayLabel(fullName, roundNumber);

    return <span className="round-nav-pill-compact">{compact}</span>;
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
    const barRef = useRef<HTMLDivElement>(null);
    const activePillRef = useRef<HTMLButtonElement | null>(null);
    const [popoverPos, setPopoverPos] = useState<{
        left: number;
        top: number;
        variant: 'center' | 'edge-start';
    } | null>(null);

    const currentUnit = units[activeUnitIndex] ?? null;
    const activeRoundLabel = parseRoundDisplayLabel(
        getRoundLabel(activeRoundNumber),
        activeRoundNumber
    );
    const showActivePopover = shouldShowFullRoundCaption(
        activeRoundLabel.full,
        activeRoundLabel.compact
    );

    useEffect(() => {
        activePillRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
        });
    }, [activeUnitIndex, activeRoundNumber]);

    useEffect(() => {
        if (!showActivePopover) {
            setPopoverPos(null);
            return;
        }

        const updatePosition = () => {
            const anchor = activePillRef.current;
            const bar = barRef.current;
            if (!anchor || !bar) {
                setPopoverPos(null);
                return;
            }

            const anchorRect = anchor.getBoundingClientRect();
            const barRect = bar.getBoundingClientRect();
            const isNearRtlStartEdge = anchorRect.right >= window.innerWidth - 32;

            setPopoverPos({
                left: isNearRtlStartEdge
                    ? anchorRect.right - barRect.left + 6
                    : anchorRect.left - barRect.left + anchorRect.width / 2,
                top: anchorRect.bottom - barRect.top + 4,
                variant: isNearRtlStartEdge ? 'edge-start' : 'center',
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        const scrollParent = barRef.current?.querySelector('.round-nav-scroll-track');
        scrollParent?.addEventListener('scroll', updatePosition, { passive: true });
        return () => {
            window.removeEventListener('resize', updatePosition);
            scrollParent?.removeEventListener('scroll', updatePosition);
        };
    }, [showActivePopover, activeUnitIndex, activeRoundNumber, currentUnit?.isGrouped, units]);

    const isUnitOpen = (unit: RoundNavigationUnit) =>
        unit.roundNumbers.some((roundNumber) => {
            const round = rounds.find((entry) => entry.number === roundNumber);
            return round ? isRoundOpenForUser(round, userId) : false;
        });

    const setActivePillRef = (element: HTMLButtonElement | null) => {
        activePillRef.current = element;
    };

    return (
        <div className="round-nav-scroll-bar" ref={barRef} role="navigation" aria-label="ניווט מחזורים">
            <div className="round-nav-scroll-wrap">
                <div className="round-nav-scroll-track" role="tablist" aria-label="תקופות מחזורים">
                    {units.map((unit, unitIndex) => {
                        const isActive = unitIndex === activeUnitIndex;
                        const isOpen = isUnitOpen(unit);
                        const isActiveSingleRound =
                            isActive &&
                            !unit.isGrouped &&
                            unit.roundNumbers[0] === activeRoundNumber;

                        return (
                            <button
                                key={unit.roundNumbers.join('-')}
                                ref={isActiveSingleRound ? setActivePillRef : undefined}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
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
                                            <span
                                                key={roundNumber}
                                                className="round-nav-pill-group-item"
                                            >
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
                    <p className="round-nav-sub-bar-hint">{groupedHint}</p>
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
                                    ref={isActive ? setActivePillRef : undefined}
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

            {showActivePopover && popoverPos && (
                <div
                    className={cn(
                        'round-nav-pill-popover',
                        popoverPos.variant === 'edge-start' && 'round-nav-pill-popover--edge-start'
                    )}
                    style={{ left: `${popoverPos.left}px`, top: `${popoverPos.top}px` }}
                    role="tooltip"
                >
                    {activeRoundLabel.full}
                </div>
            )}
        </div>
    );
}
