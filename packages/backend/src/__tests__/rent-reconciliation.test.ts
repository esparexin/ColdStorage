import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { rentExtensionService } from '../modules/rent/rent-extension.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import mongoose from 'mongoose';

const FACILITY_ID = 'fac-rent-recon';
const CUSTOMER_ID = 'cust-rent-recon';
const USER_ID = 'usr-admin-recon';

/**
 * Phase 5 reconciliation: one canonical balance engine over the initial
 * seasonal obligation plus every finalized period. Partial payments carry
 * pending forward; overpayments are rejected; history is never mutated.
 */
describe('Rent reconciliation — rent-reconciliation.test.ts', () => {
  let grnId: string;

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await CounterModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});

    await seedFacility({ id: FACILITY_ID, name: 'Recon Facility', code: 'RECON' });
    await seedCustomer({ id: CUSTOMER_ID, name: 'Recon Customer', facilityId: FACILITY_ID });

    grnId = await seedGrn({
      facilityId: FACILITY_ID,
      customerId: CUSTOMER_ID,
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentMonths: 10,
      rentAmount: 1200,
      date: new Date(2025, 5, 15),
      grnNumber: `REC-${Math.floor(Math.random() * 9000 + 1000)}`,
    });
    await GrnModel.updateOne({ id: grnId }, { $set: { bagPrice: 12 } }).exec();

    // Season 1200 + Jan 1200 + Season-2026 renewal 1200 = 3600 total due.
    await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'JANUARY' },
      USER_ID,
    );
    await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2026, period: 'SEASON' },
      USER_ID,
    );
  });

  it('derives one pending total across the initial season and all periods', async () => {
    const summary = await rentService.getRentSummary(FACILITY_ID, grnId);
    expect(summary.totalDue).toBe(3600);
    expect(summary.totalPaid).toBe(0);
    expect(summary.remainingBalance).toBe(3600);
    expect(summary.paymentStatus).toBe('Not Settled');
    expect(summary.extensions).toHaveLength(2);
  });

  it('carries partial payments forward without mutating history', async () => {
    const p1 = await rentService.recordPayment(
      FACILITY_ID,
      { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );
    expect(p1.summary.totalPaid).toBe(1000);
    expect(p1.summary.remainingBalance).toBe(2600);
    expect(p1.summary.paymentStatus).toBe('Not Settled');
    expect(p1.payment.receiptNumber).toBeDefined();

    await expect(
      rentService.recordPayment(
        FACILITY_ID,
        { grnId, amountPaid: 5000, paymentMode: 'UPI', paymentDate: new Date() },
        USER_ID,
      ),
    ).rejects.toThrow(/exceeds remaining rent balance/);

    const p2 = await rentService.recordPayment(
      FACILITY_ID,
      { grnId, amountPaid: 2600, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );
    expect(p2.summary.totalPaid).toBe(3600);
    expect(p2.summary.remainingBalance).toBe(0);
    expect(p2.summary.paymentStatus).toBe('Settled');

    const reread = await rentService.getRentSummary(FACILITY_ID, grnId);
    expect(reread.payments).toHaveLength(2);
    expect(reread.payments.map((p) => p.amountPaid).sort((a, b) => a - b)).toEqual([1000, 2600]);
    expect(reread.totalDue).toBe(3600);
  });

  it('keeps the GRN open while stock remains even when rent is settled', async () => {
    await rentService.recordPayment(
      FACILITY_ID,
      { grnId, amountPaid: 3600, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );
    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grn?.status).toBe('OPEN');
  });
});
