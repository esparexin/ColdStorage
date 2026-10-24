import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import {
  cleanRemarks,
  deriveMergedAttributes,
  extractMergedDetails,
  getLoanBadgeInfo,
} from '../grnDetailModal.helper';

describe('grnDetailModal.helper', () => {
  const baseGrn: Grn = {
    id: 'grn-1',
    facilityId: 'fac-1',
    grnNumber: 'GRN-25-26-0001',
    date: new Date('2026-04-01T00:00:00.000Z'),
    customerName: 'Kisan Traders',
    commodityName: 'Potatoes',
    chamber: 'CH-1',
    bags: 100,
    bagType: 'S',
    rentType: 'Seasonal',
    rentAmount: 5000,
    status: 'OPEN',
    storageMark: 'ST-001',
    partyMark: 'PM-001',
    remarks: 'Original lot. [MERGE RECEIVED on 2026-05-01: +50 bags from GRN-25-26-0002 (ST-002). Reason: Consolidation]',
    isBondForLoan: false,
    loanStatus: 'NONE',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Grn;

  it('cleans internal system movement markers from remarks', () => {
    expect(cleanRemarks(baseGrn.remarks)).toBe('Original lot.');
    expect(cleanRemarks(null)).toBe('');
    expect(cleanRemarks(undefined)).toBe('');
  });

  it('extracts merged details from remarks and allGrns list', () => {
    const sourceGrn: Grn = {
      ...baseGrn,
      id: 'grn-2',
      grnNumber: 'GRN-25-26-0002',
      chamber: 'CH-2',
      storageMark: 'ST-002',
      partyMark: 'PM-002',
      mergedIntoGrnNumber: 'GRN-25-26-0001',
    };

    const details = extractMergedDetails(baseGrn, [sourceGrn]);
    expect(details).toHaveLength(1);
    expect(details[0]).toEqual({
      grnNumber: 'GRN-25-26-0002',
      bags: 50,
      chamber: 'CH-2',
      storageMark: 'ST-002',
      partyMark: 'PM-002',
    });
  });

  it('extracts multi-source merged lots with repacking and carried rent remarks', () => {
    const multiMergedGrn: Grn = {
      ...baseGrn,
      grnNumber: '0013',
      bags: 74,
      remarks:
        '[MERGE RECEIVED on 2026-10-22: +60 bags (Repacked: 30 S + 30 B = 60 bags). Repacking Hamali: ₹1500 (60 bags @ ₹25/bag) from GRN 0010 (Receipt #BILL-10, Date: 2024-06-11, Customer: Kalyan, Bags: 10, Rent: ₹26100, Paid: ₹0, Balance: ₹26350, Status: Not Settled); GRN 0012 (Receipt #BILL-12, Date: 2025-07-17, Customer: Kalyan, Bags: 12, Rent: ₹13050, Paid: ₹0, Balance: ₹13350, Status: Not Settled). Carried pending rent: ₹39700. Reason: Internal Consolidation]',
    };

    const details = extractMergedDetails(multiMergedGrn, []);
    expect(details).toHaveLength(2);
    expect(details[0].grnNumber).toBe('0010');
    expect(details[0].bags).toBe(10);
    expect(details[1].grnNumber).toBe('0012');
    expect(details[1].bags).toBe(12);

    const derived = deriveMergedAttributes(multiMergedGrn, details);
    expect(derived.bagsBreakdown).toBe('52 + 22');
  });

  it('derives merged attributes (chambers, storage marks, party marks, bags breakdown)', () => {
    const mergedDetails = [
      {
        grnNumber: 'GRN-25-26-0002',
        bags: 50,
        chamber: 'CH-2',
        storageMark: 'ST-002',
        partyMark: 'PM-002',
      },
    ];

    const result = deriveMergedAttributes(baseGrn, mergedDetails);
    expect(result.mergedChambers).toEqual(['CH-2']);
    expect(result.mergedStorageMarks).toEqual(['ST-002']);
    expect(result.mergedPartyMarks).toEqual(['PM-002']);
    expect(result.bagsBreakdown).toBe('50 + 50');
  });

  it('evaluates loan badge info accurately across loan statuses', () => {
    const unbonded = getLoanBadgeInfo(baseGrn, false);
    expect(unbonded.text).toBe('Standard Storage');
    expect(unbonded.variant).toBe('neutral');
    expect(unbonded.bondNumberDisplay).toBe('None');

    const loanActive = getLoanBadgeInfo(
      { ...baseGrn, isBondForLoan: true, loanStatus: 'TAKEN', bondNumber: 'BND-01' },
      false,
    );
    expect(loanActive.text).toBe('Loan Active (Hold)');
    expect(loanActive.variant).toBe('danger');
    expect(loanActive.bondNumberDisplay).toBe('BND-01');

    const loanCleared = getLoanBadgeInfo(
      { ...baseGrn, isBondForLoan: true, loanStatus: 'CLEARED', bondNumber: 'BND-01' },
      false,
    );
    expect(loanCleared.text).toBe('Loan Cleared');
    expect(loanCleared.variant).toBe('success');

    // When lot was merged, bondNumberDisplay reflects active GRN number
    const mergedLot = getLoanBadgeInfo(baseGrn, true);
    expect(mergedLot.bondNumberDisplay).toBe('GRN-25-26-0001');
  });
});
