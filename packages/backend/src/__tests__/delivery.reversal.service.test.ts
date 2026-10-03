import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { validateReversalBags } from '../modules/delivery/handlers/delivery-validation.helper.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const userId = 'usr-operator-1';

describe('P6 DeliveryService reversal tests', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Reversal Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Kisan Agro Corp' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-01',
      bags: 100,
      commodityName: 'Apples',
      grnNumber: 'GRN-25-26-0001',
    });
    await inventoryService.createPutAway(facilityId, grnId, { notes: 'Whole lot' }, userId);
  });

  it('executes a full delivery reversal, restoring exact stock', async () => {
    const delRes = await deliveryService.createDelivery(facilityId, { grnId, bags: 30 }, userId);
    expect((await inventoryService.getAvailableBags(facilityId, grnId))).toBe(70);

    const revRes = await deliveryService.reverseDelivery(
      facilityId,
      delRes.delivery.id,
      { reason: 'Customer returned truck due to quality rejection' },
      userId,
    );

    expect(revRes.reversal.deliveryId).toBe(delRes.delivery.id);
    expect(revRes.reversal.challanNumber).toBe(delRes.delivery.challanNumber);
    expect(revRes.challan.status).toBe('REVERSED');
    expect(revRes.summary.netDeliveredBags).toBe(0);
    expect(revRes.summary.remainingDeliveryBalance).toBe(100);
    expect(revRes.summary.physicallyStoredBags).toBe(100);

    const reversalLedger = await InventoryTransactionModel.findOne({
      referenceId: revRes.reversal.id,
      transactionType: 'DELIVERY_REVERSAL',
    }).exec();
    expect(reversalLedger?.quantity).toBe(30);
    expect(reversalLedger?.chamber).toBe('CH-01');
    expect(await inventoryService.getAvailableBags(facilityId, grnId)).toBe(100);
  });

  it('refuses a reversal larger than the bags originally delivered, writing nothing', async () => {
    const delRes = await deliveryService.createDelivery(facilityId, { grnId, bags: 30 }, userId);

    const session = await mongoose.startSession();
    try {
      await expect(
        validateReversalBags(facilityId, delRes.delivery.id, 31, session),
      ).rejects.toThrow(/only 30 bags remain delivered on this challan/);
    } finally {
      await session.endSession();
    }

    expect(await DeliveryReversalModel.countDocuments()).toBe(0);
    expect((await DeliveryChallanModel.findOne({ id: delRes.delivery.id }).exec())?.status).toBe('ISSUED');
    expect(await inventoryService.getAvailableBags(facilityId, grnId)).toBe(70);
  });

  it('rejects double reversal of an already reversed delivery challan', async () => {
    const delRes = await deliveryService.createDelivery(facilityId, { grnId, bags: 20 }, userId);

    await deliveryService.reverseDelivery(facilityId, delRes.delivery.id, { reason: 'First reversal' }, userId);

    await expect(
      deliveryService.reverseDelivery(facilityId, delRes.delivery.id, { reason: 'Second reversal attempt' }, userId),
    ).rejects.toThrow(/already REVERSED/);
    expect(await DeliveryReversalModel.countDocuments()).toBe(1);
  });

  it('re-opens a CLOSED GRN when the delivery that caused closure is reversed', async () => {
    const delRes = await deliveryService.createDelivery(facilityId, { grnId, bags: 100 }, userId);
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');

    const revRes = await deliveryService.reverseDelivery(
      facilityId,
      delRes.delivery.id,
      { reason: 'Full batch returned' },
      userId,
    );

    expect(revRes.summary.grnStatus).toBe('OPEN');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');
  });
});
