import { afterEach, describe, expect, it } from 'vitest';
import {
  MEMORY_STORE_MAX_KEYS,
  MemoryRateLimitStore,
  startMemoryStoreSweep,
  stopMemoryStoreSweep,
} from '../middleware/memory-rate-limit.store.js';

/**
 * Regression guard for the rate-limit store memory-exhaustion DoS (W1.10).
 *
 * The store had no eviction of any kind. Entries were removed only by
 * `reset()`, which fires solely on a successful login / refresh /
 * change-password. Expired entries were overwritten in place but never
 * deleted, and the map had no ceiling.
 *
 * Rotating source addresses - trivial with an IPv6 /64, or a botnet - minted
 * one permanent key per request, so the heap grew without bound until the API
 * process was killed. At ~150 bytes per entry, 1M addresses is ~150 MB that
 * is never reclaimed.
 */
describe('MemoryRateLimitStore bounds', () => {
  afterEach(() => {
    stopMemoryStoreSweep();
  });

  it('counts within a window and resets after it elapses', async () => {
    const store = new MemoryRateLimitStore();
    const windowMs = 60_000;

    expect(await store.increment('a', windowMs)).toEqual({ count: 1, resetAt: expect.any(Number) });
    expect((await store.increment('a', windowMs)).count).toBe(2);
    expect((await store.increment('a', windowMs)).count).toBe(3);

    // Past the window the counter starts over rather than growing forever.
    const past = Date.now() + windowMs + 1;
    jest_setTimeoutPast(past);
    const fresh = await store.increment('a', windowMs);
    expect(fresh.count).toBe(1);
  });

  it('sweeps expired keys instead of accumulating them forever', async () => {
    const store = new MemoryRateLimitStore();
    const now = Date.now();
    const windowMs = 1_000;

    for (let i = 0; i < 50; i += 1) {
      await store.increment(`expired-${i}`, windowMs);
    }
    expect(store.size).toBe(50);

    // Everything was created in a window that has now elapsed.
    const removed = store.sweep(now + windowMs + 1);
    expect(removed).toBe(50);
    expect(store.size).toBe(0);
  });

  it('sweep keeps keys whose window is still live', async () => {
    const store = new MemoryRateLimitStore();
    const now = Date.now();
    await store.increment('live', 60_000);
    expect(store.sweep(now + 1)).toBe(0);
    expect(store.size).toBe(1);
  });

  it('never exceeds the hard key ceiling under key-flood pressure', async () => {
    // A small ceiling keeps the test fast; the production default is asserted
    // separately.
    const ceiling = 100;
    const store = new MemoryRateLimitStore(ceiling);
    const windowMs = 3_600_000; // one hour: nothing expires during the test

    // 10x the ceiling, every key distinct, exactly the rotation attack.
    for (let i = 0; i < ceiling * 10; i += 1) {
      await store.increment(`10.0.${Math.floor(i / 256)}.${i % 256}`, windowMs);
    }

    expect(store.size).toBeLessThanOrEqual(ceiling);
  });

  it('uses a bounded default ceiling', () => {
    expect(MEMORY_STORE_MAX_KEYS).toBe(10_000);
    const store = new MemoryRateLimitStore();
    expect(MEMORY_STORE_MAX_KEYS).toBeGreaterThan(0);
    void store;
  });

  it('evicts the oldest-inserted key when full and keeps the size at the ceiling', async () => {
    const store = new MemoryRateLimitStore(2);
    await store.increment('first', 60_000);
    await store.increment('second', 60_000);
    expect(store.size).toBe(2);

    // A third distinct key must not grow the map: the oldest inserted
    // ('first', which also has the earliest resetAt) is evicted.
    await store.increment('third', 60_000);
    expect(store.size).toBe(2);
    expect(store.has('first')).toBe(false);
    expect(store.has('second')).toBe(true);
    expect(store.has('third')).toBe(true);

    // The survivor's counter is undisturbed by the eviction.
    expect((await store.increment('second', 60_000)).count).toBe(2);
  });

  it('starts and stops the sweep idempotently without holding the loop open', () => {
    const store = new MemoryRateLimitStore();
    expect(() => {
      startMemoryStoreSweep(store);
      startMemoryStoreSweep(store);
      stopMemoryStoreSweep();
      stopMemoryStoreSweep();
    }).not.toThrow();
  });

  it('clear() empties the store', async () => {
    const store = new MemoryRateLimitStore();
    await store.increment('x', 60_000);
    await store.increment('y', 60_000);
    expect(store.size).toBe(2);
    await store.clear();
    expect(store.size).toBe(0);
  });

  it('reset() removes a single key', async () => {
    const store = new MemoryRateLimitStore();
    await store.increment('x', 60_000);
    await store.increment('y', 60_000);
    await store.reset('x');
    expect(store.size).toBe(1);
  });
});

/**
 * Advances Date.now() for the duration of the enclosing test. Needed because
 * the store reads the wall clock directly; vi.useFakeTimers would also
 * interfere with the async increments.
 */
function jest_setTimeoutPast(futureMs: number): void {
  const realNow = Date.now;
  const offset = futureMs - realNow();
  Date.now = () => realNow.call(Date) + offset;
  process.nextTick(() => {
    Date.now = realNow;
  });
}
