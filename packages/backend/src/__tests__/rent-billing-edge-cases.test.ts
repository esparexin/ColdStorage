import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GrnModel } from '../database/models/grn.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { readLedgerBalance, readLedgerNetDelivered } from '../modules/inventory/ledger-balance.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-e2e-edge-tester';

async function resetAll(facilityIds: string[]): Promise<void> {
  await resetStockCollections();
  await mongoose.connection.collection('rentpayments').deleteMany({ facilityId: { $in: facilityIds } });
  await mongoose.connection.collection('auditlogs').deleteMany({ facilityId: { $in: facilityIds } });
}

describe('E2E Suite 2: Delivery Reversal — bags restored and rent stays unchanged', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(connectToTestDatabase);
  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    facilityId = 'fac-e2e-reversal-1';
    await resetAll([facilityId]);
    facilityId = await seedFacility({ id: facilityId, name: 'Reversal Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Ramesh Cold Chain' });
    grnId = await seedGrn({
      facilityId, customerId, chamber: 'CH-R1', bags: 200,
      commodityName: 'Onion', grnNumber: 'GRN-26-27-0200', rentAmount: 6_000,
    });
  });

  it('reversal restores bag count in ledger and delivery summary reflects correct net outward', async () => {
    const del1 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 80, bigBags: 0 }, USER_ID);
    expect(del1.summary.remainingDeliveryBalance).toBe(120);

    const rev = await deliveryService.reverseDelivery(
      facilityId, del1.delivery.id, { reason: 'Customer returned goods — test reversal' }, USER_ID,
    );
    expect(rev.summary.remainingDeliveryBalance).toBe(200);
    expect(rev.summary.physicallyStoredBags).toBe(200);
    expect(rev.summary.grnStatus).toBe('OPEN');

    const netDelivered = await readLedgerNetDelivered(facilityId, grnId);
    const ledgerBalance = await readLedgerBalance(facilityId, grnId);
    expect(netDelivered.total).toBe(0);
    expect(ledgerBalance.total).toBe(200);

    const rent = await rentService.getRentSummary(facilityId, grnId);
    expect(rent.deliveredBags).toBe(0);
    expect(rent.remainingBags).toBe(200);
    expect(rent.remainingBalance).toBe(6_000);
    expect(rent.paymentStatus).toBe('Not Settled');
  });

  it('reversal after partial payment: bags restored, rent balance unaffected', async () => {
    await rentService.recordPayment(
      facilityId, { grnId, amountPaid: 2_000, paymentMode: 'UPI', paymentDate: new Date() }, USER_ID,
    );
    const del1 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 80, bigBags: 0 }, USER_ID);
    await deliveryService.reverseDelivery(
      facilityId, del1.delivery.id, { reason: 'Test reversal after partial payment' }, USER_ID,
    );

    const rent = await rentService.getRentSummary(facilityId, grnId);
    expect(rent.deliveredBags).toBe(0);
    expect(rent.remainingBags).toBe(200);
    expect(rent.totalPaid).toBe(2_000);
    expect(rent.remainingBalance).toBe(4_000);
    expect(rent.paymentStatus).toBe('Not Settled');
  });
});

