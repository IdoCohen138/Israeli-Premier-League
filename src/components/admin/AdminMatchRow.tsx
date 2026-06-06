import { cn } from '@/lib/utils';
import TeamLogo from '@/components/TeamLogo';

interface AdminMatchRowProps {
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  isCancelled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function AdminMatchRow({
  homeTeamId,
  awayTeamId,
  homeName,
  awayName,
  isCancelled,
  className,
  children,
}: AdminMatchRowProps) {
  return (
    <div
      className={cn(
        'admin-match-row',
        isCancelled && 'admin-match-row--cancelled',
        className
      )}
    >
      <div className="admin-match-teams">
        <div className="admin-match-team">
          <TeamLogo teamId={homeTeamId} size="sm" />
          <span className="admin-match-team-name" title={homeName}>
            {homeName}
          </span>
        </div>
        <span className="admin-match-vs">נגד</span>
        <div className="admin-match-team">
          <TeamLogo teamId={awayTeamId} size="sm" />
          <span className="admin-match-team-name" title={awayName}>
            {awayName}
          </span>
        </div>
      </div>
      {children ? <div className="admin-match-meta">{children}</div> : null}
    </div>
  );
}
