import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GrnModel } from '../database/models/grn.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { readLedgerBalance, readLedgerInward, readLedgerNetDelivered } from '../modules/inventory/ledger-balance.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-e2e-lifecycle-tester';

async function resetAll(facilityIds: string[]): Promise<void> {
  await resetStockCollections();
  await mongoose.connection.collection('rentpayments').deleteMany({ facilityId: { $in: facilityIds } });
  await mongoose.connection.collection('auditlogs').deleteMany({ facilityId: { $in: facilityIds } });
}

describe('E2E Suite 1: Full GRN Lifecycle — 300 bags, 3 partial deliveries, 2 rent payments', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;
  const TOTAL_BAGS = 300;
  const RENT_OBLIGATION = 9_000;

  beforeAll(connectToTestDatabase);
  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    facilityId = 'fac-e2e-lifecycle-1';
    await resetAll([facilityId]);
    facilityId = await seedFacility({ id: facilityId, name: 'E2E Lifecycle Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Ramesh Agro Co-op' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-A1',
      bags: TOTAL_BAGS,
      commodityName: 'Potato (Chipsona)',
      grnNumber: 'GRN-26-27-0300',
      rentAmount: RENT_OBLIGATION,
    });
  });

  it('Step 0 — Initial state: 300 inward, 0 outward, 300 remaining, ₹0 paid, ₹9000 owed', async () => {
    const inward = await readLedgerInward(facilityId, grnId);
    const delivered = await readLedgerNetDelivered(facilityId, grnId);
    const balance = await readLedgerBalance(facilityId, grnId);

    expect(inward.total).toBe(300);
    expect(delivered.total).toBe(0);
    expect(balance.total).toBe(300);

    const rent = await rentService.getRentSummary(facilityId, grnId);
    expect(rent.totalBags).toBe(300);
    expect(rent.deliveredBags).toBe(0);
    expect(rent.remainingBags).toBe(300);
    expect(rent.totalPaid).toBe(0);
    expect(rent.remainingBalance).toBe(RENT_OBLIGATION);
    expect(rent.paymentStatus).toBe('Not Settled');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');
  });

  it('Step 1 — 50 bags outward: 250 remain; rent unchanged, GRN still OPEN', async () => {
    const del1 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 50, bigBags: 0, remarks: 'First partial outward' },
      USER_ID,
    );
    expect(del1.delivery.totalBags).toBe(50);
    expect(del1.summary.remainingDeliveryBalance).toBe(250);
    expect(del1.summary.physicallyStoredBags).toBe(250);
    expect(del1.summary.grnStatus).toBe('OPEN');

    const delivered = await readLedgerNetDelivered(facilityId, grnId);
    const balance = await readLedgerBalance(facilityId, grnId);
    expect(delivered.total).toBe(50);
    expect(balance.total).toBe(250);

    const rent = await rentService.getRentSummary(facilityId, grnId);
    expect(rent.deliveredBags).toBe(50);
    expect(rent.remainingBags).toBe(250);
    expect(rent.totalPaid).toBe(0);
    expect(rent.remainingBalance).toBe(RENT_OBLIGATION);
    expect(rent.paymentStatus).toBe('Not Settled');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');
  });

  it('Step 2 — Partial rent payment ₹3000: balance ₹6000, bags still 250, GRN OPEN', async () => {
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 50, bigBags: 0 }, USER_ID);
    const pay1 = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3_000, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    expect(pay1.summary.totalPaid).toBe(3_000);
    expect(pay1.summary.remainingBalance).toBe(6_000);
    expect(pay1.summary.paymentStatus).toBe('Not Settled');

    const balance = await readLedgerBalance(facilityId, grnId);
    expect(balance.total).toBe(250);
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');
  });

  it('Step 3 — Second partial outward 100 bags (150 remain): rent balance unchanged', async () => {
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 50, bigBags: 0 }, USER_ID);
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3_000, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    const del2 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 100, bigBags: 0, remarks: 'Second partial outward' },
      USER_ID,
    );
    expect(del2.delivery.totalBags).toBe(100);
    expect(del2.summary.remainingDeliveryBalance).toBe(150);
    expect(del2.summary.physicallyStoredBags).toBe(150);
    expect(del2.summary.grnStatus).toBe('OPEN');

    const delivered = await readLedgerNetDelivered(facilityId, grnId);
    const balance = await readLedgerBalance(facilityId, grnId);
    expect(delivered.total).toBe(150);
    expect(balance.total).toBe(150);

    const rent = await rentService.getRentSummary(facilityId, grnId);
    expect(rent.deliveredBags).toBe(150);
    expect(rent.remainingBags).toBe(150);
    expect(rent.totalPaid).toBe(3_000);
    expect(rent.remainingBalance).toBe(6_000);
    expect(rent.paymentStatus).toBe('Not Settled');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');
  });

  it('Step 4 — Final 150 bags outward: physical closure; rent still Not Settled (₹6000 owed)', async () => {
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 50, bigBags: 0 }, USER_ID);
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3_000, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 100, bigBags: 0 }, USER_ID);
    const del3 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 150, bigBags: 0, remarks: 'Final outward — all bags exit' },
      USER_ID,
    );
    expect(del3.delivery.totalBags).toBe(150);
    expect(del3.summary.remainingDeliveryBalance).toBe(0);
    expect(del3.summary.physicallyStoredBags).toBe(0);
    expect(del3.summary.grnStatus).toBe('OPEN');

    const delivered = await readLedgerNetDelivered(facilityId, grnId);
    const balance = await readLedgerBalance(facilityId, grnId);
    expect(delivered.total).toBe(300);
    expect(balance.total).toBe(0);
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');

    const rent = await rentService.getRentSummary(facilityId, grnId);
    expect(rent.deliveredBags).toBe(300);
    expect(rent.remainingBags).toBe(0);
    expect(rent.totalPaid).toBe(3_000);
    expect(rent.remainingBalance).toBe(6_000);
    expect(rent.paymentStatus).toBe('Not Settled');
  });

  it('Step 5 — Final rent settlement on closed GRN: cash memo issued, balance = 0', async () => {
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 50, bigBags: 0 }, USER_ID);
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3_000, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 100, bigBags: 0 }, USER_ID);
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 150, bigBags: 0 }, USER_ID);

    const settle = await rentService.recordPayment(
      facilityId,
      {
        grnId,
        amountPaid: 6_000,
        paymentMode: 'Cash',
        notes: 'Final settlement — all bags delivered',
        paymentDate: new Date(),
      },
      USER_ID,
    );
    expect(settle.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);
    expect(settle.summary.totalPaid).toBe(9_000);
    expect(settle.summary.remainingBalance).toBe(0);
    expect(settle.summary.paymentStatus).toBe('Settled');
    expect(settle.summary.deliveredBags).toBe(300);
    expect(settle.summary.remainingBags).toBe(0);
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');

    const finalRent = await rentService.getRentSummary(facilityId, grnId);
    expect(finalRent.payments).toHaveLength(2);
    expect(finalRent.payments[0]!.amountPaid).toBe(6_000);
    expect(finalRent.payments[1]!.amountPaid).toBe(3_000);
  });
});
