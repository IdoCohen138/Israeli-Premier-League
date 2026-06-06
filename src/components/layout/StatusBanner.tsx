import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatusBannerProps {
  variant: 'open' | 'closed' | 'warning' | 'info';
  icon: LucideIcon;
  title: string;
  description?: string;
  meta?: string;
}

const variantClass = {
  open: 'status-open',
  closed: 'status-closed',
  warning: 'status-warning',
  info: 'status-info',
};

const iconClass = {
  open: 'text-emerald-400',
  closed: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-sky-400',
};

export default function StatusBanner({
  variant,
  icon: Icon,
  title,
  description,
  meta,
}: StatusBannerProps) {
  return (
    <div className={cn('status-banner', variantClass[variant])}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass[variant])} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {meta && (
          <div className="shrink-0 text-left">
            <p className="text-[10px] text-muted-foreground">שעת נעילה</p>
            <p className="text-xs font-medium text-foreground">{meta}</p>
          </div>
        )}
      </div>
    </div>
  );
}
