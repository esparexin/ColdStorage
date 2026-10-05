import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { RentPaymentRequiredError } from '../modules/common/rent-gate.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
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

  /** GRN is authoritative inward stock; allocation is automatic. */
  async function allocateWholeLot(): Promise<void> {}

  it('delivers a single bag count and reports the derived summary', async () => {
    await allocateWholeLot();

    const res = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: new Date(),
        smallBags: 40,
        bigBags: 0,
        vehicleNumber: 'MH12AB1234',
        driverName: 'Raju Driver',
        weight: 2000,
        remarks: 'Partial delivery test',
      },
      userId,
    );

    expect(res.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-\d{4}$/);
    expect(res.delivery.smallBags).toBe(40);
    expect(res.delivery.bigBags).toBe(0);
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
    expect(outward?.smallQuantity).toBe(40);
    expect(outward?.bigQuantity).toBe(0);
    expect(outward?.chamber).toBe('CH-01');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('OPEN');
  });

  it('rejects over-delivery beyond the GRN balance', async () => {
    await allocateWholeLot();

    await expect(
      deliveryService.createDelivery(facilityId, { grnId, smallBags: 101, bigBags: 0 }, userId),
    ).rejects.toThrow(/exceeds the available balance of 100 small and 0 big bags/);

    expect(await DeliveryChallanModel.countDocuments()).toBe(0);
    expect(await InventoryTransactionModel.countDocuments({ transactionType: 'OUTWARD_DELIVERY' })).toBe(0);
  });

  it('delivers bags directly without requiring a separate put-away step', async () => {
    const res = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: new Date(),
        smallBags: 50,
        bigBags: 0,
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

    const res = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 100, bigBags: 0 }, userId);

    expect(res.delivery.totalBags).toBe(100);
    expect(res.summary.remainingDeliveryBalance).toBe(0);
    expect(res.summary.physicallyStoredBags).toBe(0);
    expect(res.summary.grnStatus).toBe('CLOSED');
    expect((await GrnModel.findOne({ id: grnId }).exec())?.status).toBe('CLOSED');
  });

  it('correctly records multi-step partial deliveries with exact opening and closing snapshots', async () => {
    const d1 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 40, bigBags: 0, marks: 'LOT-A', gpNumber: 'GP-001' },
      userId,
    );
    expect(d1.delivery.smallBags).toBe(40);
    expect(d1.delivery.totalBags).toBe(40);
    expect(d1.delivery.marks).toBe('LOT-A');
    expect(d1.delivery.gpNumber).toBe('GP-001');
    expect(d1.summary.grnStatus).toBe('OPEN');
    expect(d1.summary.remainingDeliveryBalance).toBe(60);

    const d2 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 30, bigBags: 0 },
      userId,
    );
    expect(d2.delivery.smallBags).toBe(30);
    expect(d2.delivery.totalBags).toBe(30);
    expect(d2.summary.grnStatus).toBe('OPEN');
    expect(d2.summary.remainingDeliveryBalance).toBe(30);

    const d3 = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 30, bigBags: 0 },
      userId,
    );
    expect(d3.delivery.smallBags).toBe(30);
    expect(d3.delivery.totalBags).toBe(30);
    expect(d3.summary.grnStatus).toBe('CLOSED');
    expect(d3.summary.remainingDeliveryBalance).toBe(0);

    const grnDoc = await GrnModel.findOne({ id: grnId }).exec();
    expect(grnDoc?.status).toBe('CLOSED');

    // The challan stores the dispatched composition only. Opening/closing are derived balances,
    // so a reversal cannot leave a stale snapshot behind.
    const savedDocs = await DeliveryChallanModel.find({ grnId }).sort({ createdAt: 1 }).exec();
    expect(savedDocs).toHaveLength(3);
    expect(savedDocs.map((d) => d.smallBags + d.bigBags)).toEqual([40, 30, 30]);
    expect(savedDocs[0].marks).toBe('LOT-A');
    expect(savedDocs[0].gpNumber).toBe('GP-001');
  });

  it('rejects any delivery attempt targeting an already CLOSED GRN', async () => {
    await allocateWholeLot();
    await deliveryService.createDelivery(facilityId, { grnId, smallBags: 100, bigBags: 0 }, userId);

    await expect(
      deliveryService.createDelivery(facilityId, { grnId, smallBags: 10, bigBags: 0 }, userId),
    ).rejects.toThrow(/is CLOSED/);
  });

  it('serialises concurrent deliveries so the remaining balance is never exceeded', async () => {
    await allocateWholeLot();

    const results = await Promise.allSettled([
      deliveryService.createDelivery(facilityId, { grnId, smallBags: 60, bigBags: 0, remarks: 'Op A' }, 'usr-op-a'),
      deliveryService.createDelivery(facilityId, { grnId, smallBags: 60, bigBags: 0, remarks: 'Op B' }, 'usr-op-b'),
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

    const del1 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 10, bigBags: 0 }, userId);
    const del2 = await deliveryService.createDelivery(facilityId, { grnId, smallBags: 10, bigBags: 0 }, userId);

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
      .createDelivery(facilityId, { grnId: unpaidGrnId, smallBags: 1, bigBags: 0 }, userId)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RentPaymentRequiredError);
    expect((err as RentPaymentRequiredError).code).toBe('RENT_PAYMENT_REQUIRED');
    expect((err as RentPaymentRequiredError).statusCode).toBe(402);
    expect(await DeliveryChallanModel.countDocuments()).toBe(0);
  });
});
