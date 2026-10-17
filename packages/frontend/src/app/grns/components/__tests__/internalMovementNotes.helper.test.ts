import { describe, expect, it } from 'vitest';
import type { Grn, InternalMovementRecord } from '@cold-storage/contracts';
import {
  mapStructuredMovementsToTableRows,
  parseMergedGrnNotes,
  parseRemarksToTableRows,
} from '../internalMovementNotes.helper';

describe('internalMovementNotes.helper', () => {
  const baseGrn: Grn = {
    id: 'grn-1', facilityId: 'fac-1', grnNumber: 'GRN-0100', date: new Date('2026-03-01'),
    customerId: 'cust-1', customerName: 'Ramesh Patel', commodityId: 'comm-1',
    commodityName: 'Potatoes', chamber: 'Chamber 1', bags: 300, closingBags: 300,
    smallBags: 150, bigBags: 150, bagType: 'S+B', rentType: 'Seasonal', rentAmount: 30000,
    status: 'OPEN', storageMark: 'LOT-A', partyMark: 'PM-99', loanStatus: 'NOT_TAKEN',
    bondNumber: 'BOND-0100', isBondForLoan: false, inwardReceiptNumber: 'IRN-0100',
    createdBy: 'user-admin', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-01'),
  };

  describe('parseMergedGrnNotes', () => {
    it('returns empty array when remarks is empty or null', () => {
      expect(parseMergedGrnNotes(null)).toEqual([]);
      expect(parseMergedGrnNotes('')).toEqual([]);
      expect(parseMergedGrnNotes('No notes here')).toEqual([]);
    });

    it('parses valid merge note with carried rent and repacked detail', () => {
      const remarks =
        '[MERGE RECEIVED on 2026-10-12: +50 bags (Repacked: 35 S + 15 B) from GRN-0109. Carried pending rent: ₹1200. Reason: Re-bagged into smaller sizes]';
      const notes = parseMergedGrnNotes(remarks);
      expect(notes).toHaveLength(1);
      expect(notes[0].bags).toBe(50);
      expect(notes[0].source).toBe('GRN-0109');
      expect(notes[0].carriedRent).toBe(1200);
      expect(notes[0].repackedDetail).toBe('Repacked: 35 S + 15 B');
    });
  });

  describe('parseRemarksToTableRows (legacy fallback)', () => {
    it('parses legacy merge received remarks correctly', () => {
      const grnWithRemarks: Grn = {
        ...baseGrn,
        remarks:
          '[MERGE RECEIVED on 2026-10-12: +50 bags from GRN-0109 (Customer: Suresh Kumar). Reason: Consolidation]',
      };
      const rows = parseRemarksToTableRows(grnWithRemarks);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('📥 Merge In');
      expect(rows[0].grnLabel).toBe('From: GRN-0109');
      expect(rows[0].partyName).toBe('Suresh Kumar');
      expect(rows[0].totalBags).toBe('+50 bags');
    });

    it('parses repacking hamali from remarks into sbDetail', () => {
      const grnWithHamaliRemarks: Grn = {
        ...baseGrn,
        remarks:
          '[MERGE RECEIVED on 2026-10-16: +10 bags (Repacked: 10 S + 0 B). Repacking Hamali: ₹200 (10 bags @ ₹20/bag) from GRN-0030 (Customer: Penchaliah). Reason: Re-bagging lot]',
      };
      const rows = parseRemarksToTableRows(grnWithHamaliRemarks);
      expect(rows).toHaveLength(1);
      expect(rows[0].totalBags).toBe('+10 bags');
      expect(rows[0].sbDetail).toContain('Hamali: ₹200 (10 bags @ ₹20/bag)');
    });

    it('parses legacy ownership transfer remarks correctly', () => {
      const grnWithTransfer: Grn = {
        ...baseGrn,
        remarks:
          '[OWNERSHIP TRANSFERRED on 2026-10-13: from Ramesh Patel to Suresh Kumar. Reason: Sale agreement]',
      };
      const rows = parseRemarksToTableRows(grnWithTransfer);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('👤 Transfer');
      expect(rows[0].partyName).toBe('Ramesh Patel → Suresh Kumar');
      expect(rows[0].reason).toBe('Sale agreement');
    });

    it('parses merged-out GRN remarks with authoritative merge date instead of inward date', () => {
      const mergedOutGrn: Grn = {
        ...baseGrn,
        date: new Date('2026-03-01'), // Inward date
        status: 'CLOSED',
        mergedIntoGrnNumber: 'GRN-0200',
        remarks:
          '[MERGED into GRN GRN-0200 on 2026-10-15: 300 bags cleared. Reason: Stock consolidation into target lot]',
      };
      const rows = parseRemarksToTableRows(mergedOutGrn);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('📤 Merged Out');
      expect(rows[0].date).toBe('2026-10-15'); // Authoritative merge date, NOT 2026-03-01
      expect(rows[0].grnLabel).toBe('Into: GRN-0200');
      expect(rows[0].reason).toBe('Stock consolidation into target lot');
    });
  });

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

    it('maps structured TRANSFER_OWNERSHIP record cleanly', () => {
      const structuredTransfer: InternalMovementRecord = {
        id: 'mov-3',
        facilityId: 'fac-1',
        movementType: 'TRANSFER_OWNERSHIP',
        movementDate: new Date('2026-10-13'),
        grnId: 'grn-1',
        grnNumber: 'GRN-0100',
        sourceGrnIds: ['grn-1'],
        sourceGrnNumbers: ['GRN-0100'],
        fromCustomerId: 'cust-1',
        fromCustomerName: 'Ramesh Patel',
        toCustomerId: 'cust-2',
        toCustomerName: 'Suresh Kumar',
        totalBagsMoved: 300,
        smallBagsMoved: 150,
        bigBagsMoved: 150,
        financialSnapshot: {
          rentAmount: 30000,
          totalPaid: 30000,
          remainingBalance: 0,
          paymentStatus: 'PAID',
        },
        remarks: 'Transfer on contract clearance',
        performedBy: 'user-admin',
        createdAt: new Date('2026-10-13'),
      };

      const rows = mapStructuredMovementsToTableRows([structuredTransfer], baseGrn);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('👤 Transfer');
      expect(rows[0].badgeVariant).toBe('warning');
      expect(rows[0].partyName).toBe('Ramesh Patel → Suresh Kumar');
      expect(rows[0].reason).toBe('Transfer on contract clearance');
    });
  });
});
