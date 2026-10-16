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

  it('builds a transfer payload with SETTLE_NOW decision satisfying the contract', () => {
    const payload = buildTransferPayload(
      'grn-1',
      'cust-2',
      'Ownership sale',
      'Paid at counter',
      '2026-10-10',
      'SETTLE_NOW',
      { amountPaid: 1500, paymentMode: 'Cash', paymentNotes: 'Full clearance' },
    );
    expect(payload.paymentDecision).toBe('SETTLE_NOW');
    expect(payload.settlementDetails?.amountPaid).toBe(1500);
    expect(transferOwnershipInputSchema.safeParse(payload).success).toBe(true);
  });

  it('builds a merge payload carrying forward additional rent amount', () => {
    const payload = buildMergePayload(
      'grn-target',
      ['grn-a'],
      'Consolidate lots',
      undefined,
      '2026-10-10',
      1200,
    );
    expect(payload.additionalRentAmount).toBe(1200);
    expect(mergeGrnInputSchema.safeParse(payload).success).toBe(true);
  });

  it('builds a merge payload with confirmed repacked bag composition', () => {
    const payload = buildMergePayload(
      'grn-target',
      ['grn-a'],
      'Repacked lot',
      'Confirmed mix',
      '2026-10-10',
      0,
      30,
      20,
    );
    expect(payload.repackedSmallBags).toBe(30);
    expect(payload.repackedBigBags).toBe(20);
    expect(mergeGrnInputSchema.safeParse(payload).success).toBe(true);
  });

  it('builds a merge payload with Hybrid category confirmation', () => {
    const payload = buildMergePayload(
      'grn-target',
      ['grn-a'],
      'Repacked lot',
      'Confirmed mix',
      '2026-10-10',
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Hybrid',
      50,
      12.5,
    );
    expect(payload.sourceBagCategory).toBe('Hybrid');
    expect(payload.sourceQuantity).toBe(50);
    expect(payload.sourceBagPrice).toBe(12.5);
    expect(mergeGrnInputSchema.safeParse(payload).success).toBe(true);
  });

  it('builds a merge payload with isRepackSelected and repackedBagCount', () => {
    const payload = buildMergePayload(
      'grn-target',
      ['grn-a'],
      'Repacked lot with hamali',
      undefined,
      '2026-10-10',
      0,
      30,
      20,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      50,
    );
    expect(payload.isRepackSelected).toBe(true);
    expect(payload.repackedBagCount).toBe(50);
    expect(mergeGrnInputSchema.safeParse(payload).success).toBe(true);
  });
});