describe('E2E Suite 3: Batch summary matches per-GRN summary', () => {
  let facilityId: string;

  beforeAll(connectToTestDatabase);
  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    facilityId = 'fac-e2e-batch-1';
    await resetAll([facilityId]);
    facilityId = await seedFacility({ id: facilityId, name: 'Batch Consistency Facility' });
  });

  it('batch summaries for 3 GRNs with different outward/payment states match individual reads', async () => {
    const customerId = await seedCustomer({ facilityId, name: 'Multi-GRN Customer' });
    const grnA = await seedGrn({
      facilityId, customerId, bags: 100, rentAmount: 3_000, grnNumber: 'GRN-26-27-A001', chamber: 'CH-A',
    });
    const grnB = await seedGrn({
      facilityId, customerId, bags: 200, rentAmount: 6_000, grnNumber: 'GRN-26-27-B001', chamber: 'CH-B',
    });
    await deliveryService.createDelivery(facilityId, { grnId: grnB, smallBags: 50, bigBags: 0 }, USER_ID);
    await rentService.recordPayment(
      facilityId, { grnId: grnB, amountPaid: 1_500, paymentMode: 'Cash', paymentDate: new Date() }, USER_ID,
    );

    const grnC = await seedGrn({
      facilityId, customerId, bags: 150, rentAmount: 4_500, grnNumber: 'GRN-26-27-C001', chamber: 'CH-C',
    });
    await deliveryService.createDelivery(facilityId, { grnId: grnC, smallBags: 150, bigBags: 0 }, USER_ID);
    await rentService.recordPayment(
      facilityId, { grnId: grnC, amountPaid: 4_500, paymentMode: 'UPI', paymentDate: new Date() }, USER_ID,
    );

    const batch = await rentService.getRentSummariesForFacility(facilityId);
    const [indA, indB, indC] = await Promise.all([
      rentService.getRentSummary(facilityId, grnA),
      rentService.getRentSummary(facilityId, grnB),
      rentService.getRentSummary(facilityId, grnC),
    ]);

    const batchByGrn = new Map(batch.map((s) => [s.grnId, s]));
    const bA = batchByGrn.get(grnA)!;
    expect(bA.deliveredBags).toBe(indA.deliveredBags);
    expect(bA.remainingBags).toBe(indA.remainingBags);
    expect(bA.remainingBalance).toBe(indA.remainingBalance);

    const bB = batchByGrn.get(grnB)!;
    expect(bB.deliveredBags).toBe(indB.deliveredBags);
    expect(bB.remainingBags).toBe(indB.remainingBags);
    expect(bB.remainingBalance).toBe(indB.remainingBalance);

    const bC = batchByGrn.get(grnC)!;
    expect(bC.deliveredBags).toBe(indC.deliveredBags);
    expect(bC.remainingBags).toBe(indC.remainingBags);
    expect(bC.remainingBalance).toBe(indC.remainingBalance);
    expect(bC.paymentStatus).toBe('Settled');
  });
});

describe('E2E Suite 4: Edge cases — pre-paid and overpayment guards', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(connectToTestDatabase);
  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    facilityId = 'fac-e2e-edge-1';
    await resetAll([facilityId]);
    facilityId = await seedFacility({ id: facilityId, name: 'Edge Cases Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Edge Case Customer' });
  });

  it('full rent paid while all bags in chamber: GRN stays OPEN until physical exit', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, bags: 120, rentAmount: 3_600, grnNumber: 'GRN-26-27-EDGE1', chamber: 'CH-E1',
    });
    const settle = await rentService.recordPayment(
      facilityId, { grnId, amountPaid: 3_600, paymentMode: 'UPI', paymentDate: new Date() }, USER_ID,
    );
    expect(settle.summary.paymentStatus).toBe('Settled');
    expect(settle.summary.remainingBalance).toBe(0);
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');

    const del1 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 60, bigBags: 0 }, USER_ID);
    expect(del1.summary.grnStatus).toBe('OPEN');
    const del2 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 60, bigBags: 0 }, USER_ID);
    expect(del2.summary.grnStatus).toBe('CLOSED');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');
  });

  it('already-settled GRN rejects any further payment', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, bags: 100, rentAmount: 2_000, grnNumber: 'GRN-26-27-EDGE2', chamber: 'CH-E2',
    });
    await rentService.recordPayment(
      facilityId, { grnId, amountPaid: 2_000, paymentMode: 'Cash', paymentDate: new Date() }, USER_ID,
    );
    await expect(
      rentService.recordPayment(
        facilityId, { grnId, amountPaid: 1, paymentMode: 'Cash', paymentDate: new Date() }, USER_ID,
      ),
    ).rejects.toThrow();
  });

  it('no legacy grn.bags fallback: outward-only GRN has correct delivered/remaining counts', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, bags: 80, rentAmount: 2_400, grnNumber: 'GRN-26-27-EDGE3', chamber: 'CH-E3',
    });
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 80, bigBags: 0 }, USER_ID);

    const netDelivered = await readLedgerNetDelivered(facilityId, grnId);
    const ledgerBal = await readLedgerBalance(facilityId, grnId);
    expect(netDelivered.total).toBe(80);
    expect(ledgerBal.total).toBe(0);

    const rent = await rentService.getRentSummary(facilityId, grnId);
    expect(rent.totalBags).toBe(80);
    expect(rent.deliveredBags).toBe(80);
    expect(rent.remainingBags).toBe(0);
    expect(rent.remainingBalance).toBe(2_400);
    expect(rent.paymentStatus).toBe('Not Settled');
  });
});
