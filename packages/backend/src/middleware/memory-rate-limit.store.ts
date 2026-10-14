/**
 * In-memory rate-limit store.
 *
 * The previous implementation had NO eviction: entries were removed only by
 * `reset()`, which fires solely on a successful login/refresh/change-password.
 * Expired entries were overwritten in place but never deleted, so a client
 * rotating source addresses (trivial with an IPv6 /64, or a botnet) minted one
 * permanent key per request and grew the heap without bound - a memory
 * exhaustion DoS. At ~150 bytes per entry, 1M distinct addresses is ~150 MB
 * that is never reclaimed and has no ceiling.
 *
 * Two bounds are now enforced:
 *   - a periodic sweep deletes entries whose window has elapsed;
 *   - a hard cap evicts the entries closest to expiry when the map is full.
 *
 * The sweep timer is `unref()`d so it never holds the process open, and is
 * stopped by `stopMemoryStoreSweep()` on shutdown.
 */
export class MemoryRateLimitStore {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxKeys: number = MEMORY_STORE_MAX_KEYS,
    private readonly sweepIntervalMs: number = MEMORY_STORE_SWEEP_INTERVAL_MS,
  ) {}

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      this.evictIfFull();
      const resetAt = now + windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }

    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }

  async clear(): Promise<void> {
    this.hits.clear();
  }

  /** Number of tracked keys. Exposed for the bound assertions in tests. */
  get size(): number {
    return this.hits.size;
  }

  /** Whether a key is currently tracked. Exposed for eviction assertions. */
  has(key: string): boolean {
    return this.hits.has(key);
  }

  /** Drops every entry whose window has elapsed. */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  private evictIfFull(): void {
    if (this.hits.size < this.maxKeys) return;
    // Map iterates in insertion order; the oldest inserted key is the first
    // one whose window expires, so evicting from the front is the cheapest
    // correct eviction (approximate LRU without per-access bookkeeping).
    const oldest = this.hits.keys().next();
    if (!oldest.done) this.hits.delete(oldest.value);
  }
}

/** Hard ceiling on distinct rate-limit keys held in memory. */
export const MEMORY_STORE_MAX_KEYS = 10_000;
/** How often expired keys are swept out of the in-memory store. */
export const MEMORY_STORE_SWEEP_INTERVAL_MS = 60_000;

let memorySweepTimer: NodeJS.Timeout | null = null;

/** Starts the unref'd sweep interval. Idempotent. */
export function startMemoryStoreSweep(store: MemoryRateLimitStore): void {
  if (memorySweepTimer) return;
  memorySweepTimer = setInterval(() => {
    store.sweep();
  }, MEMORY_STORE_SWEEP_INTERVAL_MS);
  // Never keep the event loop alive for housekeeping.
  memorySweepTimer.unref?.();
}

/** Stops the sweep interval. Safe to call when not started. */
export function stopMemoryStoreSweep(): void {
  if (!memorySweepTimer) return;
  clearInterval(memorySweepTimer);
  memorySweepTimer = null;
}

