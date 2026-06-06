import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/layout/ThemeToggle';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  action?: React.ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  backTo = '/',
  backLabel = 'חזרה',
  action,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate app-muted">{subtitle}</p>}
      </div>
      {action ?? (
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(backTo)}
            className="gap-1.5 border-border/80 bg-secondary/50 px-2.5"
          >
            <ArrowRight size={14} />
            <span className="hidden sm:inline">{backLabel}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
