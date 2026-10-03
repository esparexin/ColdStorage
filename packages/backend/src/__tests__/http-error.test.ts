import { describe, expect, it } from 'vitest';
import {
  classifyDomainError,
  statusForDomainError,
} from '../utils/http-error.js';

describe('Canonical domain error classification', () => {
  it('maps uniqueness and referential-integrity messages to 409 Conflict', () => {
    const conflicts = [
      'Chamber number CH-1 already exists in this facility',
      'Mobile 9876543210 is already registered for all requested facilities',
      'Username ops is already in use',
      'Cannot delete chamber: it has active chambers',
      'Cannot delete position: active inventory exists',
      'New capacity would reduce capacity below current occupancy',
      'Parent Rack is inactive',
    ];

    for (const message of conflicts) {
      expect(classifyDomainError(message), message).toBe('conflict');
      expect(statusForDomainError(message), message).toBe(409);
    }
  });

  it('maps missing-entity messages to 404 Not Found', () => {
    expect(classifyDomainError("GRN 'grn-1' not found in facility 'fac-1'")).toBe('notFound');
    expect(classifyDomainError('Position no longer exists')).toBe('notFound');
    expect(statusForDomainError("Customer 'cust-1' not found")).toBe(404);
  });

  it('maps authorization failures to 403 Forbidden', () => {
    expect(classifyDomainError('Unauthorized: facility scope violation')).toBe('unauthorized');
    expect(statusForDomainError('Unauthorized')).toBe(403);
  });

  it('falls back to 400 for ordinary validation failures', () => {
    expect(classifyDomainError('Payment date cannot be in the future')).toBe('badRequest');
    expect(statusForDomainError('Bags allocated must be a positive integer')).toBe(400);
  });

  it('checks authorization before conflict markers', () => {
    // 'Unauthorized' must win even when the message also mentions a conflict-shaped word.
    expect(classifyDomainError('Unauthorized: active facility access denied')).toBe('unauthorized');
  });
});