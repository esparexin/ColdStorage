import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-monthly-lifecycle-accrual';

describe('Phase 4: Continuous Monthly & Seasonal Storage Accrual in Rent Ledger', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Monthly Accrual Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Farmer Cooperative Accrual' });
    await CommodityModel.create({
      id: 'cmd-onions-accrual',
      name: 'Onions Accrual',
      normalizedName: 'onions accrual',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  it('accumulates monthly outward charges exceeding initial contract rent in rent summary', async () => {
    // Keep all dates within same financial year (FY 25-26)
    const inwardDate = new Date('2025-04-01');
    const d1Date = new Date('2025-05-01'); // 1 month
    const d2Date = new Date('2025-07-01'); // 3 months

    // Inward with 1-month contract rent = 100 bags × 10 = ₹1,000
    const grnId = await seedGrn({
      facilityId, customerId, commodityId: 'cmd-onions-accrual', commodityName: 'Onions Accrual',
      chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0,
      bagPrice: 10, rentType: 'Monthly', rentMonths: 1, rentAmount: 1000, date: inwardDate,
    });

    // Before delivery, totalDue is initial contract rent
    let summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalDue).toBe(1000);
    expect(summary.remainingBalance).toBe(1000);

    // Delivery 1: 50 bags on May 1 (enters cycle 2) = 50 × 10 × 2 = ₹1,000
    await deliveryService.createDelivery(
      facilityId,
      { grnId, date: d1Date, smallBags: 50, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // After d1: outward charges = 1000, equals initial contract 1000, so baseRent = 1000
    summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalDue).toBe(1000);

    // Delivery 2: remaining 50 bags on July 1 (enters cycle 4) = 50 × 10 × 4 = ₹2,000
    // Total outward rent charges = 500 + 2000 = ₹2,500 > initial contract ₹1,000!
    const d2 = await deliveryService.createDelivery(
      facilityId,
      { grnId, date: d2Date, smallBags: 50, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );
    expect(d2.delivery.rentCharge).toBe(2000);

    // Closure check: all bags delivered, but rent is unpaid, so GRN remains OPEN
    expect(d2.summary.grnStatus).toBe('OPEN');
    const grnDoc = await GrnModel.findOne({ id: grnId }).lean();
    expect(grnDoc?.status).toBe('OPEN');

    // Total due in rent ledger now reflects full outward liability of ₹3,000 (1000 + 2000)
    summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalDue).toBe(3000);
    expect(summary.remainingBalance).toBe(3000);

    // Paying full ₹3,000 succeeds through recordPayment
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3000, paymentMode: 'UPI', paymentDate: d2Date },
      USER_ID,
    );

    summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalPaid).toBe(3000);
    expect(summary.remainingBalance).toBe(0);
    expect(summary.paymentStatus).toBe('Settled');

    // With balance 0 and bags 0, GRN is now CLOSED
    const closedGrnDoc = await GrnModel.findOne({ id: grnId }).lean();
    expect(closedGrnDoc?.status).toBe('CLOSED');
  });

  it('keeps GRN OPEN across multiple partial deliveries when dues remain unpaid', async () => {
    // Inward on April 1, partial deliveries within Cycle 1 (same month)
    const inwardDate = new Date('2025-04-01');
    const d1Date = new Date('2025-04-10');
    const d2Date = new Date('2025-04-20');

    const grnId = await seedGrn({
      facilityId, customerId, commodityId: 'cmd-onions-accrual', commodityName: 'Onions Accrual',
      chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0,
      bagPrice: 10, rentType: 'Monthly', date: inwardDate,
    });

    // Delivery 1: 50 bags in cycle 1 = 50 × 10 × 1 = 500, no inline payment
    await deliveryService.createDelivery(
      facilityId,
      { grnId, date: d1Date, smallBags: 50, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // Delivery 2: 50 bags in cycle 1 = 50 × 10 × 1 = 500, but customer pays only 500 inline (Delivery 1 still unpaid)
    const d2 = await deliveryService.createDelivery(
      facilityId,
      {
        grnId, date: d2Date, smallBags: 50, bigBags: 0, bagCategory: 'Small',
        paymentAmount: 500, paymentMode: 'Cash',
      },
      USER_ID,
    );

    // Total bags remaining is 0, but total dues = 1000 and total paid = 500, so remaining balance = 500
    expect(d2.summary.remainingDeliveryBalance).toBe(0);
    expect(d2.summary.grnStatus).toBe('OPEN');

    const grnDoc = await GrnModel.findOne({ id: grnId }).lean();
    expect(grnDoc?.status).toBe('OPEN');

    // Settle the remaining 500
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 500, paymentMode: 'Cash', paymentDate: d2Date },
      USER_ID,
    );

    const closedGrn = await GrnModel.findOne({ id: grnId }).lean();
    expect(closedGrn?.status).toBe('CLOSED');
  });
});
