import { describe, expect, it } from 'vitest';
import { isDuplicateKeyError, isIdempotencyDuplicateKey } from '../delivery-idempotency.helper.js';

describe('delivery-idempotency duplicate-key classifier', () => {
  it('routes idempotency races without leaking internals', () => {
    const idemDup = { code: 11000, keyPattern: { facilityId: 1, idempotencyKey: 1 }, message: 'E11000 duplicate key error collection: db.deliverychallans index: facilityId_1_idempotencyKey_1' };
    expect(isDuplicateKeyError(idemDup)).toBe(true);
    expect(isIdempotencyDuplicateKey(idemDup)).toBe(true);
    const otherDup = { code: 11000, keyPattern: { facilityId: 1, gpNumber: 1 }, message: 'E11000 duplicate key error index: facilityId_1_gpNumber_1' };
    expect(isDuplicateKeyError(otherDup)).toBe(true);
    expect(isIdempotencyDuplicateKey(otherDup)).toBe(false);
    expect(isDuplicateKeyError({ code: 112 })).toBe(false);
    expect(isDuplicateKeyError(new Error('plain'))).toBe(false);
  });
});
