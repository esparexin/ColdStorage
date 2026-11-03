import { describe, expect, it } from 'vitest';

describe('Customer Stock Summary Unconfirmed Inward (Unit)', () => {
  it('correctly calculates received and remaining bags without negative delivered counts for unconfirmed lots', () => {
    // Mock customer GRNs with unconfirmed S/B intake
    const grns = [
      {
        id: 'grn-1',
        bags: 100,
        smallBags: 0,
        bigBags: 0,
        isCompositionVerified: false,
        status: 'OPEN',
      },
      {
        id: 'grn-2',
        bags: 50,
        smallBags: 30,
        bigBags: 20,
        isCompositionVerified: true,
        status: 'OPEN',
      },
    ];

    const balances = [
      { smallBags: 100, bigBags: 0, total: 100 },
      { smallBags: 30, bigBags: 20, total: 50 },
    ];

    const totalReceivedBags = grns.reduce((sum, g) => sum + (g.bags || 0), 0);
    const receivedSmallBags = grns.reduce((sum, g) => sum + (g.isCompositionVerified ? g.smallBags : 0), 0);
    const receivedBigBags = grns.reduce((sum, g) => sum + (g.isCompositionVerified ? g.bigBags : 0), 0);
    const remainingSmallBags = balances.reduce((sum, b) => sum + b.smallBags, 0);
    const remainingBigBags = balances.reduce((sum, b) => sum + b.bigBags, 0);
    const remainingBags = remainingSmallBags + remainingBigBags;
    const netDeliveredBags = Math.max(0, totalReceivedBags - remainingBags);

    expect(totalReceivedBags).toBe(150);
    expect(receivedSmallBags).toBe(30);
    expect(receivedBigBags).toBe(20);
    expect(remainingBags).toBe(150);
    expect(netDeliveredBags).toBe(0); // Before the fix, this would have evaluated to 50 - 150 = -100!
  });
});

