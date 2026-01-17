const cache = new Map();
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCacheKey(platform, store, searchTerm) {
  return `${platform}:${store}:${searchTerm}`.toLowerCase();
}

export function getCachedPrices(platform, store, searchTerm) {
  const key = getCacheKey(platform, store, searchTerm);
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function setCachedPrices(platform, store, searchTerm, data, ttlMs = DEFAULT_TTL_MS) {
  const key = getCacheKey(platform, store, searchTerm);

  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    cachedAt: Date.now(),
  });
}

export function clearCache() {
  cache.clear();
}

export function getCacheStats() {
  let validEntries = 0;
  let expiredEntries = 0;

  for (const [key, entry] of cache.entries()) {
    if (Date.now() > entry.expiresAt) {
      expiredEntries++;
    } else {
      validEntries++;
    }
  }

  return {
    totalEntries: cache.size,
    validEntries,
    expiredEntries,
  };
}

// Cleanup expired entries periodically
setInterval(() => {
  for (const [key, entry] of cache.entries()) {
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
    }
  }
}, 60000);
