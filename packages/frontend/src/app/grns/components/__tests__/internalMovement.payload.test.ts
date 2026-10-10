import { describe, expect, it } from 'vitest';
import { mergeGrnInputSchema, transferOwnershipInputSchema } from '@cold-storage/contracts';
import { buildMergePayload, buildTransferPayload } from '../internalMovementPayload.helper';

/**
 * Guards the production merge/transfer 400: both modal handlers previously
 * sent JSON bodies without `Content-Type: application/json`, so Express left
 * `req.body` empty and the canonical contracts rejected every request with
 * `targetGrnId/grnId: Required | ... | remarks: Required`. These tests pin
 * the exact wire shape against the backend-owned zod schemas.
 */
describe('internalMovement payload helpers', () => {
  it('builds a merge payload satisfying the canonical contract', () => {
    const payload = buildMergePayload(
      'grn-target',
      ['grn-a', 'grn-b'],
      'Rebagging',
      undefined,
      '2026-10-10',
    );
    expect(payload.additionalRentAmount).toBe(0);
    expect(mergeGrnInputSchema.safeParse(payload).success).toBe(true);
  });

  it('composes reason and additional remarks into a single remarks field', () => {
    const payload = buildMergePayload('grn-target', ['grn-a'], 'Rebagging', 'Notes for ledger');
    expect(payload.remarks).toBe('Rebagging. Notes for ledger');
    expect(mergeGrnInputSchema.safeParse(payload).success).toBe(true);
  });

  it('surfaces short remarks at the contract, matching the backend 400 text', () => {
    const payload = buildMergePayload('grn-target', ['grn-a'], 'ab');
    const parsed = mergeGrnInputSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it('builds a transfer payload satisfying the canonical contract', () => {
    const payload = buildTransferPayload(
      'grn-1',
      'cust-2',
      'Ownership change',
      undefined,
      '2026-10-10',
    );
    expect(transferOwnershipInputSchema.safeParse(payload).success).toBe(true);
  });

  it('defaults movementDate when omitted and still satisfies both contracts', () => {
    expect(mergeGrnInputSchema.safeParse(buildMergePayload('t', ['s'], 'Rebagging')).success).toBe(
      true,
    );
    expect(
      transferOwnershipInputSchema.safeParse(buildTransferPayload('g', 'c', 'Rebagging')).success,
    ).toBe(true);
  });
});
