import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import type { SeasonConfig } from '@/types';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
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

function configFromSnapshot(
  snap: Awaited<ReturnType<typeof getDocFromServer>>
): SeasonConfig {
  if (snap.exists()) {
    return normalizeSeasonConfig(snap.data() as Parameters<typeof normalizeSeasonConfig>[0]);
  }
  return {
    activeSeasonId: getCalendarSeason(),
    seasonOpen: false,
    previousSeasonIds: [],
  };
}

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<SeasonConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const applyConfig = useCallback((seasonConfig: SeasonConfig) => {
    setConfig(seasonConfig);
    setActiveSeasonId(seasonConfig.activeSeasonId);
    setLoading(false);
  }, []);

  const refreshConfig = useCallback(async () => {
    if (!user) return;
    invalidateCache('seasonConfig');
    const { getSeasonConfig } = await import('@/lib/season');
    applyConfig(await getSeasonConfig());
  }, [applyConfig, user]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setConfig(null);
      setActiveSeasonId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const configRef = doc(db, 'config/season');

    const applyFromServerSnap = (
      snap: Awaited<ReturnType<typeof getDocFromServer>>
    ) => {
      if (cancelled) return;
      applyConfig(configFromSnapshot(snap));
    };

    getDocFromServer(configRef)
      .then(applyFromServerSnap)
      .catch((error) => {
        console.error('Error fetching season config from server:', error);
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = onSnapshot(
      configRef,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return;
        applyFromServerSnap(snap);
      },
      (error) => {
        console.error('Error listening to season config:', error);
        if (!cancelled) setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, authLoading, applyConfig]);

  const activeSeasonId = config?.activeSeasonId ?? getCalendarSeason();
  const previousSeasonIds = config?.previousSeasonIds ?? [];

  const upcomingSeasonDisplay = formatSeasonDisplay(activeSeasonId);

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
