import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import { deriveAutoInheritedBagComposition, type BagConfirmationValue } from '../bagConfirmation.helper';
import { computeOutwardRentCharge } from '../../../deliveries/hooks/deliveryRent.helper';

describe('mergePerGrnStep2 per-GRN bag type and rent separation', () => {
  const grn3769: Grn = {
    id: 'grn-3769',
    facilityId: 'fac-1',
    grnNumber: '3769',
    inwardReceiptNumber: 'RCP-3769',
    date: new Date('2026-05-04'),
    customerId: 'cust-1',
    customerName: 'A SRINIVASULU CHUTTI',
    commodityId: 'cmd-1',
    commodityName: 'Mirchi',
    chamber: 'A-17,18',
    bags: 83,
    closingBags: 83,
    bagType: 'S/B',
    smallBags: 83,
    bigBags: 0,
    smallBagPrice: 110,
    bigBagPrice: 185,
    rentAmount: 0,
    rentType: 'Seasonal',
    status: 'OPEN',
    createdBy: 'admin',
    isBondForLoan: false,
    bondNumber: null,
    loanStatus: 'NONE',
  };

  const grn0003: Grn = {
    id: 'grn-0003',
    facilityId: 'fac-1',
    grnNumber: '0003',
    inwardReceiptNumber: 'RCP-0003',
    date: new Date('2024-07-11'),
    customerId: 'cust-1',
    customerName: 'A SRINIVASULU CHUTTI',
    commodityId: 'cmd-1',
    commodityName: 'Mirchi',
    chamber: 'abc123',
    bags: 10,
    closingBags: 10,
    bagType: 'S/B',
    smallBags: 10,
    bigBags: 0,
    smallBagPrice: 110,
    bigBagPrice: 185,
    rentAmount: 0,
    rentType: 'Seasonal',
    status: 'OPEN',
    createdBy: 'admin',
    isBondForLoan: false,
    bondNumber: null,
    loanStatus: 'NONE',
  };

  it('initializes independent bag confirmations per source GRN without mixing totals', () => {
    const selectedSources = [grn3769, grn0003];
    const initialConfirmations: Record<string, BagConfirmationValue> = {};

    for (const s of selectedSources) {
      const bags = s.closingBags ?? s.bags;
      initialConfirmations[s.id] = deriveAutoInheritedBagComposition([s], bags);
    }

    expect(initialConfirmations['grn-3769'].smallBags).toBe(83);
    expect(initialConfirmations['grn-3769'].bigBags).toBe(0);

    expect(initialConfirmations['grn-0003'].smallBags).toBe(10);
    expect(initialConfirmations['grn-0003'].bigBags).toBe(0);

    expect(initialConfirmations['grn-3769'].smallBags).not.toBe(initialConfirmations['grn-0003'].smallBags);
  });

  it('updates one source GRN confirmation without mutating other GRNs', () => {
    const sourceConfirmations: Record<string, BagConfirmationValue> = {
      'grn-3769': deriveAutoInheritedBagComposition([grn3769], 83),
      'grn-0003': deriveAutoInheritedBagComposition([grn0003], 10),
    };

    // User splits GRN 3769 into 50 Small and 33 Big bags
    const updated: Record<string, BagConfirmationValue> = {
      ...sourceConfirmations,
      'grn-3769': {
        ...sourceConfirmations['grn-3769'],
        smallBags: 50,
        bigBags: 33,
      },
    };
    

    expect(updated['grn-3769'].smallBags).toBe(50);
    expect(updated['grn-3769'].bigBags).toBe(33);

    // GRN 0003 remains untouched
    expect(updated['grn-0003'].smallBags).toBe(10);
    expect(updated['grn-0003'].bigBags).toBe(0);
  });

  it('calculates rent strictly using each source GRN own bag quantity and rates', () => {
    const movementDate = '2026-10-23';

    // Calculate rent for GRN 3769 (83 bags)
    const rent3769 = computeOutwardRentCharge({
      rentType: grn3769.rentType,
      bagCategory: 'S/B',
      smallBags: 83,
      bigBags: 0,
      inwardDate: grn3769.date,
      deliveryDate: movementDate,
      smallBagPrice: grn3769.smallBagPrice,
      bigBagPrice: grn3769.bigBagPrice,
    });

    // 83 Small × 110 = 9130
    expect(rent3769).toBe(83 * 110);

    // Calculate rent for GRN 0003 (10 bags, older season with excludePeriodKeys for 2026)
    const rent0003 = computeOutwardRentCharge({
      rentType: grn0003.rentType,
      bagCategory: 'S/B',
      smallBags: 10,
      bigBags: 0,
      inwardDate: grn0003.date,
      deliveryDate: movementDate,
      smallBagPrice: grn0003.smallBagPrice,
      bigBagPrice: grn0003.bigBagPrice,
    });

    // Rent must be calculated on 10 bags, NOT 290 bags or 83 bags!
    expect(rent0003).toBeGreaterThan(0);
    expect(rent0003).toBeLessThan(rent3769);
  });

  it('aggregates moved small and big bags accurately across all source confirmations', () => {
    const selectedSources = [grn3769, grn0003];
    const sourceConfirmations: Record<string, BagConfirmationValue> = {
      'grn-3769': {
        ...deriveAutoInheritedBagComposition([grn3769], 83),
        smallBags: 60,
        bigBags: 23,
      },
      'grn-0003': {
        ...deriveAutoInheritedBagComposition([grn0003], 10),
        smallBags: 10,
        bigBags: 0,
      },
    };

    const movedSmall = selectedSources.reduce((acc, s) => {
      const c = sourceConfirmations[s.id];
      return acc + (c && typeof c.smallBags === 'number' ? c.smallBags : (s.smallBags ?? (s.closingBags ?? s.bags)));
    }, 0);

    const movedBig = selectedSources.reduce((acc, s) => {
      const c = sourceConfirmations[s.id];
      return acc + (c && typeof c.bigBags === 'number' ? c.bigBags : (s.bigBags ?? 0));
    }, 0);

    expect(movedSmall).toBe(70); // 60 + 10
    expect(movedBig).toBe(23); // 23 + 0
    expect(movedSmall + movedBig).toBe(93); // 83 + 10
  });
});
