import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
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

  it('unpaid rent: allows partial delivery without upfront rent and preserves pending balance', async () => {
    const delRes = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 20, bigBags: 0 },
      USER_ID,
    );
    expect(delRes.delivery.smallBags).toBe(20);
    expect(delRes.delivery.totalBags).toBe(20);
    expect(delRes.summary.remainingDeliveryBalance).toBe(80);
    expect(delRes.summary.grnStatus).toBe('OPEN');

    expect(await DeliveryChallanModel.countDocuments({ grnId })).toBe(1);
    const grn = await GrnModel.findOne({ id: grnId }).exec();
    expect(grn?.status).toBe('OPEN');

    const rentSummary = await rentService.getRentSummary(facilityId, grnId);
    expect(rentSummary.totalPaid).toBe(0);
    expect(rentSummary.remainingBalance).toBe(RENT_OBLIGATION);
    expect(rentSummary.paymentStatus).toBe('Not Settled');
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
      { grnId, smallBags: 20, bigBags: 0, remarks: 'Partial delivery 1' },
      USER_ID,
    );
    expect(delRes.delivery.smallBags).toBe(20);
    expect(delRes.delivery.totalBags).toBe(20);
    expect(delRes.summary.totalReceivedBags).toBe(100);
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
    const del1 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 40, bigBags: 0 }, USER_ID);
    expect(del1.summary.totalReceivedBags).toBe(100);
    expect(del1.summary.remainingDeliveryBalance).toBe(60);
    expect(del1.summary.grnStatus).toBe('OPEN');

    // Delivery 2: 30 bags
    const del2 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 30, bigBags: 0 }, USER_ID);
    expect(del2.summary.remainingDeliveryBalance).toBe(30);
    expect(del2.summary.grnStatus).toBe('OPEN');
  });

  it('final delivery & final closure: transitions GRN to CLOSED only when balance reaches 0', async () => {
    // Pay rent in full
    await rentService.recordPayment(
      facilityId, { grnId, amountPaid: 5000, paymentMode: 'Cash', paymentDate: new Date() }, USER_ID,
    );

    // Partial delivery: 70 bags -> 30 remaining
    const partial = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 70, bigBags: 0 }, USER_ID);
    expect(partial.summary.remainingDeliveryBalance).toBe(30);
    expect(partial.summary.grnStatus).toBe('OPEN');

    // Final delivery: 30 bags -> 0 remaining
    const finalDel = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 30, bigBags: 0 }, USER_ID);
    expect(finalDel.summary.remainingDeliveryBalance).toBe(0);
    expect(finalDel.summary.grnStatus).toBe('CLOSED');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');

    // Delivery attempt on CLOSED GRN is rejected
    await expect(
      deliveryService.createDelivery(facilityId, { grnId, smallBags: 1, bigBags: 0 }, USER_ID),
    ).rejects.toThrow(/is CLOSED/);
  });

  it('final delivery with outstanding balance: remaining bags reach 0 and GRN transitions to CLOSED while rent remains Not Settled', async () => {
    // 1. Partial payment of ₹2000 out of ₹5000 (leaves ₹3000 outstanding)
    await rentService.recordPayment(
      facilityId, { grnId, amountPaid: 2000, paymentMode: 'UPI', paymentDate: new Date() }, USER_ID,
    );

    // 2. Deliver all 100 bags (final delivery)
    const finalDel = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 100, bigBags: 0 }, USER_ID);
    expect(finalDel.summary.remainingDeliveryBalance).toBe(0);
    expect(finalDel.summary.physicallyStoredBags).toBe(0);

    // 3. Invariant: GRN physical status becomes CLOSED because all inventory exited
    expect(finalDel.summary.grnStatus).toBe('CLOSED');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');

    // 4. Invariant: Financial rent state remains strictly decoupled and preserved
    const rentSummary = await rentService.getRentSummary(facilityId, grnId);
    expect(rentSummary.remainingBalance).toBe(3000);
    expect(rentSummary.paymentStatus).toBe('Not Settled');
  });

  it('rent payment after physical closure: settles outstanding rent for a CLOSED GRN via Cash Memo', async () => {
    // 1. Partial payment of ₹2000 out of ₹5000
    await rentService.recordPayment(
      facilityId, { grnId, amountPaid: 2000, paymentMode: 'UPI', paymentDate: new Date() }, USER_ID,
    );

    // 2. Deliver all 100 bags -> physical closure (GRN is CLOSED)
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 100, bigBags: 0 }, USER_ID);
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');

    // 3. Customer settles the remaining ₹3000 via Cash Memo on the CLOSED GRN
    const paymentResult = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3000, paymentMode: 'Cash', notes: 'Final settlement after physical exit', paymentDate: new Date() },
      USER_ID,
    );

    // Verify Cash Memo receipt was issued
    expect(paymentResult.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);
    expect(paymentResult.summary.remainingBalance).toBe(0);
    expect(paymentResult.summary.paymentStatus).toBe('Settled');

    // 4. Physical status remains CLOSED
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');
  });

  it('payment while bags remain: balance becomes 0 but GRN remains OPEN until all physical bags are delivered', async () => {
    // 1. Settle rent in full (₹5000) while all 100 bags are still in chamber
    const paymentResult = await rentService.recordPayment(
      facilityId, { grnId, amountPaid: 5000, paymentMode: 'UPI', paymentDate: new Date() }, USER_ID,
    );
    expect(paymentResult.summary.remainingBalance).toBe(0);
    expect(paymentResult.summary.paymentStatus).toBe('Settled');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');

    // 2. Partial delivery of 40 bags -> 60 remaining -> GRN remains OPEN
    const d1 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 40, bigBags: 0 }, USER_ID);
    expect(d1.summary.remainingDeliveryBalance).toBe(60);
    expect(d1.summary.grnStatus).toBe('OPEN');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');

    // 3. Final delivery of remaining 60 bags -> now bags === 0 AND balance === 0 -> GRN becomes CLOSED
    const d2 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 60, bigBags: 0 }, USER_ID);
    expect(d2.summary.remainingDeliveryBalance).toBe(0);
    expect(d2.summary.grnStatus).toBe('CLOSED');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');
  });
});
