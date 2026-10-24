import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import {
  filterEligibleGrns,
  getAvailableStockBags,
  parseMergedAddedBags,
  parseMergedRepackedDetail,
  parseMergedSourceGrns,
} from '../eligibleGrn.helper';

function createMockGrn(overrides: Partial<Grn> = {}): Grn {
  return {
    id: 'grn-01',
    facilityId: 'fac-1',
    grnNumber: '1001',
    date: new Date('2026-10-10'),
    customerId: 'cust-1',
    customerName: 'Original Owner',
    commodityId: 'cmd-1',
    commodityName: 'Dry Chilli',
    chamber: 'CH-1',
    bags: 500,
    closingBags: 500,
    bagType: 'S/B',
    rentType: 'Seasonal',
    smallBagPrice: 10,
    bigBagPrice: 20,
    bagPrice: 15,
    status: 'OPEN',
    loanStatus: 'NOT_TAKEN',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Grn;
}

describe('Outward Workflow Scenarios: Inward & Internal Movement to Outward', () => {
  describe('Scenario 1: Direct Inward → Outward', () => {
    it('allows selection of open Inward GRN with active stock', () => {
      const inwardGrn = createMockGrn({ id: 'inward-1', grnNumber: '1001', closingBags: 500, bagType: 'S/B' });
      const eligible = filterEligibleGrns([inwardGrn], '');
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('inward-1');
      expect(getAvailableStockBags(inwardGrn)).toBe(500);
    });

    it('preserves Hybrid bag type and single bag rate from Inward GRN', () => {
      const hybridGrn = createMockGrn({ id: 'hybrid-1', grnNumber: '1002', bagType: 'Hybrid', bagPrice: 18 });
      const eligible = filterEligibleGrns([hybridGrn], '');
      expect(eligible).toHaveLength(1);
      expect(eligible[0].bagType).toBe('Hybrid');
      expect(eligible[0].bagPrice).toBe(18);
    });
  });

  describe('Scenario 2: Merge into Existing GRN & Ownership Transfer → Outward', () => {
    it('excludes closed source GRN that was merged into target GRN', () => {
      const closedSourceGrn = createMockGrn({
        id: 'src-grn',
        grnNumber: '0001',
        status: 'CLOSED',
        closingBags: 0,
        mergedIntoGrnId: 'target-grn',
        mergedIntoGrnNumber: '0002',
      });
      const survivingTargetGrn = createMockGrn({
        id: 'target-grn',
        grnNumber: '0002',
        status: 'OPEN',
        closingBags: 900,
        remarks: 'Merged from GRN 0001 (500 bags) on 2026-10-23',
      });

      const eligible = filterEligibleGrns([closedSourceGrn, survivingTargetGrn], '');
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('target-grn');
      expect(getAvailableStockBags(closedSourceGrn)).toBe(0);
      expect(getAvailableStockBags(survivingTargetGrn)).toBe(900);
    });

    it('extracts merged source GRN number and surfaces surviving GRN when searching by merged GRN', () => {
      const survivingTargetGrn = createMockGrn({
        id: 'target-grn',
        grnNumber: '0002',
        status: 'OPEN',
        closingBags: 900,
        remarks: 'Merged 500 bags from GRN 0001 into GRN 0002',
      });

      const parsedSource = parseMergedSourceGrns(survivingTargetGrn.remarks);
      expect(parsedSource).toBe('0001');

      // Searching for merged source GRN "0001" returns the surviving GRN "0002"
      const searchResults = filterEligibleGrns([survivingTargetGrn], '0001');
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].grnNumber).toBe('0002');
    });

    it('extracts multi-source merged GRNs and added bag count for complex repacked merges', () => {
      const complexTargetGrn = createMockGrn({
        id: 'target-grn-0013',
        grnNumber: '0013',
        status: 'OPEN',
        bags: 74,
        closingBags: 74,
        remarks:
          '[MERGE RECEIVED on 2026-10-22: +60 bags (Repacked: 30 S + 30 B = 60 bags). Repacking Hamali: ₹1500 (60 bags @ ₹25/bag) from GRN 0010 (Receipt #BILL-10, Date: 2024-06-11, Customer: Kalyan, Bags: 10, Rent: ₹26100, Paid: ₹0, Balance: ₹26350, Status: Not Settled); GRN 0012 (Receipt #BILL-12, Date: 2025-07-17, Customer: Kalyan, Bags: 12, Rent: ₹13050, Paid: ₹0, Balance: ₹13350, Status: Not Settled). Carried pending rent: ₹39700. Reason: Internal Consolidation]',
      });

      const parsedSources = parseMergedSourceGrns(complexTargetGrn.remarks);
      expect(parsedSources).toBe('0010, 0012');

      const parsedAddedBags = parseMergedAddedBags(complexTargetGrn.remarks);
      expect(parsedAddedBags).toBe(60);

      const repackedDetail = parseMergedRepackedDetail(complexTargetGrn.remarks);
      expect(repackedDetail).toBe('30 Small, 30 Big');

      // Verify stock differentiation calculations
      const genesisInwardBags = complexTargetGrn.bags - parsedAddedBags!;
      expect(genesisInwardBags).toBe(14);
      expect(complexTargetGrn.bags).toBe(74);

      // Searching for either source GRN returns the surviving GRN
      expect(filterEligibleGrns([complexTargetGrn], '0010')).toHaveLength(1);
      expect(filterEligibleGrns([complexTargetGrn], '0012')).toHaveLength(1);
    });

    it('provides ownership-transferred customer details and inherits resulting GRN bag type and rates', () => {
      const transferredGrn = createMockGrn({
        id: 'transfer-grn',
        grnNumber: '1005',
        customerId: 'cust-new',
        customerName: 'New Transferred Buyer',
        bagType: 'Hybrid',
        bagPrice: 22,
        remarks: 'Ownership transferred from Old Seller to New Transferred Buyer',
      });

      const eligible = filterEligibleGrns([transferredGrn], 'New Transferred Buyer');
      expect(eligible).toHaveLength(1);
      expect(eligible[0].customerName).toBe('New Transferred Buyer');
      expect(eligible[0].bagType).toBe('Hybrid');
      expect(eligible[0].bagPrice).toBe(22);
    });
  });
});
