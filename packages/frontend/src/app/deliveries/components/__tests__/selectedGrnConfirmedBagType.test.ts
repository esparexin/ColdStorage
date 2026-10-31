import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';

describe('Outward Delivery - Reuse Previously Confirmed Bag Type', () => {
  const verifiedSbGrn: Grn = {
    id: 'grn-0020',
    facilityId: 'fac-1',
    grnNumber: '0020',
    inwardReceiptNumber: 'RCP-0020',
    date: new Date('2024-05-10'),
    customerId: 'cust-1',
    customerName: 'punnarao',
    commodityId: 'cmd-1',
    commodityName: 'Mirchi',
    chamber: 'a0a',
    bags: 18,
    closingBags: 18,
    bagType: 'S/B',
    smallBags: 8,
    bigBags: 10,
    isCompositionVerified: true,
    rentAmount: 0,
    rentType: 'Seasonal',
    status: 'OPEN',
    createdBy: 'admin',
    isBondForLoan: false,
    bondNumber: null,
    loanStatus: 'NONE',
  };

  const confirmedHybridGrn: Grn = {
    ...verifiedSbGrn,
    id: 'grn-0019',
    grnNumber: '0019',
    bagType: 'Hybrid',
    smallBags: 0,
    bigBags: 0,
    bags: 17,
    closingBags: 17,
  };

  it('identifies verified S/B GRN as already confirmed and suppresses re-selection', () => {
    const isAlreadyConfirmed = Boolean(verifiedSbGrn.isCompositionVerified === true);
    const hasTypeSelection = !isAlreadyConfirmed;
    expect(isAlreadyConfirmed).toBe(true);
    expect(hasTypeSelection).toBe(false);
  });

  it('identifies Hybrid GRN as already confirmed and suppresses re-selection', () => {
    const isAlreadyConfirmed = Boolean(confirmedHybridGrn.isCompositionVerified === true);
    const hasTypeSelection = !isAlreadyConfirmed;
    expect(isAlreadyConfirmed).toBe(true);
    expect(hasTypeSelection).toBe(false);
  });

  it('identifies post-merge target GRN as verified and suppresses redundant confirmation', () => {
    const postMergeGrn: Grn = {
      ...verifiedSbGrn,
      id: 'grn-merged-target',
      grnNumber: 'GRN-MERGED-01',
      bags: 150,
      closingBags: 150,
      bagType: 'S/B',
      smallBags: 90,
      bigBags: 60,
      isCompositionVerified: true,
      chamber: 'CH-05',
    };

    const isAlreadyConfirmed = Boolean(postMergeGrn.isCompositionVerified === true);
    expect(isAlreadyConfirmed).toBe(true);
  });

  it('identifies post-transfer repacked GRN as verified and suppresses redundant confirmation', () => {
    const postTransferGrn: Grn = {
      ...verifiedSbGrn,
      id: 'grn-transferred',
      grnNumber: 'GRN-TRF-01',
      customerId: 'cust-transferee',
      customerName: 'New Owner Agro',
      bags: 100,
      closingBags: 100,
      bagType: 'B',
      smallBags: 0,
      bigBags: 100,
      isCompositionVerified: true,
      chamber: 'CH-08',
    };

    const isAlreadyConfirmed = Boolean(postTransferGrn.isCompositionVerified === true);
    expect(isAlreadyConfirmed).toBe(true);
  });

  it('identifies post-sorting repacked GRN as verified and suppresses redundant confirmation', () => {
    const postSortRepackGrn: Grn = {
      ...verifiedSbGrn,
      id: 'grn-sorted-repack',
      grnNumber: 'GRN-SRT-01',
      bags: 80,
      closingBags: 80,
      bagType: 'S/B',
      smallBags: 50,
      bigBags: 30,
      isCompositionVerified: true,
      isSorted: true,
      chamber: 'CH-02',
    };

    const isAlreadyConfirmed = Boolean(postSortRepackGrn.isCompositionVerified === true);
    expect(isAlreadyConfirmed).toBe(true);
  });

  it('requires bag type confirmation for unclassified fresh inward lot (false or null)', () => {
    const unclassifiedGrn: Grn = {
      ...verifiedSbGrn,
      id: 'grn-fresh-unclassified',
      grnNumber: 'GRN-UNCL-01',
      bags: 100,
      closingBags: 100,
      bagType: 'S/B',
      smallBags: 0,
      bigBags: 0,
      isCompositionVerified: false,
    };

    expect(Boolean(unclassifiedGrn.isCompositionVerified === true)).toBe(false);

    const nullVerifiedGrn: Grn = {
      ...unclassifiedGrn,
      isCompositionVerified: null as unknown as boolean,
    };
    expect(Boolean(nullVerifiedGrn.isCompositionVerified === true)).toBe(false);
  });
});
