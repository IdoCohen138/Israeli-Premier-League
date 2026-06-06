import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { SeasonConfig } from '@/types';
import { db } from '@/lib/firebase';
import {
  formatSeasonDisplay,
  getCalendarSeason,
  normalizeSeasonConfig,
  setActiveSeasonId,
} from '@/lib/season';
import { invalidateCache } from '@/lib/firestoreCache';

interface SeasonContextValue {
  config: SeasonConfig | null;
  loading: boolean;
  seasonOpen: boolean;
  activeSeasonId: string;
  previousSeasonIds: string[];
  upcomingSeasonDisplay: string;
  refreshConfig: () => Promise<void>;
}

const SeasonContext = createContext<SeasonContextValue | undefined>(undefined);

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SeasonConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const applyConfig = useCallback((seasonConfig: SeasonConfig) => {
    setConfig(seasonConfig);
    setActiveSeasonId(seasonConfig.activeSeasonId);
    setLoading(false);
  }, []);

  const refreshConfig = useCallback(async () => {
    invalidateCache('seasonConfig');
    const { getSeasonConfig } = await import('@/lib/season');
    applyConfig(await getSeasonConfig());
  }, [applyConfig]);

  useEffect(() => {
    const configRef = doc(db, 'config/season');

    const unsubscribe = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) {
          applyConfig(normalizeSeasonConfig(snap.data() as Parameters<typeof normalizeSeasonConfig>[0]));
        } else {
          applyConfig({
            activeSeasonId: getCalendarSeason(),
            seasonOpen: false,
            previousSeasonIds: [],
          });
        }
      },
      (error) => {
        console.error('Error listening to season config:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [applyConfig]);

  const activeSeasonId = config?.activeSeasonId ?? getCalendarSeason();
  const previousSeasonIds = config?.previousSeasonIds ?? [];

  const upcomingSeasonDisplay = config?.seasonOpen
    ? formatSeasonDisplay(activeSeasonId)
    : formatSeasonDisplay(activeSeasonId);

  return (
    <SeasonContext.Provider
      value={{
        config,
        loading,
        seasonOpen: config?.seasonOpen ?? false,
        activeSeasonId,
        previousSeasonIds,
        upcomingSeasonDisplay,
        refreshConfig,
      }}
    >
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  const context = useContext(SeasonContext);
  if (!context) {
    throw new Error('useSeason must be used within SeasonProvider');
  }
  return context;
}
