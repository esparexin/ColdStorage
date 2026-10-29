import { describe, expect, it } from 'vitest';
import { parseOwnershipTransferDisplayInfo } from '../rentDisplay.helper';

describe('parseOwnershipTransferDisplayInfo', () => {
  it('returns null when remarks are null, empty, or have no transfer note', () => {
    expect(parseOwnershipTransferDisplayInfo(null)).toBeNull();
    expect(parseOwnershipTransferDisplayInfo('')).toBeNull();
    expect(parseOwnershipTransferDisplayInfo('Regular lot note')).toBeNull();
  });

  it('correctly parses transfer with carried pending rent debt', () => {
    const remarks =
      '[OWNERSHIP TRANSFERRED on 2026-10-15: from Ramesh Patel (ID: cust-1) to Suresh Kumar (ID: cust-2). Pending rent obligation: ₹4500 carried forward under agreed pending terms. Rent obligation: ₹4500 (Prior collected: ₹0). Reason: Sale agreement]';
    const info = parseOwnershipTransferDisplayInfo(remarks);

    expect(info).toEqual({
      isTransferred: true,
      fromParty: 'Ramesh Patel',
      toParty: 'Suresh Kumar',
      hasCarriedDebt: true,
    });
  });

  it('correctly parses transfer settled at transfer (no carried debt)', () => {
    const remarks =
      '[OWNERSHIP TRANSFERRED on 2026-10-15: from Ramesh Patel (ID: cust-1) to Suresh Kumar (ID: cust-2). Settled at transfer: ₹4500 (Receipt #RRCPT-26-27-0012). Rent obligation: ₹4500 (Status: Settled). Reason: Full transfer]';
    const info = parseOwnershipTransferDisplayInfo(remarks);

    expect(info).toEqual({
      isTransferred: true,
      fromParty: 'Ramesh Patel',
      toParty: 'Suresh Kumar',
      hasCarriedDebt: false,
    });
  });
});
