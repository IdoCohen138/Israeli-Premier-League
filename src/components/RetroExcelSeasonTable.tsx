import { FileSpreadsheet } from 'lucide-react';
import { formatSeasonDisplay } from '@/lib/season';
import {
  RETRO_SEASON_2024_2025,
  RETRO_SEASON_2024_2025_ID,
} from '@/data/retroSeason2024_2025';

export default function RetroExcelSeasonTable() {
  const footnote = RETRO_SEASON_2024_2025.find((row) => row.note)?.note;

  return (
    <div className="retro-excel-season">
      <div className="retro-excel-season__titlebar">
        <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
        <span className="retro-excel-season__filename truncate">
          טבלת_עונה_{formatSeasonDisplay(RETRO_SEASON_2024_2025_ID)}.xlsx
        </span>
      </div>

      <div className="retro-excel-season__ribbon">
        <span className="retro-excel-season__badge">לפני האפליקציה</span>
        <span className="retro-excel-season__subtitle">ניהול ידני באקסל · לא מחובר למערכת</span>
      </div>

      <div className="retro-excel-season__sheet">
        <table className="retro-excel-season__table">
          <thead>
            <tr>
              <th>#</th>
              <th>שם</th>
              <th>נק&apos;</th>
            </tr>
          </thead>
          <tbody>
            {RETRO_SEASON_2024_2025.map((row) => (
              <tr key={row.rank} className={row.rank <= 3 ? 'retro-excel-season__row--podium' : undefined}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {footnote && (
        <p className="retro-excel-season__footnote">*{footnote}</p>
      )}
    </div>
  );
}
