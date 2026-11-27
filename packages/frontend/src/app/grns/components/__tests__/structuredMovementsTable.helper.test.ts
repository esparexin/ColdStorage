import { describe, expect, it } from 'vitest';
import type { Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { mapStructuredMovementsToTableRows } from '../structuredMovementsTable.helper';

describe('structuredMovementsTable.helper', () => {
  const baseGrn: Grn = {
    id: 'grn-1', facilityId: 'fac-1', grnNumber: 'GRN-0100', date: new Date('2026-03-01'),
    customerId: 'cust-1', customerName: 'Ramesh Patel', commodityId: 'comm-1',
    commodityName: 'Potatoes', chamber: 'Chamber 1', bags: 300, closingBags: 300,
    smallBags: 150, bigBags: 150, bagType: 'S+B', rentType: 'Seasonal', rentAmount: 30000,
    status: 'OPEN', storageMark: 'LOT-A', partyMark: 'PM-99', loanStatus: 'NOT_TAKEN',
    bondNumber: 'BOND-0100', isBondForLoan: false, inwardReceiptNumber: 'IRN-0100',
    createdBy: 'user-admin', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-01'),
  };

  describe('mapStructuredMovementsToTableRows (database SSOT)', () => {
    it('maps structured MERGE In record cleanly', () => {
      const structuredMergeIn: InternalMovementRecord = {
        id: 'mov-1',
        facilityId: 'fac-1',
        movementType: 'MERGE',
        movementDate: new Date('2026-10-12'),
        targetGrnId: 'grn-1',
        targetGrnNumber: 'GRN-0100',
        sourceGrnIds: ['grn-2'],
        sourceGrnNumbers: ['GRN-0050'],
        totalBagsMoved: 60,
        smallBagsMoved: 40,
        bigBagsMoved: 20,
        financialSnapshot: {
          rentAmount: 36000,
          totalPaid: 0,
          remainingBalance: 36000,
          paymentStatus: 'UNPAID',
        },
        remarks: 'Direct consolidation into target lot',
        performedBy: 'user-admin',
        createdAt: new Date('2026-10-12'),
      };

      const rows = mapStructuredMovementsToTableRows([structuredMergeIn], baseGrn);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('📥 Merge In');
      expect(rows[0].badgeVariant).toBe('success');
      expect(rows[0].grnLabel).toBe('From: GRN-0050');
      expect(rows[0].totalBags).toBe('+60 bags');
      expect(rows[0].sbDetail).toBe('S: 40 • B: 20 (S+B)');
      expect(rows[0].reason).toBe('Direct consolidation into target lot');
    });

    it('maps structured MERGE In record with repacking hamali rate and charge', () => {
      const structuredMergeInWithHamali: InternalMovementRecord = {
        id: 'mov-hamali-1',
        facilityId: 'fac-1',
        movementType: 'MERGE',
        movementDate: new Date('2026-10-12'),
        targetGrnId: 'grn-1',
        targetGrnNumber: 'GRN-0100',
        sourceGrnIds: ['grn-2'],
        sourceGrnNumbers: ['GRN-0030'],
        totalBagsMoved: 10,
        smallBagsMoved: 10,
        bigBagsMoved: 0,
        hamaliBags: 10,
        hamaliRate: 20,
        hamaliCharge: 200,
        financialSnapshot: {
          rentAmount: 7200,
          totalPaid: 0,
          remainingBalance: 7200,
          paymentStatus: 'UNPAID',
        },
        remarks: 'Re-bagging lot',
        performedBy: 'user-admin',
        createdAt: new Date('2026-10-12'),
      };

      const rows = mapStructuredMovementsToTableRows([structuredMergeInWithHamali], baseGrn);
      expect(rows).toHaveLength(1);
      expect(rows[0].sbDetail).toBe('S: 10 • B: 0 (S+B) • Hamali: ₹200 (@₹20/bag)');
    });

    it('maps structured MERGE Out record cleanly', () => {
      const structuredMergeOut: InternalMovementRecord = {
        id: 'mov-2',
        facilityId: 'fac-1',
        movementType: 'MERGE',
        movementDate: new Date('2026-10-12'),
        targetGrnId: 'grn-target-99',
        targetGrnNumber: 'GRN-0999',
        sourceGrnIds: ['grn-1'],
        sourceGrnNumbers: ['GRN-0100'],
        totalBagsMoved: 300,
        smallBagsMoved: 150,
        bigBagsMoved: 150,
        financialSnapshot: {
          rentAmount: 0,
          totalPaid: 0,
          remainingBalance: 0,
          paymentStatus: 'SETTLED',
        },
        remarks: 'Merged into main stock',
        performedBy: 'user-admin',
        createdAt: new Date('2026-10-12'),
      };

      const rows = mapStructuredMovementsToTableRows([structuredMergeOut], baseGrn);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('📤 Merged Out');
      expect(rows[0].badgeVariant).toBe('neutral');
      expect(rows[0].grnLabel).toBe('Into: GRN-0999');
      expect(rows[0].totalBags).toBe('300 bags');
    });
  });
});
