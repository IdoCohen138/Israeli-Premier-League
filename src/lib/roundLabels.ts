export interface RoundDisplayLabel {
    /** Original round name from the database */
    full: string;
    /** Short toolbar label, e.g. "פ.עליון מח' 32" */
    compact: string;
}

const ROUND_NAME_PATTERN = /^(.+?)\s*-\s*מחזור\s+(\d+)(?:\s+(\S+))?$/;
const ROUND_ONLY_PATTERN = /^מחזור\s+(\d+)(?:\s+(\S+))?$/;

function abbreviatePhase(phase: string): string | null {
    const trimmed = phase.trim();

    if (trimmed === 'עונה סדירה') return 'ע.סדירה';

    const playoffMatch = trimmed.match(/^פלייאוף\s+(.+)$/);
    if (playoffMatch) return `פ.${playoffMatch[1]}`;

    return null;
}

function buildCompact(phaseShort: string | null, roundNumber: string, suffix?: string): string {
    const roundPart = suffix ? `מח' ${roundNumber} ${suffix}` : `מח' ${roundNumber}`;
    return phaseShort ? `${phaseShort} ${roundPart}` : roundPart;
}

/**
 * Splits a round name into full and compact toolbar labels.
 * e.g. "פלייאוף עליון - מחזור 32" → "פ.עליון מח' 32"
 */
export function parseRoundDisplayLabel(
    name: string,
    fallbackRoundNumber?: number
): RoundDisplayLabel {
    const full = name.trim() || (
        fallbackRoundNumber != null ? `מחזור ${fallbackRoundNumber}` : 'מחזור'
    );

    const structured = full.match(ROUND_NAME_PATTERN);
    if (structured) {
        const [, phase, roundNumber, suffix] = structured;
        const phaseShort = abbreviatePhase(phase);
        return {
            full,
            compact: buildCompact(phaseShort, roundNumber, suffix),
        };
    }

    const roundOnly = full.match(ROUND_ONLY_PATTERN);
    if (roundOnly) {
        const [, roundNumber, suffix] = roundOnly;
        return {
            full,
            compact: buildCompact(null, roundNumber, suffix),
        };
    }

    if (fallbackRoundNumber != null) {
        return {
            full,
            compact: `מח' ${fallbackRoundNumber}`,
        };
    }

    return {
        full,
        compact: full.length > 18 ? `${full.slice(0, 16)}…` : full,
    };
}
