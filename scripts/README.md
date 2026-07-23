# Scripts

סקריפטים לניהול נתוני עונה ב-Firestore. דורש התחברות: `firebase login`

## מבנה

```
scripts/
  lib/           — קוד משותף
  season/        — הקמת עונה חדשה
  players/       — ניהול שחקנים
  rounds/        — ניהול מחזורים ומשחקים
```

## lib/

| קובץ | תיאור |
|------|--------|
| `firestore-utils.cjs` | חיבור Firebase CLI, קריאה/כתיבה ל-Firestore |

## season/ — הקמת עונה

| סקריפט | תיאור | שימוש |
|--------|--------|-------|
| `copy-season-teams.cjs` | מעתיק קבוצות מעונה קודמת | `npm run copy-season-teams -- 2025-2026 2026-2027` |
| `copy-season-players.cjs` | מעתיק שחקנים מעונה קודמת | `npm run copy-season-players -- 2025-2026 2026-2027` |

## players/ — שחקנים

| סקריפט | תיאור | שימוש |
|--------|--------|-------|
| `add-season-player.cjs` | מוסיף שחקן בודד | `npm run add-season-player -- 2026-2027 "שם" "קבוצה" teamId` |
| `update-season-players.cjs` | מעדכן הצטרפות/עזיבה לפי JSON | `npm run update-season-players -- scripts/players/my-updates.json --dry-run` |
| `season-player-updates.example.json` | דוגמה לפורמט JSON | — |

## rounds/ — מחזורים

| סקריפט | תיאור | שימוש |
|--------|--------|-------|
| `import-season-rounds.cjs` | מייבא מחזורים ומשחקים מקובץ טקסט | `npm run import-season-rounds -- my-rounds.txt --dry-run` |
| `rounds.example.raw.txt` | דוגמה לפורמט הקלט | — |

### פורמט קובץ מחזורים

```
מחזור 1
22/08/2026
מכבי פתח תקוה
מכבי פתח תקוה
20:00
עירוני קרית שמונה
עירוני ק"ש
```

כל משחק: 5 שורות (בית, בית, שעה, חוץ, חוץ).

## npm scripts

```bash
npm run copy-season-teams -- [from] [to]
npm run copy-season-players -- [from] [to]
npm run add-season-player -- <season> <name> <team> <teamId>
npm run update-season-players -- <config.json> [--dry-run]
npm run import-season-rounds -- [rounds.txt] [--dry-run]
```

משתנה סביבה אופציונלי: `SEASON=2026-2027` (ל-import-season-rounds).
