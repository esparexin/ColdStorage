import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { rentExtensionService } from '../modules/rent/rent-extension.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

const FACILITY_ID = 'fac-rent-ext';
const CUSTOMER_ID = 'cust-rent-ext';
const USER_ID = 'usr-admin-ext';
const BAG_RATE = 300;

/**
 * Seasonal Jan/Feb extensions: additive, snapshotted, idempotent.
 * Original Grn.rentAmount is never modified; TotalDue = original + extensions.
 */
describe('Rent extensions — rent-extension.service.test.ts', () => {
  let grnId: string;

  async function seedSeasonalGrn(inward: Date, bags = 100, rentAmount = 300000) {
    const id = await seedGrn({
      facilityId: FACILITY_ID,
      customerId: CUSTOMER_ID,
      chamber: 'CH-01',
      bags,
      bagType: 'S',
      rentType: 'Seasonal',
      rentMonths: 10,
      rentAmount,
      date: inward,
      grnNumber: `EXT-${Math.floor(Math.random() * 9000 + 1000)}`,
    });
    await GrnModel.updateOne({ id }, { $set: { bagPrice: BAG_RATE } }).exec();
    // seedGrn already records the INWARD_PUTAWAY leg dated at inward.
    return id;
  }

  async function recordOutward(grnId: string, bags: number, at: Date) {
    await InventoryTransactionModel.create({
      id: `tx-${randomUUID()}`,
      facilityId: FACILITY_ID,
      grnId,
      grnNumber: 'EXT',
      chamber: 'CH-01',
      commodityId: 'cmd-ext',
      bagType: 'S',
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: bags,
      bigQuantity: 0,
      referenceType: 'DELIVERY',
      referenceId: `del-${randomUUID()}`,
      notes: null,
      createdBy: USER_ID,
      createdAt: at,
    });
  }

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
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});

    await seedFacility({ id: FACILITY_ID, name: 'Ext Facility', code: 'EXT' });
    await seedCustomer({ id: CUSTOMER_ID, name: 'Ext Customer', facilityId: FACILITY_ID });
    grnId = await seedSeasonalGrn(new Date(2025, 5, 15));
  });

  it('finalizes January on the month-start snapshot', async () => {
    const ext = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'JANUARY' },
      USER_ID,
    );
    expect(ext.snapshotBags).toBe(100);
    expect(ext.bagRate).toBe(BAG_RATE);
    expect(ext.calculatedAmount).toBe(30000);
    expect(ext.finalAmount).toBe(30000);
    expect(ext.manualAmount).toBeNull();

    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grn?.rentAmount).toBe(300000);
  });

  it('finalization is idempotent: the same month is never billed twice', async () => {
    const first = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'JANUARY' },
      USER_ID,
    );
    const second = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'JANUARY' },
      USER_ID,
    );
    expect(second.id).toBe(first.id);
    const count = await mongoose.connection.collection('rentextensions').countDocuments({});
    expect(count).toBe(1);
  });

  it('bases February on February 01 remaining, not dispatch timing', async () => {
    await recordOutward(grnId, 20, new Date(2026, 0, 10));
    await recordOutward(grnId, 30, new Date(2026, 1, 20));
    const feb = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'FEBRUARY' },
      USER_ID,
    );
    expect(feb.snapshotBags).toBe(80);
    expect(feb.finalAmount).toBe(24000);
  });

  it('rejects non-seasonal GRNs, wrong seasons, future months and empty snapshots', async () => {
    const monthlyId = await seedGrn({
      facilityId: FACILITY_ID,
      customerId: CUSTOMER_ID,
      rentType: 'Monthly',
      rentMonths: 3,
      rentAmount: 9000,
      date: new Date(2025, 5, 15),
      grnNumber: `EXTM-${Math.floor(Math.random() * 9000 + 1000)}`,
    });
    await expect(
      rentExtensionService.finalizeExtension(
        FACILITY_ID,
        { grnId: monthlyId, seasonYear: 2025, period: 'JANUARY' },
        USER_ID,
      ),
    ).rejects.toThrow('only to Seasonal');

    await expect(
      rentExtensionService.finalizeExtension(
        FACILITY_ID,
        { grnId, seasonYear: 2024, period: 'JANUARY' },
        USER_ID,
      ),
    ).rejects.toThrow('belongs to season');

    const futureId = await seedSeasonalGrn(new Date(2026, 5, 15));
    await expect(
      rentExtensionService.finalizeExtension(
        FACILITY_ID,
        { grnId: futureId, seasonYear: 2026, period: 'JANUARY' },
        USER_ID,
      ),
    ).rejects.toThrow('before it begins');

    await recordOutward(grnId, 100, new Date(2025, 11, 20));
    await expect(
      rentExtensionService.finalizeExtension(
        FACILITY_ID,
        { grnId, seasonYear: 2025, period: 'JANUARY' },
        USER_ID,
      ),
    ).rejects.toThrow('No bags remained');
  });

  it('records manual overrides with reason while keeping the original rent', async () => {
    const ext = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'JANUARY' },
      USER_ID,
    );
    const overridden = await rentExtensionService.overrideExtension(
      FACILITY_ID,
      ext.id,
      { manualAmount: 20000, reason: 'Agreed rebate for damaged bags' },
      USER_ID,
    );
    expect(overridden.calculatedAmount).toBe(30000);
    expect(overridden.manualAmount).toBe(20000);
    expect(overridden.finalAmount).toBe(20000);
    expect(overridden.overrideReason).toBe('Agreed rebate for damaged bags');

    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grn?.rentAmount).toBe(300000);
  });

  it('collects against the total due: original + extensions', async () => {
    await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'JANUARY' },
      USER_ID,
    );

    let summary = await rentService.getRentSummary(FACILITY_ID, grnId);
    expect(summary.rentAmount).toBe(300000);
    expect(summary.totalDue).toBe(330000);
    expect(summary.remainingBalance).toBe(330000);
    expect(summary.paymentStatus).toBe('Not Settled');
    expect(summary.extensions).toHaveLength(1);

    await rentService.recordPayment(
      FACILITY_ID,
      { grnId, amountPaid: 300000, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );
    summary = await rentService.getRentSummary(FACILITY_ID, grnId);
    expect(summary.paymentStatus).toBe('Not Settled');
    expect(summary.remainingBalance).toBe(30000);

    await expect(
      rentService.recordPayment(
        FACILITY_ID,
        { grnId, amountPaid: 30001, paymentMode: 'Cash', paymentDate: new Date() },
        USER_ID,
      ),
    ).rejects.toThrow('exceeds remaining');
  });
});
