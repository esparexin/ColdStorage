import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { auditService } from '../modules/audit/audit.service.js';

describe('Workflow Activity Date & Composition Audit Trail', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await mongoose.connection.collection('auditlogs').deleteMany({});
  });

  it('records operational activityDate, bag composition, and customer details on outward delivery', async () => {
    await auditService.log({
      eventType: 'DELIVERY_ISSUED',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      resource: 'delivery',
      resourceId: 'del-101',
      details: {
        activityDate: '2026-10-25',
        challanNumber: 'CHL-2026-0001',
        grnId: 'grn-101',
        grnNumber: 'GRN-2026-0001',
        customerId: 'cust-1',
        customerName: 'Farmer Ramesh',
        bagType: 'S/B',
        bagCategory: 'Standard',
        totalBags: 50,
        smallBags: 30,
        bigBags: 20,
        rentCharge: 1500,
        hamaliCharge: 250,
      },
    });

    const doc = await AuditLogModel.findOne({ eventType: 'DELIVERY_ISSUED' }).lean();
    expect(doc).toBeDefined();
    expect(doc?.details.activityDate).toBe('2026-10-25');
    expect(doc?.details.customerName).toBe('Farmer Ramesh');
    expect(doc?.details.bagType).toBe('S/B');
    expect(doc?.details.smallBags).toBe(30);
    expect(doc?.details.bigBags).toBe(20);
    expect(doc?.details.rentCharge).toBe(1500);
  });

  it('records operational activityDate, moved composition, and repack details on merge', async () => {
    await auditService.log({
      eventType: 'INTERNAL_MOVEMENT_MERGE',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      resource: 'grn',
      resourceId: 'grn-target-1',
      details: {
        activityDate: '2026-10-26',
        targetGrnNumber: 'GRN-2026-0002',
        customerId: 'cust-1',
        customerName: 'Farmer Ramesh',
        sourceGrnNumbers: ['GRN-2026-0001'],
        totalBagsMoved: 40,
        smallBagsMoved: 25,
        bigBagsMoved: 15,
        isCompositionVerified: true,
        repackVariance: 0,
        carriedRent: 1200,
        repackHamaliCharge: 200,
        newRentAmount: 2400,
      },
    });

    const doc = await AuditLogModel.findOne({ eventType: 'INTERNAL_MOVEMENT_MERGE' }).lean();
    expect(doc).toBeDefined();
    expect(doc?.details.activityDate).toBe('2026-10-26');
    expect(doc?.details.targetGrnNumber).toBe('GRN-2026-0002');
    expect(doc?.details.smallBagsMoved).toBe(25);
    expect(doc?.details.bigBagsMoved).toBe(15);
    expect(doc?.details.isCompositionVerified).toBe(true);
    expect(doc?.details.repackVariance).toBe(0);
  });

  it('records operational activityDate, customers, and confirmed composition on ownership transfer', async () => {
    await auditService.log({
      eventType: 'INTERNAL_MOVEMENT_TRANSFER',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      resource: 'grn',
      resourceId: 'grn-transferred-1',
      details: {
        activityDate: '2026-10-27',
        grnNumber: 'GRN-2026-0003',
        fromCustomerId: 'cust-1',
        fromCustomer: 'Farmer Ramesh',
        toCustomerId: 'cust-2',
        toCustomer: 'Trader Suresh',
        confirmedSmallBags: 20,
        confirmedBigBags: 10,
        sourceBagCategory: 'Small and Big',
        sourceQuantity: 30,
        pendingRent: 800,
        paymentDecision: 'SETTLE_NOW',
      },
    });

    const doc = await AuditLogModel.findOne({ eventType: 'INTERNAL_MOVEMENT_TRANSFER' }).lean();
    expect(doc).toBeDefined();
    expect(doc?.details.activityDate).toBe('2026-10-27');
    expect(doc?.details.fromCustomer).toBe('Farmer Ramesh');
    expect(doc?.details.toCustomer).toBe('Trader Suresh');
    expect(doc?.details.confirmedSmallBags).toBe(20);
    expect(doc?.details.confirmedBigBags).toBe(10);
  });
});
