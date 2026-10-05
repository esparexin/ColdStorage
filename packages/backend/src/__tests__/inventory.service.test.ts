import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

describe('InventoryService GRN Chamber SSOT tests', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;
  const userId = 'usr-inv-ssot-op';

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityModel.create([
      { id: 'cmd-potatoes', name: 'Seed Potatoes', normalizedName: 'seed potatoes', isActive: true },
      { id: 'cmd-onions', name: 'Onions', normalizedName: 'onions', isActive: true },
    ]);
    facilityId = await seedFacility({ name: 'Inventory Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Ramesh Agro Traders' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-potatoes',
      chamber: 'Chamber 1',
      bags: 100,
      commodityName: 'Seed Potatoes',
      grnNumber: 'GRN-25-26-0001',
    });
  });

  it('1. GRN creation: Chamber 1 = 100 bags, Unallocated = 0 without secondary put-away', async () => {
    const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(summary).toEqual({
      grnId,
      facilityId,
      grnNumber: 'GRN-25-26-0001',
      chamber: 'Chamber 1',
      totalBags: 100,
      allocatedBags: 100,
      unallocatedBags: 0,
      putAwayStatus: 'ALLOCATED',
      availableSmallBags: 100,
      availableBigBags: 0,
    });
    expect((await inventoryService.getAvailableBags(facilityId, grnId)).bags).toBe(100);

    const facSummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facSummary.totalStockBags).toBe(100);
    expect(facSummary.byChamber).toEqual([{ chamber: 'Chamber 1', totalBags: 100 }]);
  });

  it('2. Delivery: GRN = 100, Delivery = 30 -> Available = 70, Chamber 1 = 70', async () => {
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 30, bigBags: 0 }, userId);

    expect((await inventoryService.getAvailableBags(facilityId, grnId)).bags).toBe(70);

    const facSummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facSummary.totalStockBags).toBe(70);
    expect(facSummary.byChamber).toEqual([{ chamber: 'Chamber 1', totalBags: 70 }]);

    const grnSummary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(grnSummary.allocatedBags).toBe(70);
    expect(grnSummary.unallocatedBags).toBe(0);
  });

  it('3. Multiple deliveries: GRN = 100, Delivery 1 = 30, Delivery 2 = 20 -> Available = 50', async () => {
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 30, bigBags: 0 }, userId);
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 20, bigBags: 0 }, userId);

    expect((await inventoryService.getAvailableBags(facilityId, grnId)).bags).toBe(50);

    const facSummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facSummary.totalStockBags).toBe(50);
    expect(facSummary.byChamber).toEqual([{ chamber: 'Chamber 1', totalBags: 50 }]);
  });

  it('4. Delivery reversal: 30 and 20 delivered, 20 reversed -> Available = 70', async () => {
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 30, bigBags: 0 }, userId);
    const del2 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 20, bigBags: 0 }, userId);
    expect((await inventoryService.getAvailableBags(facilityId, grnId)).bags).toBe(50);

    await deliveryService.reverseDelivery(
      facilityId,
      del2.delivery.id,
      { reason: 'Customer returned 20 bags due to truck defect' },
      userId,
    );

    expect((await inventoryService.getAvailableBags(facilityId, grnId)).bags).toBe(70);

    const facSummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facSummary.totalStockBags).toBe(70);
    expect(facSummary.byChamber).toEqual([{ chamber: 'Chamber 1', totalBags: 70 }]);
  });

  it('5. Multiple chambers: stock remains strictly separated by GRN chamber', async () => {
    await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-onions',
      chamber: 'Chamber 2',
      bags: 50,
      commodityName: 'Onions',
      grnNumber: 'GRN-25-26-0002',
    });

    const facSummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facSummary.totalStockBags).toBe(150);
    expect(facSummary.byChamber).toEqual(
      expect.arrayContaining([
        { chamber: 'Chamber 1', totalBags: 100 },
        { chamber: 'Chamber 2', totalBags: 50 },
      ]),
    );
    expect(facSummary.byCommodity).toEqual(
      expect.arrayContaining([
        { commodityId: 'cmd-potatoes', commodityName: 'Seed Potatoes', totalBags: 100 },
        { commodityId: 'cmd-onions', commodityName: 'Onions', totalBags: 50 },
      ]),
    );
  });

  it('6. Ledger authority: available stock equals the signed ledger balance, not the receipt', async () => {
    // The receipt states what arrived; the ledger states what remains. With no outward movement
    // the two agree, and the agreement comes from the inward leg, not from reading the receipt.
    const inwardRows = await InventoryTransactionModel.countDocuments({
      grnId,
      transactionType: 'INWARD_PUTAWAY',
    });
    expect(inwardRows).toBe(1);

    const available = await inventoryService.getAvailableBags(facilityId, grnId);
    expect(available.bags).toBe(100);

    const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(summary.allocatedBags).toBe(100);
    expect(summary.unallocatedBags).toBe(0);
    expect(summary.putAwayStatus).toBe('ALLOCATED');
  });

  it('7. Throws an error when getting summary for non-existent GRN', async () => {
    await expect(
      inventoryService.getGrnInventorySummary(facilityId, 'grn-missing'),
    ).rejects.toThrow(/not found in facility/);
  });
});
