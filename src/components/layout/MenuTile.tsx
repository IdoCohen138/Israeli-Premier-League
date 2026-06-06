import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuTileProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  accent?: 'green' | 'gold' | 'sky' | 'violet' | 'rose' | 'amber';
  variant?: 'default' | 'home';
}

const accentMap = {
  green: {
    icon: 'text-emerald-500 dark:text-emerald-400',
    wrap: 'bg-emerald-500/12 border-emerald-500/25 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    glow: 'group-hover:shadow-[0_0_20px_hsl(152_69%_42%_/_0.12)]',
  },
  gold: {
    icon: 'text-amber-600 dark:text-amber-400',
    wrap: 'bg-amber-500/12 border-amber-500/25 dark:bg-amber-500/10 dark:border-amber-500/20',
    glow: 'group-hover:shadow-[0_0_20px_hsl(43_96%_56%_/_0.12)]',
  },
  sky: {
    icon: 'text-sky-600 dark:text-sky-400',
    wrap: 'bg-sky-500/12 border-sky-500/25 dark:bg-sky-500/10 dark:border-sky-500/20',
    glow: 'group-hover:shadow-[0_0_20px_hsl(199_89%_48%_/_0.12)]',
  },
  violet: {
    icon: 'text-violet-600 dark:text-violet-400',
    wrap: 'bg-violet-500/12 border-violet-500/25 dark:bg-violet-500/10 dark:border-violet-500/20',
    glow: 'group-hover:shadow-[0_0_20px_hsl(258_90%_66%_/_0.12)]',
  },
  rose: {
    icon: 'text-rose-600 dark:text-rose-400',
    wrap: 'bg-rose-500/12 border-rose-500/25 dark:bg-rose-500/10 dark:border-rose-500/20',
    glow: 'group-hover:shadow-[0_0_20px_hsl(350_89%_60%_/_0.12)]',
  },
  amber: {
    icon: 'text-orange-600 dark:text-orange-400',
    wrap: 'bg-orange-500/12 border-orange-500/25 dark:bg-orange-500/10 dark:border-orange-500/20',
    glow: 'group-hover:shadow-[0_0_20px_hsl(25_95%_53%_/_0.12)]',
  },
};

export default function MenuTile({
  icon: Icon,
  title,
  description,
  onClick,
  accent = 'green',
  variant = 'default',
}: MenuTileProps) {
  const colors = accentMap[accent];

  if (variant === 'home') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'group app-card-interactive w-full px-4 py-3.5 text-right transition-all',
          colors.glow
        )}
      >
        <div className="flex items-center justify-center gap-3.5">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border',
              colors.wrap
            )}
          >
            <Icon size={22} className={colors.icon} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold leading-tight text-foreground sm:text-base">{title}</h3>
            <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              {description}
            </p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="app-card-interactive w-full p-3 text-right sm:p-3.5"
    >
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', colors.wrap)}>
          <Icon size={20} className={colors.icon} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground sm:text-base">{title}</h3>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground sm:text-xs">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}
