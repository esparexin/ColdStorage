import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import { RentPaymentRequiredError } from '../modules/common/rent-gate.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const userId = 'usr-operator-1';

describe('P5 InventoryService whole-lot put-away tests', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Inventory Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Ramesh Agro Traders' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-01',
      bags: 150,
      commodityName: 'Seed Potatoes',
      grnNumber: 'GRN-25-26-0001',
    });
  });

  it("allocates the GRN's entire outstanding balance into its chamber in one ledger row", async () => {
    const result = await inventoryService.createPutAway(
      facilityId,
      grnId,
      { notes: 'Full allocation' },
      userId,
    );

    // Whole-lot: one allocation carrying the GRN's own free-text chamber, with no item breakdown.
    expect(result.putAway).toEqual({
      id: expect.any(String),
      facilityId,
      grnId,
      grnNumber: 'GRN-25-26-0001',
      chamber: 'CH-01',
      bags: 150,
      notes: 'Full allocation',
      allocatedBy: userId,
      allocatedAt: expect.any(Date),
    });
    expect(result.summary).toEqual({
      grnId,
      facilityId,
      grnNumber: 'GRN-25-26-0001',
      chamber: 'CH-01',
      totalBags: 150,
      allocatedBags: 150,
      unallocatedBags: 0,
      putAwayStatus: 'ALLOCATED',
    });

    const ledgerDocs = await InventoryTransactionModel.find({ grnId }).exec();
    expect(ledgerDocs).toHaveLength(1);
    expect(ledgerDocs[0].transactionType).toBe('INWARD_PUTAWAY');
    expect(ledgerDocs[0].referenceType).toBe('PUT_AWAY');
    expect(ledgerDocs[0].referenceId).toBe(result.putAway.id);
    expect(ledgerDocs[0].chamber).toBe('CH-01');
    expect(ledgerDocs[0].quantity).toBe(150);
    expect(ledgerDocs[0].createdBy).toBe(userId);
  });

  it('is all-or-nothing: a repeat put-away is rejected and writes nothing further', async () => {
    const first = await inventoryService.createPutAway(
      facilityId,
      grnId,
      { notes: 'First batch' },
      userId,
    );
    expect(first.summary.allocatedBags).toBe(150);
    expect(first.summary.unallocatedBags).toBe(0);
    expect(first.summary.putAwayStatus).toBe('ALLOCATED');

    await expect(
      inventoryService.createPutAway(facilityId, grnId, { notes: 'Second batch' }, 'usr-op-b'),
    ).rejects.toThrow(/already fully allocated/);

    expect(await PutAwayAllocationModel.countDocuments({ grnId })).toBe(1);
    expect(await InventoryTransactionModel.countDocuments({ grnId })).toBe(1);
  });

  it("never over-allocates a GRN: the allocated lot is derived from the received bag balance", async () => {
    const first = await inventoryService.createPutAway(facilityId, grnId, {}, userId);
    expect(first.putAway.bags).toBe(150);

    const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(summary.totalBags).toBe(150);
    expect(summary.allocatedBags).toBe(summary.totalBags);
    expect(summary.unallocatedBags).toBe(0);
    expect(await inventoryService.getAvailableBags(facilityId, grnId)).toBe(150);
  });

  it('derives the allocation chamber from the GRN and reports it in facility stock', async () => {
    const secondGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-02',
      bags: 40,
      commodityName: 'Onions',
    });
    const result = await inventoryService.createPutAway(facilityId, secondGrnId, {}, userId);

    expect(result.putAway.chamber).toBe('CH-02');
    expect(result.putAway.notes).toBeNull();
    expect(result.summary.chamber).toBe('CH-02');
    const ledger = await InventoryTransactionModel.findOne({ grnId: secondGrnId }).exec();
    expect(ledger?.chamber).toBe('CH-02');

    await inventoryService.createPutAway(facilityId, grnId, {}, userId);
    const facilitySummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facilitySummary.byChamber).toEqual([
      { chamber: 'CH-01', totalBags: 150 },
      { chamber: 'CH-02', totalBags: 40 },
    ]);
    expect(facilitySummary.totalStockBags).toBe(190);
  });

  it('refuses put-away for a GRN that is not OPEN, writing nothing', async () => {
    await GrnModel.updateOne({ id: grnId }, { $set: { status: 'CLOSED' } });

    await expect(
      inventoryService.createPutAway(facilityId, grnId, {}, userId),
    ).rejects.toThrow(/is not OPEN/);

    expect(await PutAwayAllocationModel.countDocuments({})).toBe(0);
    expect(await InventoryTransactionModel.countDocuments({})).toBe(0);
  });

  it('refuses put-away for a GRN outside the facility', async () => {
    await expect(
      inventoryService.createPutAway(facilityId, 'grn-missing', {}, userId),
    ).rejects.toThrow(/not found in facility/);

    expect(await InventoryTransactionModel.countDocuments({})).toBe(0);
  });

  it('blocks put-away behind the rent gate until rent is collected', async () => {
    const unpaidGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-03',
      bags: 60,
      commodityName: 'Apples',
      rentAmount: 5000,
    });

    const err = await inventoryService
      .createPutAway(facilityId, unpaidGrnId, {}, userId)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RentPaymentRequiredError);
    expect((err as RentPaymentRequiredError).code).toBe('RENT_PAYMENT_REQUIRED');
    expect((err as RentPaymentRequiredError).statusCode).toBe(402);
    expect(await InventoryTransactionModel.countDocuments({ grnId: unpaidGrnId })).toBe(0);
  });

  it('serialises concurrent put-aways on one GRN so the lot is allocated exactly once', async () => {
    const results = await Promise.allSettled([
      inventoryService.createPutAway(facilityId, grnId, { notes: 'Op A' }, 'usr-op-a'),
      inventoryService.createPutAway(facilityId, grnId, { notes: 'Op B' }, 'usr-op-b'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await InventoryTransactionModel.countDocuments({ grnId })).toBe(1);

    const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(summary.allocatedBags).toBe(150);
    expect(summary.unallocatedBags).toBe(0);
  });

  it('completes concurrent put-aways of two GRNs without deadlock or cross-allocation', async () => {
    const secondGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-04',
      bags: 60,
      commodityName: 'Onions',
    });

    const results = await Promise.allSettled([
      inventoryService.createPutAway(facilityId, grnId, { notes: 'Lot A' }, 'usr-op-1'),
      inventoryService.createPutAway(facilityId, secondGrnId, { notes: 'Lot B' }, 'usr-op-2'),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const firstSummary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    const secondSummary = await inventoryService.getGrnInventorySummary(facilityId, secondGrnId);
    expect([firstSummary.allocatedBags, secondSummary.allocatedBags]).toEqual([150, 60]);
    expect([firstSummary.unallocatedBags, secondSummary.unallocatedBags]).toEqual([0, 0]);

    const facilitySummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facilitySummary.totalStockBags).toBe(210);
    expect(facilitySummary.byChamber).toEqual([
      { chamber: 'CH-01', totalBags: 150 },
      { chamber: 'CH-04', totalBags: 60 },
    ]);
  });
});
