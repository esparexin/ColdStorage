import { describe, expect, it } from 'vitest';
import { validateMergeRepackedCounts } from '../modules/internal-movement/handlers/merge-grn-validation.helper.js';

describe('validateMergeRepackedCounts (Unit)', () => {
  const targetGrn = {
    bagType: 'S/B' as const,
    bags: 30,
    smallBags: 2,
    bigBags: 28,
    date: new Date('2026-04-01'),
    grnNumber: '0007',
    isCompositionVerified: true,
  };

  const sourceGrn = {
    id: 'grn-source-0011',
    grnNumber: '0011',
    inwardReceiptNumber: 'RCPT-0011',
    customerName: 'B SEENAIAH',
    chamber: 'CH-01',
    date: new Date('2026-04-01'),
    bags: 96,
    bagType: 'S/B' as const,
    smallBags: 48,
    bigBags: 48,
    commodityId: 'cmd-1',
    rentType: 'Seasonal' as const,
    rentAmount: 2000,
    status: 'OPEN' as const,
    loanStatus: 'NONE' as const,
  };

  it('reconciles repacking 96 source bags into 140 bags (70 Small + 70 Big)', () => {
    const result = validateMergeRepackedCounts({
      targetGrn,
      sourceGrns: [sourceGrn],
      totalMovedBags: 96,
      movementDate: new Date('2026-04-05'),
      isRepackSelected: true,
      repackedSmallBags: 70,
      repackedBigBags: 70,
    });

    expect(result.actualMovedBags).toBe(140);
    expect(result.smallMoved).toBe(70);
    expect(result.bigMoved).toBe(70);
    // Source bags = 96. Variance = 140 - 96 = +44
    expect(result.repackVariance).toBe(44);
    expect(result.explicitConfirmation).toBe(true);
  });

  it('reconciles repacking with reduction/waste into 25 bags (15 Small + 10 Big)', () => {
    const result = validateMergeRepackedCounts({
      targetGrn: {
        ...targetGrn,
        bags: 8,
        smallBags: 4,
        bigBags: 4,
      },
      sourceGrns: [{
        ...sourceGrn,
        bags: 30,
      }],
      totalMovedBags: 30,
      movementDate: new Date('2026-04-05'),
      isRepackSelected: true,
      repackedSmallBags: 15,
      repackedBigBags: 10,
    });

    expect(result.actualMovedBags).toBe(25);
    expect(result.smallMoved).toBe(15);
    expect(result.bigMoved).toBe(10);
    // Source bags = 30. Variance = 25 - 30 = -5
    expect(result.repackVariance).toBe(-5);
    expect(result.explicitConfirmation).toBe(true);
  });
});

