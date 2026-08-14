export type RoundSeasonPhase = 'regular_season' | 'playoff_upper' | 'playoff_lower';
export type RoundKind = 'regular' | 'completion';

export interface RoundNameParts {
    /** מספר תצוגה בשם המחזור — אינו ייחודי ואינו מזהה Firestore */
    number: number | null;
    seasonPhase: RoundSeasonPhase;
    roundKind: RoundKind;
}

export const ROUND_SEASON_PHASE_OPTIONS: { value: RoundSeasonPhase; label: string }[] = [
    { value: 'regular_season', label: 'עונה סדירה' },
    { value: 'playoff_upper', label: 'פלייאוף עליון' },
    { value: 'playoff_lower', label: 'פלייאוף תחתון' },
];

export const ROUND_KIND_OPTIONS: { value: RoundKind; label: string }[] = [
    { value: 'regular', label: 'מחזור רגיל' },
    { value: 'completion', label: 'מחזור השלמה' },
];

export function buildRoundFullName(parts: RoundNameParts): string {
    let name = parts.number != null ? `מחזור ${parts.number}` : 'מחזור';

    if (parts.seasonPhase === 'playoff_upper') {
        name += ' - פלייאוף עליון';
    } else if (parts.seasonPhase === 'playoff_lower') {
        name += ' - פלייאוף תחתון';
    }

    if (parts.roundKind === 'completion') {
        name += ' - השלמה';
    }

    return name;
}

export function buildRoundCompactName(parts: RoundNameParts): string {
    let compact = parts.number != null ? `מח' ${parts.number}` : "מח'";

    if (parts.seasonPhase === 'playoff_upper') {
        compact += ' פ.עליון';
    } else if (parts.seasonPhase === 'playoff_lower') {
        compact += ' פ.תחתון';
    }

    if (parts.roundKind === 'completion') {
        compact += " הש'";
    }

    return compact;
}

export function parseRoundFullName(name: string): RoundNameParts | null {
    const trimmed = name.trim();

    const patterns: { regex: RegExp; seasonPhase: RoundSeasonPhase; roundKind: RoundKind }[] = [
        {
            regex: /^מחזור\s+(\d+)\s*-\s*פלייאוף\s+תחתון\s*-\s*השלמה$/,
            seasonPhase: 'playoff_lower',
            roundKind: 'completion',
        },
        {
            regex: /^מחזור\s+(\d+)\s*-\s*פלייאוף\s+עליון\s*-\s*השלמה$/,
            seasonPhase: 'playoff_upper',
            roundKind: 'completion',
        },
        {
            regex: /^מחזור\s+(\d+)\s*-\s*פלייאוף\s+תחתון$/,
            seasonPhase: 'playoff_lower',
            roundKind: 'regular',
        },
        {
            regex: /^מחזור\s+(\d+)\s*-\s*פלייאוף\s+עליון$/,
            seasonPhase: 'playoff_upper',
            roundKind: 'regular',
        },
        {
            regex: /^מחזור\s+(\d+)\s*-\s*השלמה$/,
            seasonPhase: 'regular_season',
            roundKind: 'completion',
        },
        {
            regex: /^מחזור\s+(\d+)$/,
            seasonPhase: 'regular_season',
            roundKind: 'regular',
        },
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern.regex);
        if (match) {
            return {
                number: Number(match[1]),
                seasonPhase: pattern.seasonPhase,
                roundKind: pattern.roundKind,
            };
        }
    }

    return null;
}

export function getDefaultRoundNameParts(roundNumber: number): RoundNameParts {
    return {
        number: roundNumber,
        seasonPhase: 'regular_season',
        roundKind: 'regular',
    };
}

export function isRoundNameNumberValid(number: number | null): number is number {
    return number != null && number >= 1;
}

export function getRoundDisplayLabels(
    name: string,
    fallbackRoundNumber?: number
): { full: string; compact: string; isStructured: boolean } {
    const parsed = parseRoundFullName(name);
    if (parsed) {
        return {
            full: buildRoundFullName(parsed),
            compact: buildRoundCompactName(parsed),
            isStructured: true,
        };
    }

    const full =
        name.trim() ||
        (fallbackRoundNumber != null ? `מחזור ${fallbackRoundNumber}` : 'מחזור');
    const compact =
        fallbackRoundNumber != null ? `מח' ${fallbackRoundNumber}` : full.slice(0, 14);

    return { full, compact, isStructured: false };
}
