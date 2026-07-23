export const RETRO_SEASON_2024_2025_ID = '2024-2025';

export interface RetroSeasonStanding {
  rank: number;
  name: string;
  points: number;
  note?: string;
}

export const RETRO_SEASON_2024_2025: RetroSeasonStanding[] = [
  { rank: 1, name: 'עומר', points: 171 },
  { rank: 2, name: 'בן', points: 170 },
  { rank: 3, name: 'יוני', points: 162 },
  { rank: 4, name: 'שלומי', points: 162 },
  { rank: 5, name: 'גלעד*', points: 158, note: 'הצטרף לאחר מחזור 7, נוספו 30 נקודות (השוואה למקום אחרון באותו מחזור)' },
  { rank: 6, name: 'תומאס', points: 156 },
  { rank: 7, name: 'יפתח', points: 155 },
  { rank: 8, name: 'עומרי', points: 151 },
  { rank: 9, name: 'אהרוני', points: 151 },
  { rank: 10, name: 'יודה', points: 141 },
];

export function isRetroSeasonId(seasonId: string): boolean {
  return seasonId === RETRO_SEASON_2024_2025_ID;
}

export function mergeWithRetroSeasonIds(seasonIds: string[]): string[] {
  const merged = new Set(seasonIds);
  merged.add(RETRO_SEASON_2024_2025_ID);
  return [...merged];
}
