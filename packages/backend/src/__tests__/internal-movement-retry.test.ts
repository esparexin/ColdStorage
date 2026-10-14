import { describe, it, expect } from 'vitest';
import { isTransientError, withMongoRetry } from '../modules/common/mongo-retry.helper.js';

describe('Concurrency & Transaction Retry Governance', () => {
  it('correctly classifies transient MongoDB transaction errors', () => {
    expect(isTransientError({ hasErrorLabel: (l: string) => l === 'TransientTransactionError' })).toBe(true);
    expect(isTransientError({ code: 112 })).toBe(true);
    expect(isTransientError({ code: 251 })).toBe(true);
    expect(isTransientError({ message: 'WriteConflict occurred during transaction' })).toBe(true);

    // E11000 (duplicate key) is NOT transient and must not be retried into a false success
    expect(isTransientError({ code: 11000, message: 'E11000 duplicate key error' })).toBe(false);
    expect(isTransientError(new Error('Validation failed'))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });

  it('retries transient write conflicts and resolves on subsequent attempt', async () => {
    let callCount = 0;
    const transientErr = { code: 112, message: 'WriteConflict' };

    const result = await withMongoRetry(async () => {
      callCount += 1;
      if (callCount < 2) {
        throw transientErr;
      }
      return 'success';
    });

    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });

  it('fails fast on non-transient error without unnecessary retry loops', async () => {
    let callCount = 0;
    const fatalErr = new Error('GRN already CLOSED');

    await expect(
      withMongoRetry(async () => {
        callCount += 1;
        throw fatalErr;
      }),
    ).rejects.toThrow('GRN already CLOSED');

    expect(callCount).toBe(1);
  });

  it('re-throws when transient errors exceed maximum allowed attempts', async () => {
    let callCount = 0;
    const transientErr = { code: 112, message: 'WriteConflict' };

    await expect(
      withMongoRetry(async () => {
        callCount += 1;
        throw transientErr;
      }, 2),
    ).rejects.toEqual(transientErr);

    expect(callCount).toBe(2);
  });
});
