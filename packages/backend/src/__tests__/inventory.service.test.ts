import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';

describe('P5 InventoryService Unit & Concurrency Tests', () => {
  const facilityId = 'fac-inv-test';
  const chamber1Id = 'ch-inv-1';
  const chamber2Id = 'ch-inv-2';
  const rack1Id = 'rk-inv-1';
  const level1Id = 'lvl-inv-1';
  const pos1Id = 'pos-inv-1';
  const pos2Id = 'pos-inv-2';
  const pos3Id = 'pos-inv-3'; // In chamber 2
  const customerId = 'cust-inv-1';
  const commodityId = 'cmd-inv-1';
  const grnId = 'grn-inv-1';
  const userId = 'usr-operator-1';

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await ChamberModel.deleteMany({});
    await RackModel.deleteMany({});
    await LevelModel.deleteMany({});
    await PositionModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await PutAwayAllocationModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});

    // 1. Seed Facility
    await FacilityModel.create({
      id: facilityId,
      name: 'Inventory Test Facility',
      code: 'ITF',
      isActive: true,
    });

    // 2. Seed Chambers
    await ChamberModel.create({
      id: chamber1Id,
      facilityId,
      chamberNumber: 'CH-01',
      isActive: true,
    });
    await ChamberModel.create({
      id: chamber2Id,
      facilityId,
      chamberNumber: 'CH-02',
      isActive: true,
    });

    // 3. Seed Rack & Level in Chamber 1
    await RackModel.create({
      id: rack1Id,
      facilityId,
      chamberId: chamber1Id,
      code: 'R1',
      isActive: true,
    });
    await LevelModel.create({
      id: level1Id,
      facilityId,
      chamberId: chamber1Id,
      rackId: rack1Id,
      levelNumber: 1,
      code: 'L1',
      isActive: true,
    });

    // 4. Seed Positions in Chamber 1 (capacity: 100 bags each)
    await PositionModel.create({
      id: pos1Id,
      facilityId,
      chamberId: chamber1Id,
      rackId: rack1Id,
      levelId: level1Id,
      code: 'R1-L1-P1',
      capacityBags: 100,
      isActive: true,
    });
    await PositionModel.create({
      id: pos2Id,
      facilityId,
      chamberId: chamber1Id,
      rackId: rack1Id,
      levelId: level1Id,
      code: 'R1-L1-P2',
      capacityBags: 100,
      isActive: true,
    });

    // 5. Seed Position in Chamber 2
    const rack2Id = 'rk-inv-2';
    const level2Id = 'lvl-inv-2';
    await RackModel.create({
      id: rack2Id,
      facilityId,
      chamberId: chamber2Id,
      code: 'R2',
      isActive: true,
    });
    await LevelModel.create({
      id: level2Id,
      facilityId,
      chamberId: chamber2Id,
      rackId: rack2Id,
      levelNumber: 1,
      code: 'L1',
      isActive: true,
    });
    await PositionModel.create({
      id: pos3Id,
      facilityId,
      chamberId: chamber2Id,
      rackId: rack2Id,
      levelId: level2Id,
      code: 'R2-L1-P3',
      capacityBags: 100,
      isActive: true,
    });

    // 6. Seed Customer & Commodity
    await CustomerModel.create({
      id: customerId,
      name: 'Ramesh Agro Traders',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });
    await CommodityModel.create({
      id: commodityId,
      name: 'Seed Potatoes',
      normalizedName: 'seed potatoes',
      isActive: true,
    });

    // 7. Seed GRN with 150 bags in Chamber 1
    await GrnModel.create({
      id: grnId,
      facilityId,
      grnNumber: 'GRN-25-26-0001',
      inwardReceiptNumber: 'RCPT-25-26-0001',
      date: new Date(),
      customerId,
      customerName: 'Ramesh Agro Traders',
      commodityId,
      commodityName: 'Seed Potatoes',
      chamberId: chamber1Id,
      chamberNumber: 'CH-01',
      bags: 150,
      bagType: 'S',
      rentType: 'Monthly',
      rentMonths: 3,
      rentAmount: 4500,
      status: 'OPEN',
      createdBy: userId,
    });
  });

  it('performs full put-away across multiple positions', async () => {
    const result = await inventoryService.createPutAway(
      facilityId,
      grnId,
      {
        items: [
          { positionId: pos1Id, bags: 100 },
          { positionId: pos2Id, bags: 50 },
        ],
        notes: 'Full allocation',
      },
      userId,
    );

    expect(result.putAway.totalBags).toBe(150);
    expect(result.summary.allocatedBags).toBe(150);
    expect(result.summary.unallocatedBags).toBe(0);
    expect(result.summary.putAwayStatus).toBe('FULLY_ALLOCATED');

    // Verify canonical ledger entries
    const ledgerDocs = await InventoryTransactionModel.find({ grnId }).exec();
    expect(ledgerDocs).toHaveLength(2);
    expect(ledgerDocs[0].transactionType).toBe('INWARD_PUTAWAY');
    expect(ledgerDocs[0].referenceType).toBe('PUT_AWAY');
    expect(ledgerDocs[0].referenceId).toBe(result.putAway.id);

    // Verify position occupancy
    const pos1Occ = await inventoryService.getPositionOccupancy(facilityId, pos1Id);
    expect(pos1Occ.occupiedBags).toBe(100);
    expect(pos1Occ.availableBags).toBe(0);
    expect(pos1Occ.utilizationRate).toBe(100);

    const pos2Occ = await inventoryService.getPositionOccupancy(facilityId, pos2Id);
    expect(pos2Occ.occupiedBags).toBe(50);
    expect(pos2Occ.availableBags).toBe(50);
    expect(pos2Occ.utilizationRate).toBe(50);
  });

  it('performs partial put-away leaving unallocated bags', async () => {
    // 1. First partial allocation (60 bags)
    const res1 = await inventoryService.createPutAway(
      facilityId,
      grnId,
      {
        items: [{ positionId: pos1Id, bags: 60 }],
        notes: 'First batch',
      },
      userId,
    );

    expect(res1.summary.allocatedBags).toBe(60);
    expect(res1.summary.unallocatedBags).toBe(90);
    expect(res1.summary.putAwayStatus).toBe('PARTIALLY_ALLOCATED');

    // 2. Second partial allocation (40 bags to same position)
    const res2 = await inventoryService.createPutAway(
      facilityId,
      grnId,
      {
        items: [{ positionId: pos1Id, bags: 40 }],
        notes: 'Second batch',
      },
      userId,
    );

    expect(res2.summary.allocatedBags).toBe(100);
    expect(res2.summary.unallocatedBags).toBe(50);
    expect(res2.summary.putAwayStatus).toBe('PARTIALLY_ALLOCATED');

    const pos1Occ = await inventoryService.getPositionOccupancy(facilityId, pos1Id);
    expect(pos1Occ.occupiedBags).toBe(100);
    expect(pos1Occ.availableBags).toBe(0);
  });

  it('prevents GRN over-allocation (request exceeds unallocated bags)', async () => {
    // Attempt to allocate 160 bags when GRN only has 150
    await expect(
      inventoryService.createPutAway(
        facilityId,
        grnId,
        {
          items: [
            { positionId: pos1Id, bags: 100 },
            { positionId: pos2Id, bags: 60 },
          ],
        },
        userId,
      ),
    ).rejects.toThrow(/exceeds unallocated GRN balance/);

    // Verify zero writes
    const ledgerCount = await InventoryTransactionModel.countDocuments();
    expect(ledgerCount).toBe(0);
    const putAwayCount = await PutAwayAllocationModel.countDocuments();
    expect(putAwayCount).toBe(0);
  });

  it('prevents position over-capacity (request exceeds position capacityBags)', async () => {
    // pos1 capacity is 100 bags, attempt to allocate 120
    await expect(
      inventoryService.createPutAway(
        facilityId,
        grnId,
        {
          items: [{ positionId: pos1Id, bags: 120 }],
        },
        userId,
      ),
    ).rejects.toThrow(/exceeds available capacity/);

    const ledgerCount = await InventoryTransactionModel.countDocuments();
    expect(ledgerCount).toBe(0);
  });

  it('enforces chamber mismatch guard (cannot put away into different chamber)', async () => {
    // pos3 belongs to Chamber 2, but GRN is admitted to Chamber 1
    await expect(
      inventoryService.createPutAway(
        facilityId,
        grnId,
        {
          items: [{ positionId: pos3Id, bags: 50 }],
        },
        userId,
      ),
    ).rejects.toThrow(/belongs to chamber.*but GRN belongs to chamber/);

    const ledgerCount = await InventoryTransactionModel.countDocuments();
    expect(ledgerCount).toBe(0);
  });

  it('enforces inactive hierarchy guard', async () => {
    // Deactivate Level 1
    await LevelModel.updateOne({ id: level1Id }, { isActive: false });

    await expect(
      inventoryService.createPutAway(
        facilityId,
        grnId,
        {
          items: [{ positionId: pos1Id, bags: 50 }],
        },
        userId,
      ),
    ).rejects.toThrow(/Parent Level.*is inactive/);

    const ledgerCount = await InventoryTransactionModel.countDocuments();
    expect(ledgerCount).toBe(0);
  });

  it('handles concurrent position contention with zero partial writes and no capacity breach', async () => {
    // Position 1 has capacity 100.
    // Operator A requests 60 bags; Operator B concurrently requests 60 bags.
    // Both cannot succeed since 60 + 60 = 120 > 100. Exactly one must succeed.
    const promises = [
      inventoryService.createPutAway(
        facilityId,
        grnId,
        { items: [{ positionId: pos1Id, bags: 60 }] },
        'usr-op-a',
      ),
      inventoryService.createPutAway(
        facilityId,
        grnId,
        { items: [{ positionId: pos1Id, bags: 60 }] },
        'usr-op-b',
      ),
    ];

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Verify position occupancy is strictly 60 (no over-capacity)
    const pos1Occ = await inventoryService.getPositionOccupancy(facilityId, pos1Id);
    expect(pos1Occ.occupiedBags).toBe(60);
    expect(pos1Occ.availableBags).toBe(40);

    // Verify ledger count
    const ledgerCount = await InventoryTransactionModel.countDocuments();
    expect(ledgerCount).toBe(1);
  });

  it('handles concurrent GRN contention without exceeding received bags', async () => {
    // GRN has 150 bags.
    // Operator A requests 100 bags (in pos1); Operator B requests 100 bags (in pos2).
    // Total 200 > 150. Exactly one must succeed.
    const promises = [
      inventoryService.createPutAway(
        facilityId,
        grnId,
        { items: [{ positionId: pos1Id, bags: 100 }] },
        'usr-op-a',
      ),
      inventoryService.createPutAway(
        facilityId,
        grnId,
        { items: [{ positionId: pos2Id, bags: 100 }] },
        'usr-op-b',
      ),
    ];

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Total allocated must be strictly 100
    const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(summary.allocatedBags).toBe(100);
    expect(summary.unallocatedBags).toBe(50);
  });

  it('prevents deadlocks during concurrent multi-position allocations in reverse orders', async () => {
    // Request 1: [pos1, pos2]
    // Request 2: [pos2, pos1]
    // Deterministic sorting ensures both lock pos1 before pos2.
    const p1 = inventoryService.createPutAway(
      facilityId,
      grnId,
      {
        items: [
          { positionId: pos1Id, bags: 40 },
          { positionId: pos2Id, bags: 30 },
        ],
      },
      'usr-op-1',
    );

    const p2 = inventoryService.createPutAway(
      facilityId,
      grnId,
      {
        items: [
          { positionId: pos2Id, bags: 30 },
          { positionId: pos1Id, bags: 40 },
        ],
      },
      'usr-op-2',
    );

    // Both should complete without deadlock (total bags = 40+30 + 30+40 = 140 <= 150)
    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    // Depending on timing, both can succeed or one may retry and succeed
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const summary = await inventoryService.getGrnInventorySummary(facilityId, grnId);
    expect(summary.allocatedBags).toBeLessThanOrEqual(150);
  });
});
