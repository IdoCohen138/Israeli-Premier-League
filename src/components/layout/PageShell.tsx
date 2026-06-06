import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/layout/ThemeToggle';

interface PageShellProps {
  children: React.ReactNode;
  wide?: boolean;
  admin?: boolean;
  className?: string;
  showThemeToggle?: boolean;
}

export default function PageShell({ children, wide, admin, className, showThemeToggle = false }: PageShellProps) {
  const containerClass = admin
    ? 'app-container-admin'
    : wide
      ? 'app-container-wide'
      : 'app-container';

  return (
    <div dir="rtl" className={cn('app-shell safe-bottom', className)}>
      {showThemeToggle && (
        <div className={cn(containerClass, 'flex justify-end pb-0 pt-3 sm:pt-4')}>
          <ThemeToggle />
        </div>
      )}
      <div className={cn(containerClass, 'space-y-3 sm:space-y-4', showThemeToggle && '!pt-0')}>{children}</div>
    </div>
  );
}
