import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TeamLogoProps {
  teamId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const teamUIDMap: Record<string, string> = {
  bj: 'cEwxSXc30mGjpHERA6YZ',
  br: 'HQFVsgeN6i5lL02ErcWC',
  bs: 'hNurzZ1NV4rTIsLm36vY',
  et: 'aV5MsMvL5cUxw2FGZ9ei',
  hbs: 'yQGLAU1X1wdLYJaUs9mG',
  hh: 'kUoNlc2LBaowsM4EsvO1',
  hj: 'f0MbYhgWEDhqMHDuN6wM',
  hk: '1jlD8ejl9jizwhrvj09h',
  hp: 'nSZHZZ3KsWLqaJPn6cKN',
  ht: 'E1Um0HTHKxbtfwX0aZeD',
  ma: 'oeEIKdN6KIKgnwgFZvOw',
  mh: 'ZKS8tiett2ckKRglp6Kg',
  mn: 'usx5s2KEmG0hgFewy8XC',
  mt: '6xIqFlWU7Vd4iI0bR3sI',
};

const sizeClasses = {
  sm: 'h-7 w-7 sm:h-8 sm:w-8',
  md: 'h-8 w-8 sm:h-9 sm:w-9',
  lg: 'h-11 w-11 sm:h-12 sm:w-12',
};

export default function TeamLogo({ teamId, size = 'md', className = '' }: TeamLogoProps) {
  const [error, setError] = useState(false);
  const teamShortName = Object.keys(teamUIDMap).find((key) => teamUIDMap[key] === teamId);
  const boxClass = cn(
    sizeClasses[size],
    'relative shrink-0 overflow-hidden rounded-full border border-border/40 bg-card',
    className
  );

  if (!teamShortName || error || !teamId) {
    return (
      <div className={cn(boxClass, 'flex items-center justify-center bg-secondary')}>
        <span className="text-[10px] font-bold text-muted-foreground">?</span>
      </div>
    );
  }

  return (
    <div className={boxClass}>
      <img
        src={`/logos/${teamShortName}.jpg`}
        alt=""
        className="h-full w-full object-contain p-0.5"
        loading="lazy"
        onError={() => setError(true)}
      />
    </div>
  );
}
