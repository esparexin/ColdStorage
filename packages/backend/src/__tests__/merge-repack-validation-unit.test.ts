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

  it('reconciles consolidated repacking into 140 bags (70 Small + 70 Big)', () => {
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
    // Consolidated input = 30 (target) + 96 (source) = 126. Variance = 140 - 126 = +14
    expect(result.repackVariance).toBe(14);
    expect(result.explicitConfirmation).toBe(true);
  });

  it('reconciles repacking with reduction/waste into 30 bags (20 Small + 10 Big)', () => {
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
      repackedSmallBags: 20,
      repackedBigBags: 10,
    });

    expect(result.actualMovedBags).toBe(30);
    expect(result.smallMoved).toBe(20);
    expect(result.bigMoved).toBe(10);
    // Consolidated input = 8 (target) + 30 (source) = 38. Variance = 30 - 38 = -8
    expect(result.repackVariance).toBe(-8);
    expect(result.explicitConfirmation).toBe(true);
  });
});

