import { describe, expect, it } from 'vitest';
import type { Grn, InternalMovementRecord } from '@cold-storage/contracts';
import {
  mapStructuredMovementsToTableRows,
  parseRemarksToTableRows,
} from '../internalMovementNotes.helper';

describe('internalMovementNotes.helper (Transfer Ownership)', () => {
  const baseGrn: Grn = {
    id: 'grn-1', facilityId: 'fac-1', grnNumber: 'GRN-0100', date: new Date('2026-03-01'),
    customerId: 'cust-1', customerName: 'Ramesh Patel', commodityId: 'comm-1',
    commodityName: 'Potatoes', chamber: 'Chamber 1', bags: 300, closingBags: 300,
    smallBags: 150, bigBags: 150, bagType: 'S+B', rentType: 'Seasonal', rentAmount: 30000,
    status: 'OPEN', storageMark: 'LOT-A', partyMark: 'PM-99', loanStatus: 'NOT_TAKEN',
    bondNumber: 'BOND-0100', isBondForLoan: false, inwardReceiptNumber: 'IRN-0100',
    createdBy: 'user-admin', createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-01'),
  };

  describe('parseRemarksToTableRows (Transfer Ownership)', () => {
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

    it('parses modern ownership transfer remarks with explicit bag composition, invoice number, and fee without falling back to live stock', () => {
      const grnWithModernTransfer: Grn = {
        ...baseGrn,
        closingBags: 0,
        smallBags: 0,
        bigBags: 0,
        status: 'CLOSED',
        remarks:
          '[OWNERSHIP TRANSFERRED on 2026-11-05: +100 bags (S: 60 • B: 40, BagType: S/B) Invoice: #TRF-INV-2026-0001 Transfer Fee: ₹500 (Paid by BUYER) from Ramu Patel to Somu Agro. Reason: Outright commercial sale]',
      };
      const rows = parseRemarksToTableRows(grnWithModernTransfer);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('👤 Transfer');
      expect(rows[0].totalBags).toBe('100 bags');
      expect(rows[0].partyName).toBe('Ramu Patel → Somu Agro');
      expect(rows[0].grnLabel).toBe('#TRF-INV-2026-0001');
      expect(rows[0].refSub).toBe('GRN-0100');
      expect(rows[0].sbDetail).toContain('S: 60 • B: 40 (S/B)');
      expect(rows[0].sbDetail).toContain('Fee: ₹500 (Paid by BUYER)');
      expect(rows[0].reason).toBe('Outright commercial sale');
    });
  });

  describe('mapStructuredMovementsToTableRows (Transfer Ownership)', () => {
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

    it('maps structured TRANSFER_OWNERSHIP record with invoice number and transfer fee', () => {
      const structuredTransferWithFee: InternalMovementRecord = {
        id: 'mov-4',
        facilityId: 'fac-1',
        movementType: 'TRANSFER_OWNERSHIP',
        movementDate: new Date('2026-11-05'),
        grnId: 'grn-1',
        grnNumber: 'GRN-0100',
        sourceGrnIds: ['grn-1'],
        sourceGrnNumbers: ['GRN-0100'],
        fromCustomerId: 'cust-1',
        fromCustomerName: 'Ramesh Patel',
        toCustomerId: 'cust-2',
        toCustomerName: 'Suresh Kumar',
        totalBagsMoved: 100,
        smallBagsMoved: 60,
        bigBagsMoved: 40,
        resultingBagType: 'S/B',
        transferInvoiceNumber: 'TRF-INV-2026-0001',
        transferFeeCharged: 500,
        feePayer: 'BUYER',
        financialSnapshot: {
          rentAmount: 15000,
          totalPaid: 15000,
          remainingBalance: 0,
          paymentStatus: 'PAID',
        },
        remarks: 'Transfer with legal deed and invoice',
        performedBy: 'user-admin',
        createdAt: new Date('2026-11-05'),
      };

      const rows = mapStructuredMovementsToTableRows([structuredTransferWithFee], baseGrn);
      expect(rows).toHaveLength(1);
      expect(rows[0].badgeLabel).toBe('👤 Transfer');
      expect(rows[0].totalBags).toBe('100 bags');
      expect(rows[0].grnLabel).toBe('#TRF-INV-2026-0001');
      expect(rows[0].refSub).toBe('GRN-0100');
      expect(rows[0].sbDetail).toContain('S: 60 • B: 40 (S/B)');
      expect(rows[0].sbDetail).toContain('• Fee: ₹500 (BUYER)');
    });
  });
});
