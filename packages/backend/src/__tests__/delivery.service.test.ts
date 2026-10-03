import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { RentPaymentRequiredError } from '../modules/common/rent-gate.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const userId = 'usr-operator-1';

describe('P6 DeliveryService outward delivery tests', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Delivery Test Facility' });
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

  /** Put-away is whole-lot, so a fully allocated GRN is a single call. */
  async function allocateWholeLot(): Promise<void> {
    await inventoryService.createPutAway(facilityId, grnId, { notes: 'Whole lot' }, userId);
  }

  it('delivers a single bag count and reports the derived summary', async () => {
    await allocateWholeLot();

    const res = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: new Date(),
        bags: 40,
        vehicleNumber: 'MH12AB1234',
        driverName: 'Raju Driver',
        weight: 2000,
        remarks: 'Partial delivery test',
      },
      userId,
    );

    expect(res.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-\d{4}$/);
    expect(res.delivery.bags).toBe(40);
    expect(res.delivery.totalBags).toBe(40);
    expect(res.delivery.chamber).toBe('CH-01');
    expect(res.delivery.status).toBe('ISSUED');
    expect(res.delivery.issuedBy).toBe(userId);

    expect(res.summary.totalReceivedBags).toBe(100);
    expect(res.summary.netDeliveredBags).toBe(40);
    expect(res.summary.remainingDeliveryBalance).toBe(60);
    expect(res.summary.physicallyStoredBags).toBe(60);
    expect(res.summary.grnStatus).toBe('OPEN');

    const outward = await InventoryTransactionModel.findOne({ grnId, transactionType: 'OUTWARD_DELIVERY' }).exec();
    expect(outward?.quantity).toBe(40);
    expect(outward?.chamber).toBe('CH-01');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');
  });

  it('rejects over-delivery beyond the GRN balance', async () => {
    await allocateWholeLot();

    await expect(
      deliveryService.createDelivery(facilityId, { grnId, bags: 101 }, userId),
    ).rejects.toThrow(/exceeds remaining delivery balance/);

    expect(await DeliveryChallanModel.countDocuments()).toBe(0);
    expect(await InventoryTransactionModel.countDocuments({ transactionType: 'OUTWARD_DELIVERY' })).toBe(0);
  });

  it('delivers bags directly without requiring a separate put-away step', async () => {
    const res = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: new Date(),
        bags: 50,
      },
      userId,
    );

    expect(res.delivery.totalBags).toBe(50);
    expect(res.summary.remainingDeliveryBalance).toBe(50);
    expect(res.summary.physicallyStoredBags).toBe(50);
    expect(res.summary.netDeliveredBags).toBe(50);
  });

  it('automatically closes the GRN when balance and stored stock both reach zero', async () => {
    await allocateWholeLot();

    const res = await deliveryService.createDelivery(facilityId, { grnId, bags: 100 }, userId);

    expect(res.delivery.totalBags).toBe(100);
    expect(res.summary.remainingDeliveryBalance).toBe(0);
    expect(res.summary.physicallyStoredBags).toBe(0);
    expect(res.summary.grnStatus).toBe('CLOSED');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');
  });

  it('rejects any delivery attempt targeting an already CLOSED GRN', async () => {
    await allocateWholeLot();
    await deliveryService.createDelivery(facilityId, { grnId, bags: 100 }, userId);

    await expect(
      deliveryService.createDelivery(facilityId, { grnId, bags: 10 }, userId),
    ).rejects.toThrow(/is CLOSED/);
  });

  it('serialises concurrent deliveries so the remaining balance is never exceeded', async () => {
    await allocateWholeLot();

    const results = await Promise.allSettled([
      deliveryService.createDelivery(facilityId, { grnId, bags: 60, remarks: 'Op A' }, 'usr-op-a'),
      deliveryService.createDelivery(facilityId, { grnId, bags: 60, remarks: 'Op B' }, 'usr-op-b'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const summary = await deliveryService.getDeliverySummary(facilityId, grnId);
    expect(summary.netDeliveredBags).toBe(60);
    expect(summary.remainingDeliveryBalance).toBe(40);
    expect(await DeliveryChallanModel.countDocuments()).toBe(1);
  });

  it('generates independent sequential FY delivery challan numbers', async () => {
    await allocateWholeLot();

    const del1 = await deliveryService.createDelivery(facilityId, { grnId, bags: 10 }, userId);
    const del2 = await deliveryService.createDelivery(facilityId, { grnId, bags: 10 }, userId);

    expect(del1.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-0001$/);
    expect(del2.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-0002$/);
    expect(del1.delivery.challanNumber).not.toBe(del2.delivery.challanNumber);
  });

  it('blocks delivery behind the rent gate until rent is collected', async () => {
    const unpaidGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-02',
      bags: 50,
      commodityName: 'Apples',
      rentAmount: 5000,
    });

    const err = await deliveryService
      .createDelivery(facilityId, { grnId: unpaidGrnId, bags: 1 }, userId)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RentPaymentRequiredError);
    expect((err as RentPaymentRequiredError).code).toBe('RENT_PAYMENT_REQUIRED');
    expect((err as RentPaymentRequiredError).statusCode).toBe(402);
    expect(await DeliveryChallanModel.countDocuments()).toBe(0);
  });
});
