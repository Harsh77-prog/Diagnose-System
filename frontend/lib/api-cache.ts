interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

const apiCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();
function generateCacheKey(
  endpoint: string,
  options?: { method?: string; body?: string } | RequestInit
): string {
  const method = (options as { method?: string })?.method || "GET";
  const body = (options as { body?: string })?.body || "";
  
  let bodyHash = "";
  if (body) {
    // IMPROVED: Generate a more robust hash and include length to prevent collisions
    let hash = 0;
    for (let i = 0; i < body.length; i++) {
      const char = body.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Append length and hash for uniqueness
    bodyHash = `${body.length}_${Math.abs(hash).toString(36)}`;
  }

  return `${method}:${endpoint}${bodyHash ? `:${bodyHash}` : ""}`;
}
function isCacheValid<T>(entry: CacheEntry<T>): boolean {
  const now = Date.now();
  return now - entry.timestamp < entry.ttl;
}


export async function cachedFetch<T = unknown>(
  endpoint: string,
  options?: RequestInit,
  cacheTTL: number = 0
): Promise<T> {
  const cacheKey = generateCacheKey(endpoint, options);

  // ✅ Check if result is already cached
  const cached = apiCache.get(cacheKey) as CacheEntry<T> | undefined;
  if (cached && isCacheValid(cached)) {
    console.debug(`[API Cache] Hit: ${cacheKey}`);
    return cached.data;
  }

  // ✅ Check if request is already in flight (deduplication)
  const inFlight = inFlightRequests.get(cacheKey) as Promise<T> | undefined;
  if (inFlight) {
    console.debug(`[API Dedup] Waiting for: ${cacheKey}`);
    return inFlight;
  }

  // ✅ Make new request and store the promise
  const requestPromise = (async () => {
    try {
      const response = await fetch(endpoint, options);
      // Parse different response types
      let data: T;
      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else if (contentType?.includes("text")) {
        data = (await response.text()) as T;
      } else {
        data = await response.blob() as T;
      }

      // ✅ Cache successful responses
      if (response.ok && cacheTTL > 0) {
        apiCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          ttl: cacheTTL,
        });
        console.debug(`[API Cache] Stored: ${cacheKey} (TTL: ${cacheTTL}ms)`);
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return data;
    } finally {
      // ✅ Remove from in-flight map when done
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Clear specific cache entry or entire cache
 */
export function clearCache(endpoint?: string): void {
  if (endpoint) {
    const cacheKey = generateCacheKey(endpoint);
    apiCache.delete(cacheKey);
    console.debug(`[API Cache] Cleared: ${cacheKey}`);
  } else {
    apiCache.clear();
    console.debug(`[API Cache] Cleared all`);
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  return {
    cacheSize: apiCache.size,
    inFlightSize: inFlightRequests.size,
    entries: Array.from(apiCache.entries()).map(([key, entry]) => ({
      key,
      valid: isCacheValid(entry),
      age: Date.now() - entry.timestamp,
      ttl: entry.ttl,
    })),
  };
}