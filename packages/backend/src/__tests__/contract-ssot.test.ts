import { describe, expect, it } from 'vitest';
import { grnMovementHistorySchema, healthResponseSchema } from '@cold-storage/contracts';

describe('API-04 contract SSOT spot-checks', () => {
  it('movement history rejects empty stub (proves schema is enforced, not orphan)', () => {
    const parsed = grnMovementHistorySchema.safeParse({ entries: [] });
    expect(parsed.success).toBe(false);
  });

  it('validates health response shape', () => {
    const parsed = healthResponseSchema.safeParse({
      status: 'ok',
      service: 'cold-storage-backend',
      database: { state: 'connected', configured: true, name: 'cold_storage_test' },
      checkedAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });
});
