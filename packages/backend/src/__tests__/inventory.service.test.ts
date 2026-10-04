import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
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
      chamber: 'CH-01',
      bags: 150,
      commodityName: 'Seed Potatoes',
      grnNumber: 'GRN-25-26-0001',
    });
  });

  it('derives GRN inventory summary directly from inward receipt as authoritative SSOT', async () => {
    const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(summary).toEqual({
      grnId,
      facilityId,
      grnNumber: 'GRN-25-26-0001',
      chamber: 'CH-01',
      totalBags: 150,
      allocatedBags: 150,
      unallocatedBags: 0,
      putAwayStatus: 'ALLOCATED',
    });
    expect(await inventoryService.getAvailableBags(facilityId, grnId)).toBe(150);
  });

  it('aggregates facility inventory across chambers and commodities from GRN SSOT', async () => {
    await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-onions',
      chamber: 'CH-02',
      bags: 40,
      commodityName: 'Onions',
      grnNumber: 'GRN-25-26-0002',
    });

    const facilitySummary = await inventoryService.getFacilityInventorySummary(facilityId);
    expect(facilitySummary.totalStockBags).toBe(190);
    expect(facilitySummary.byChamber).toEqual([
      { chamber: 'CH-01', totalBags: 150 },
      { chamber: 'CH-02', totalBags: 40 },
    ]);
    expect(facilitySummary.byCommodity).toEqual(
      expect.arrayContaining([
        { commodityId: 'cmd-onions', commodityName: 'Onions', totalBags: 40 },
        { commodityId: 'cmd-potatoes', commodityName: 'Seed Potatoes', totalBags: 150 },
      ]),
    );
  });

  it('throws an error when getting summary for non-existent GRN', async () => {
    await expect(
      inventoryService.getGrnInventorySummary(facilityId, 'grn-missing'),
    ).rejects.toThrow(/not found in facility/);
  });
});
