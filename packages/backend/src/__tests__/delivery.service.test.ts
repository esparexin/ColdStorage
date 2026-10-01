import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';

describe('P6 DeliveryService Unit & Concurrency Tests', () => {
  const facilityId = 'fac-del-test';
  const chamberId = 'ch-del-1';
  const rackId = 'rk-del-1';
  const levelId = 'lvl-del-1';
  const pos1Id = 'pos-del-1';
  const pos2Id = 'pos-del-2';
  const customerId = 'cust-del-1';
  const commodityId = 'cmd-del-1';
  const grnId = 'grn-del-1';
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
    await CounterModel.deleteMany({});
    await PutAwayAllocationModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await DeliveryReversalModel.deleteMany({});

    // 1. Facility & Storage Layout
    await FacilityModel.create({
      id: facilityId,
      name: 'Delivery Test Facility',
      code: 'DTF',
      isActive: true,
    });
    await ChamberModel.create({
      id: chamberId,
      facilityId,
      chamberNumber: 'CH-01',
      isActive: true,
    });
    await RackModel.create({
      id: rackId,
      facilityId,
      chamberId,
      code: 'R1',
      isActive: true,
    });
    await LevelModel.create({
      id: levelId,
      facilityId,
      chamberId,
      rackId,
      levelNumber: 1,
      code: 'L1',
      isActive: true,
    });
    await PositionModel.create([
      {
        id: pos1Id,
        facilityId,
        chamberId,
        rackId,
        levelId,
        code: 'R1-L1-P1',
        capacityBags: 100,
        isActive: true,
      },
      {
        id: pos2Id,
        facilityId,
        chamberId,
        rackId,
        levelId,
        code: 'R1-L1-P2',
        capacityBags: 100,
        isActive: true,
      },
    ]);

    // 2. Customer & Commodity
    await CustomerModel.create({
      id: customerId,
      name: 'Kisan Agro Corp',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });
    await CommodityModel.create({
      id: commodityId,
      name: 'Apples',
      normalizedName: 'apples',
      isActive: true,
    });

    // 3. GRN with 100 bags received
    await GrnModel.create({
      id: grnId,
      facilityId,
      grnNumber: 'GRN-25-26-0001',
      inwardReceiptNumber: 'RCPT-25-26-0001',
      date: new Date(),
      customerId,
      customerName: 'Kisan Agro Corp',
      commodityId,
      commodityName: 'Apples',
      chamberId,
      chamberNumber: 'CH-01',
      bags: 100,
      bagType: 'B',
      rentType: 'Seasonal',
      rentAmount: 5000,
      status: 'OPEN',
      createdBy: userId,
    });

    // 4. Initial Put-Away: Put away 60 bags into pos1 (leaving 40 bags unallocated)
    await inventoryService.createPutAway(
      facilityId,
      grnId,
      {
        items: [{ positionId: pos1Id, bags: 60 }],
        notes: 'Initial 60 bags put away',
      },
      userId,
    );
  });

  it('allows delivery up to physically available bags when GRN is partially put away', async () => {
    // GRN has 100 bags received, 60 put away in pos1, 40 unallocated.
    // PhysicallyAvailable = 60 bags.
    const res = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [{ positionId: pos1Id, bags: 40 }],
        vehicleNumber: 'MH12AB1234',
        driverName: 'Raju Driver',
        weight: 2000,
        remarks: 'Partial delivery test',
      },
      userId,
    );

    expect(res.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-\d{4}$/);
    expect(res.delivery.totalBags).toBe(40);
    expect(res.delivery.status).toBe('ISSUED');

    // Summary checks
    expect(res.summary.totalReceivedBags).toBe(100);
    expect(res.summary.netDeliveredBags).toBe(40);
    expect(res.summary.remainingDeliveryBalance).toBe(60);
    expect(res.summary.physicallyStoredBags).toBe(20);
    expect(res.summary.grnStatus).toBe('OPEN');

    // Verify GRN document remains OPEN
    const grnDoc = await GrnModel.findOne({ id: grnId }).exec();
    expect(grnDoc?.status).toBe('OPEN');
  });

  it('rejects delivery attempting to deliver unallocated GRN bags (cannot deliver beyond physical stock)', async () => {
    // 60 bags in pos1, 40 unallocated.
    // Attempting to deliver 70 bags must fail because only 60 are physically present!
    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId,
          items: [{ positionId: pos1Id, bags: 70 }],
        },
        userId,
      ),
    ).rejects.toThrow(/exceeds physically available stock/);

    const deliveryCount = await DeliveryChallanModel.countDocuments();
    expect(deliveryCount).toBe(0);
  });

  it('rejects delivery requesting more bags from a position than physically reside there', async () => {
    // pos1 has 60 bags. pos2 has 0 bags.
    // Attempting to pick from pos2 must fail!
    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId,
          items: [{ positionId: pos2Id, bags: 10 }],
        },
        userId,
      ),
    ).rejects.toThrow(/exceeds available stock/);

    const deliveryCount = await DeliveryChallanModel.countDocuments();
    expect(deliveryCount).toBe(0);
  });

  it('automatically closes GRN when full delivery brings remaining balance and physical stock to 0', async () => {
    // 1. Put away the remaining 40 bags into pos2
    await inventoryService.createPutAway(
      facilityId,
      grnId,
      {
        items: [{ positionId: pos2Id, bags: 40 }],
      },
      userId,
    );

    // Now all 100 bags are physically present (60 in pos1, 40 in pos2).
    // 2. Deliver all 100 bags
    const res = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [
          { positionId: pos1Id, bags: 60 },
          { positionId: pos2Id, bags: 40 },
        ],
      },
      userId,
    );

    expect(res.delivery.totalBags).toBe(100);
    expect(res.summary.remainingDeliveryBalance).toBe(0);
    expect(res.summary.physicallyStoredBags).toBe(0);
    expect(res.summary.grnStatus).toBe('CLOSED');

    const grnDoc = await GrnModel.findOne({ id: grnId }).exec();
    expect(grnDoc?.status).toBe('CLOSED');
  });

  it('rejects any delivery attempt targeting an already CLOSED GRN', async () => {
    // Put away remaining 40 bags and deliver all 100 to close GRN
    await inventoryService.createPutAway(
      facilityId,
      grnId,
      { items: [{ positionId: pos2Id, bags: 40 }] },
      userId,
    );
    await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [
          { positionId: pos1Id, bags: 60 },
          { positionId: pos2Id, bags: 40 },
        ],
      },
      userId,
    );

    // Attempt another delivery on the closed GRN
    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId,
          items: [{ positionId: pos1Id, bags: 10 }],
        },
        userId,
      ),
    ).rejects.toThrow(/is CLOSED/);
  });

  it('executes full delivery reversal, restoring exact positions and quantities', async () => {
    // Deliver 30 bags from pos1
    const delRes = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [{ positionId: pos1Id, bags: 30 }],
      },
      userId,
    );

    // Verify position 1 stock before reversal is 60 - 30 = 30
    const occBefore = await inventoryService.getPositionOccupancy(facilityId, pos1Id);
    expect(occBefore.occupiedBags).toBe(30);

    // Reverse the delivery
    const revRes = await deliveryService.reverseDelivery(
      facilityId,
      delRes.delivery.id,
      { reason: 'Customer returned truck due to quality rejection' },
      userId,
    );

    expect(revRes.reversal.challanNumber).toBe(delRes.delivery.challanNumber);
    expect(revRes.challan.status).toBe('REVERSED');
    expect(revRes.summary.netDeliveredBags).toBe(0);
    expect(revRes.summary.remainingDeliveryBalance).toBe(100);
    expect(revRes.summary.physicallyStoredBags).toBe(60);

    // Verify position 1 stock is restored to 60
    const occAfter = await inventoryService.getPositionOccupancy(facilityId, pos1Id);
    expect(occAfter.occupiedBags).toBe(60);

    // Verify compensating ledger transaction
    const revLedgerDoc = await InventoryTransactionModel.findOne({
      referenceId: revRes.reversal.id,
      transactionType: 'DELIVERY_REVERSAL',
    }).exec();
    expect(revLedgerDoc).toBeDefined();
    expect(revLedgerDoc?.quantity).toBe(30);
  });

  it('reversal produces zero writes if returning stock would exceed position capacity', async () => {
    // Deliver 40 bags from pos1
    const delRes = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [{ positionId: pos1Id, bags: 40 }],
      },
      userId,
    );

    // Pos1 capacity is 100. It currently holds 20 bags.
    // Fill pos1 with 90 bags from another GRN to reduce available capacity to 10
    const grn2Id = 'grn-del-2';
    await GrnModel.create({
      id: grn2Id,
      facilityId,
      grnNumber: 'GRN-25-26-0002',
      inwardReceiptNumber: 'RCPT-25-26-0002',
      date: new Date(),
      customerId,
      customerName: 'Kisan Agro Corp',
      commodityId,
      commodityName: 'Apples',
      chamberId,
      chamberNumber: 'CH-01',
      bags: 90,
      bagType: 'B',
      rentType: 'Seasonal',
      rentAmount: 4500,
      status: 'OPEN',
      createdBy: userId,
    });
    await inventoryService.createPutAway(
      facilityId,
      grn2Id,
      { items: [{ positionId: pos1Id, bags: 80 }] },
      userId,
    );

    // Now pos1 has 20 + 80 = 100 bags (full). Available capacity = 0.
    // Attempting to reverse the 40-bag delivery into pos1 must fail because 40 > 0!
    await expect(
      deliveryService.reverseDelivery(
        facilityId,
        delRes.delivery.id,
        { reason: 'Customer returned dispatch' },
        userId,
      ),
    ).rejects.toThrow(/exceeds available capacity/);

    // Verify zero reversal writes: challan remains ISSUED
    const challanDoc = await DeliveryChallanModel.findOne({ id: delRes.delivery.id }).exec();
    expect(challanDoc?.status).toBe('ISSUED');
    const revCount = await DeliveryReversalModel.countDocuments();
    expect(revCount).toBe(0);
  });

  it('rejects double reversal of an already reversed delivery challan', async () => {
    const delRes = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [{ positionId: pos1Id, bags: 20 }],
      },
      userId,
    );

    await deliveryService.reverseDelivery(
      facilityId,
      delRes.delivery.id,
      { reason: 'First reversal' },
      userId,
    );

    // Attempt second reversal
    await expect(
      deliveryService.reverseDelivery(
        facilityId,
        delRes.delivery.id,
        { reason: 'Second reversal attempt' },
        userId,
      ),
    ).rejects.toThrow(/already REVERSED/);
  });

  it('re-opens a CLOSED GRN when the delivery that caused closure is reversed', async () => {
    // Put away remaining 40 bags into pos2
    await inventoryService.createPutAway(
      facilityId,
      grnId,
      { items: [{ positionId: pos2Id, bags: 40 }] },
      userId,
    );

    // Deliver all 100 bags to close GRN
    const delRes = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [
          { positionId: pos1Id, bags: 60 },
          { positionId: pos2Id, bags: 40 },
        ],
      },
      userId,
    );

    const grnClosed = await GrnModel.findOne({ id: grnId }).exec();
    expect(grnClosed?.status).toBe('CLOSED');

    // Reverse the delivery
    const revRes = await deliveryService.reverseDelivery(
      facilityId,
      delRes.delivery.id,
      { reason: 'Full batch returned' },
      userId,
    );

    expect(revRes.summary.grnStatus).toBe('OPEN');
    const grnReopened = await GrnModel.findOne({ id: grnId }).exec();
    expect(grnReopened?.status).toBe('OPEN');
  });

  it('handles concurrent delivery contention without exceeding remaining balance', async () => {
    // pos1 has 60 bags.
    // Operator A requests 40 bags; Operator B concurrently requests 40 bags.
    // Total 80 > 60 available. Exactly one must succeed.
    const promises = [
      deliveryService.createDelivery(
        facilityId,
        {
          grnId,
          items: [{ positionId: pos1Id, bags: 40 }],
          remarks: 'Op A',
        },
        'usr-op-a',
      ),
      deliveryService.createDelivery(
        facilityId,
        {
          grnId,
          items: [{ positionId: pos1Id, bags: 40 }],
          remarks: 'Op B',
        },
        'usr-op-b',
      ),
    ];

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const summary = await deliveryService.getDeliverySummary(facilityId, grnId);
    expect(summary.netDeliveredBags).toBe(40);
    expect(summary.remainingDeliveryBalance).toBe(60);
  });

  it('generates independent sequential FY delivery challan numbers', async () => {
    const del1 = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [{ positionId: pos1Id, bags: 10 }],
      },
      userId,
    );

    const del2 = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        items: [{ positionId: pos1Id, bags: 10 }],
      },
      userId,
    );

    expect(del1.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-0001$/);
    expect(del2.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-0002$/);
    expect(del1.delivery.challanNumber).not.toBe(del2.delivery.challanNumber);
  });
});
