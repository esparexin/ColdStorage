import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const userId = 'usr-operator-1';

describe('P6 DeliveryService reversal tests', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

    afterAll(disconnectTestDatabase);

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
  });

  it('executes a full delivery reversal, restoring exact stock', async () => {
    const delRes = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 30, bigBags: 0 }, userId);
    expect((await inventoryService.getAvailableBags(facilityId, grnId)).bags).toBe(70);

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
    expect(reversalLedger?.smallQuantity).toBe(30);
    expect(reversalLedger?.bigQuantity).toBe(0);
    expect(reversalLedger?.chamber).toBe('CH-01');
    expect((await inventoryService.getAvailableBags(facilityId, grnId)).bags).toBe(100);
  });

  it('restores the exact dispatched composition, not an arbitrary bag count', async () => {
    // Reversal is whole-challan by decision: the P0 lock parks partial reversal rules, so the
    // reversal row must carry the challan's own small/big split and nothing else. A mixed GRN is
    // required so the restoration is genuinely per bag type.
    const mixedGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-02',
      bags: 200,
      bagType: 'S+B',
      smallBags: 100,
      bigBags: 100,
      grnNumber: 'GRN-25-26-0002',
    });
    const delRes = await deliveryService.createDelivery(
      facilityId,
      { grnId: mixedGrnId, smallBags: 20, bigBags: 10 },
      userId,
    );
    expect((await inventoryService.getAvailableBags(facilityId, mixedGrnId))).toEqual({
      bags: 170,
      smallBags: 80,
      bigBags: 90,
    });

    await deliveryService.reverseDelivery(
      facilityId,
      delRes.delivery.id,
      { reason: 'Whole lot returned' },
      userId,
    );

    expect((await inventoryService.getAvailableBags(facilityId, mixedGrnId))).toEqual({
      bags: 200,
      smallBags: 100,
      bigBags: 100,
    });
  });

  it('rejects double reversal of an already reversed delivery challan', async () => {
    const delRes = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 20, bigBags: 0 }, userId);

    await deliveryService.reverseDelivery(facilityId, delRes.delivery.id, { reason: 'First reversal' }, userId);

    await expect(
      deliveryService.reverseDelivery(facilityId, delRes.delivery.id, { reason: 'Second reversal attempt' }, userId),
    ).rejects.toThrow(/already REVERSED/);
    expect(await DeliveryReversalModel.countDocuments()).toBe(1);
  });

  it('re-opens a CLOSED GRN when the delivery that caused closure is reversed', async () => {
    const delRes = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 100, bigBags: 0 }, userId);
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
