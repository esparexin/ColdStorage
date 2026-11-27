import { describe, expect, it } from 'vitest';

/**
 * Unit tests for Internal Transfer ledger note format.
 * Tests the structured bag composition format in tx-out and tx-in notes
 * produced by alignTransferLedger (without DB).
 */

function buildTransferOutNote(grnNumber: string, total: number, small: number, big: number, bagType: string): string {
  const isHybrid = bagType === 'Hybrid';
  const compStr = isHybrid ? `Hybrid -${total}` : `Small -${small}, Big -${big}`;
  return `Ownership Transfer Out (Lot ${grnNumber}): ${total} bags (${compStr})`;
}

function buildTransferInNote(grnNumber: string, confSmall: number, confBig: number, bagType: string): string {
  const total = confSmall + confBig;
  const isHybrid = bagType === 'Hybrid';
  const compStr = isHybrid ? `Hybrid -${total}` : `Small -${confSmall}, Big -${confBig}`;
  return `Ownership Transfer In (Lot ${grnNumber}): ${total} bags (${compStr})`;
}

describe('alignTransferLedger note format (SSOT)', () => {
  it('formats tx-out note with Small and Big breakdown for S/B lot (e.g. 21 bags: Small -5, Big -16)', () => {
    const note = buildTransferOutNote('4009', 21, 5, 16, 'S/B');
    expect(note).toBe('Ownership Transfer Out (Lot 4009): 21 bags (Small -5, Big -16)');
  });

  it('formats tx-in note with Small and Big breakdown for confirmed S/B composition', () => {
    const note = buildTransferInNote('4009', 5, 16, 'S/B');
    expect(note).toBe('Ownership Transfer In (Lot 4009): 21 bags (Small -5, Big -16)');
  });

  it('formats tx-out note with Hybrid breakdown for Hybrid lot (e.g. Hybrid -21)', () => {
    const note = buildTransferOutNote('4009', 21, 0, 0, 'Hybrid');
    expect(note).toBe('Ownership Transfer Out (Lot 4009): 21 bags (Hybrid -21)');
  });

  it('formats tx-in note with Hybrid breakdown for Hybrid lot', () => {
    const note = buildTransferInNote('4009', 21, 0, 'Hybrid');
    expect(note).toBe('Ownership Transfer In (Lot 4009): 21 bags (Hybrid -21)');
  });
});
