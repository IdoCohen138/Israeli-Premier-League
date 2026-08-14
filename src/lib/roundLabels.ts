import { getRoundDisplayLabels } from './roundNameFormat';

export interface RoundDisplayLabel {
    full: string;
    compact: string;
}

export function parseRoundDisplayLabel(
    name: string,
    fallbackRoundNumber?: number
): RoundDisplayLabel {
    const { full, compact } = getRoundDisplayLabels(name, fallbackRoundNumber);
    return { full, compact };
}

export function shouldShowFullRoundCaption(full: string, compact: string): boolean {
    return full.trim() !== compact.trim();
}
