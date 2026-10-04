import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { RentPaymentRequiredError } from '../modules/common/rent-gate.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-settlement-tester';

describe('Phase 5: Payment & Settlement Integrity (delivery-settlement-integrity.test.ts)', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;
  const RENT_OBLIGATION = 5000;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Settlement Integrity Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Farmer Cooperative Ltd' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-01',
      bags: 100,
      commodityName: 'Apples',
      grnNumber: 'GRN-26-27-0010',
      rentAmount: RENT_OBLIGATION,
    });
  });

  it('unpaid rent: blocks delivery with RentPaymentRequiredError when rent is unpaid', async () => {
    await expect(
      deliveryService.createDelivery(facilityId, { grnId, bags: 20 }, USER_ID),
    ).rejects.toThrow(RentPaymentRequiredError);

    expect(await DeliveryChallanModel.countDocuments({ grnId })).toBe(0);
    const grn = await GrnModel.findOne({ id: grnId }).exec();
    expect(grn?.status).toBe('OPEN');
  });

  it('partially paid rent: permits partial delivery without forcing full settlement', async () => {
    // 1. Partial payment of ₹2000 out of ₹5000
    const paymentRes = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 2000, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    expect(paymentRes.summary.totalPaid).toBe(2000);
    expect(paymentRes.summary.remainingBalance).toBe(3000);
    expect(paymentRes.summary.paymentStatus).toBe('Not Settled');

    // 2. Partial delivery of 20 bags (80 remaining)
    const delRes = await deliveryService.createDelivery(
      facilityId,
      { grnId, bags: 20, remarks: 'Partial delivery 1' },
      USER_ID,
    );
    expect(delRes.delivery.openingBags).toBe(100);
    expect(delRes.delivery.bags).toBe(20);
    expect(delRes.delivery.closingBags).toBe(80);
    expect(delRes.summary.remainingDeliveryBalance).toBe(80);
    expect(delRes.summary.grnStatus).toBe('OPEN');

    // 3. Rent balance remains intact and is not forced to full settlement
    const rentSummary = await rentService.getRentSummary(facilityId, grnId);
    expect(rentSummary.totalPaid).toBe(2000);
    expect(rentSummary.remainingBalance).toBe(3000);
    expect(rentSummary.paymentStatus).toBe('Not Settled');

    const grn = await GrnModel.findOne({ id: grnId }).exec();
    expect(grn?.status).toBe('OPEN');
  });

  it('overpayment guard: rejects payment exceeding the remaining obligation', async () => {
    await expect(
      rentService.recordPayment(
        facilityId,
        { grnId, amountPaid: 5001, paymentMode: 'Cash', paymentDate: new Date() },
        USER_ID,
      ),
    ).rejects.toThrow(/exceeds remaining rent balance/);

    expect(await RentPaymentModel.countDocuments({ grnId })).toBe(0);
  });

  it('repeated payment attempt: serialized concurrency prevents double payments and overpayment', async () => {
    const results = await Promise.allSettled([
      rentService.recordPayment(
        facilityId,
        { grnId, amountPaid: 3000, paymentMode: 'Cash', paymentDate: new Date() },
        'usr-op-1',
      ),
      rentService.recordPayment(
        facilityId,
        { grnId, amountPaid: 3000, paymentMode: 'UPI', paymentDate: new Date() },
        'usr-op-2',
      ),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const rentSummary = await rentService.getRentSummary(facilityId, grnId);
    expect(rentSummary.totalPaid).toBe(3000);
    expect(rentSummary.remainingBalance).toBe(2000);
  });

  it('delivery after full settlement: permits delivery when rent is completely settled upfront', async () => {
    // Pay full ₹5000 upfront
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 5000, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );

    const rentSummary = await rentService.getRentSummary(facilityId, grnId);
    expect(rentSummary.paymentStatus).toBe('Settled');
    expect(rentSummary.remainingBalance).toBe(0);

    // Delivery 1: 40 bags
    const del1 = await deliveryService.createDelivery(facilityId, { grnId, bags: 40 }, USER_ID);
    expect(del1.delivery.openingBags).toBe(100);
    expect(del1.delivery.closingBags).toBe(60);
    expect(del1.summary.grnStatus).toBe('OPEN');

    // Delivery 2: 30 bags
    const del2 = await deliveryService.createDelivery(facilityId, { grnId, bags: 30 }, USER_ID);
    expect(del2.delivery.openingBags).toBe(60);
    expect(del2.delivery.closingBags).toBe(30);
    expect(del2.summary.grnStatus).toBe('OPEN');
  });

  it('final delivery & final closure: transitions GRN to CLOSED only when balance reaches 0', async () => {
    // Pay rent in full
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 5000, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );

    // Partial delivery: 70 bags -> 30 remaining
    const partial = await deliveryService.createDelivery(facilityId, { grnId, bags: 70 }, USER_ID);
    expect(partial.delivery.closingBags).toBe(30);
    expect(partial.summary.grnStatus).toBe('OPEN');

    // Final delivery: 30 bags -> 0 remaining
    const finalDel = await deliveryService.createDelivery(facilityId, { grnId, bags: 30 }, USER_ID);
    expect(finalDel.delivery.openingBags).toBe(30);
    expect(finalDel.delivery.closingBags).toBe(0);
    expect(finalDel.summary.grnStatus).toBe('CLOSED');

    const grn = await GrnModel.findOne({ id: grnId }).exec();
    expect(grn?.status).toBe('CLOSED');

    // Delivery attempt on CLOSED GRN is rejected
    await expect(
      deliveryService.createDelivery(facilityId, { grnId, bags: 1 }, USER_ID),
    ).rejects.toThrow(/is CLOSED/);
  });
});
