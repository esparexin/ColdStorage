import { describe, expect, it } from 'vitest';
import type { Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { mapStructuredMovementsToTableRows } from '../structuredMovementsTable.helper';

describe('structuredMovementsTable.helper', () => {
  const sampleGrn: Grn = {
    id: 'grn-1',
    facilityId: 'fac-1',
    grnNumber: 'GRN-0100',
    date: new Date('2026-03-01'),
    customerId: 'cust-1',
    customerName: 'Ramesh Patel',
    commodityId: 'comm-1',
    commodityName: 'Potatoes',
    chamber: 'Chamber 1',
    bags: 300,
    closingBags: 300,
    smallBags: 150,
    bigBags: 150,
    bagType: 'S+B',
    rentType: 'Seasonal',
    rentAmount: 30000,
    status: 'OPEN',
    storageMark: 'LOT-A',
    partyMark: 'PM-99',
    loanStatus: 'NOT_TAKEN',
    bondNumber: 'BOND-0100',
    isBondForLoan: false,
    inwardReceiptNumber: 'IRN-0100',
    createdBy: 'user-admin',
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
  };

  it('maps structured MERGE In record with hamali and repacking breakdown', () => {
    const structuredMergeInWithHamali: InternalMovementRecord = {
      id: 'mov-1',
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

    const rows = mapStructuredMovementsToTableRows([structuredMergeInWithHamali], sampleGrn);
    expect(rows).toHaveLength(1);
    expect(rows[0].badgeLabel).toBe('📥 Merge In');
    expect(rows[0].badgeVariant).toBe('success');
    expect(rows[0].grnLabel).toBe('From: GRN-0030');
    expect(rows[0].totalBags).toBe('+10 bags');
    expect(rows[0].sbDetail).toBe('S: 10 • B: 0 (S+B) • Hamali: ₹200 (@₹20/bag)');
    expect(rows[0].reason).toBe('Re-bagging lot');
  });

  it('maps structured MERGE In record for hybrid bag type', () => {
    const hybridGrn: Grn = {
      ...sampleGrn,
      bagType: 'Hybrid',
      bagPrice: 50,
      smallBagPrice: undefined,
      bigBagPrice: undefined,
    };

    const structuredMergeIn: InternalMovementRecord = {
      id: 'mov-1-hybrid',
      facilityId: 'fac-1',
      movementType: 'MERGE',
      movementDate: new Date('2026-10-12'),
      targetGrnId: 'grn-1',
      targetGrnNumber: 'GRN-0100',
      sourceGrnIds: ['grn-2'],
      sourceGrnNumbers: ['GRN-0030'],
      totalBagsMoved: 25,
      smallBagsMoved: 0,
      bigBagsMoved: 0,
      hamaliBags: 0,
      financialSnapshot: {
        rentAmount: 1250,
        totalPaid: 0,
        remainingBalance: 1250,
        paymentStatus: 'UNPAID',
      },
      remarks: 'Hybrid merge',
      performedBy: 'user-admin',
      createdAt: new Date('2026-10-12'),
    };

    const rows = mapStructuredMovementsToTableRows([structuredMergeIn], hybridGrn);
    expect(rows).toHaveLength(1);
    expect(rows[0].sbDetail).toBe('Hybrid (Hybrid)');
  });

  it('maps structured MERGE Out record when current GRN was merged into a surviving target', () => {
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

    const rows = mapStructuredMovementsToTableRows([structuredMergeOut], sampleGrn);
    expect(rows).toHaveLength(1);
    expect(rows[0].badgeLabel).toBe('📤 Merged Out');
    expect(rows[0].badgeVariant).toBe('neutral');
    expect(rows[0].grnLabel).toBe('Into: GRN-0999');
    expect(rows[0].totalBags).toBe('300 bags');
    expect(rows[0].refSub).toBe('Target Lot');
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

    const rows = mapStructuredMovementsToTableRows([structuredTransfer], sampleGrn);
    expect(rows).toHaveLength(1);
    expect(rows[0].badgeLabel).toBe('👤 Transfer');
    expect(rows[0].badgeVariant).toBe('warning');
    expect(rows[0].partyName).toBe('Ramesh Patel → Suresh Kumar');
    expect(rows[0].reason).toBe('Transfer on contract clearance');
  });
});
