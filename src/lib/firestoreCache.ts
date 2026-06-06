type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export const CACHE_TTL = {
  rounds: 3 * 60 * 1000,
  matches: 3 * 60 * 1000,
  seasonDoc: 5 * 60 * 1000,
  seasonList: 10 * 60 * 1000,
  homeSummary: 2 * 60 * 1000,
  user: 30 * 60 * 1000,
} as const;

export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
      inFlight.delete(key);
      return data;
    })
    .catch((error) => {
      inFlight.delete(key);
      throw error;
    });

  inFlight.set(key, promise);
  return promise as Promise<T>;
}

export function invalidateCache(keyOrPrefix?: string) {
  if (!keyOrPrefix) {
    memoryCache.clear();
    inFlight.clear();
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      memoryCache.delete(key);
    }
  }
}
