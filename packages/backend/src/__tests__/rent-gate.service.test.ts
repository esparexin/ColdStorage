import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { LevelModel } from '../database/models/level.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import { RackModel } from '../database/models/rack.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import {
  RentPaymentRequiredError,
  assertRentAllowedForOutward,
} from '../modules/common/rent-gate.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { rentService } from '../modules/rent/rent.service.js';

describe('Rent gate for outward movement — rent-gate.service.test.ts', () => {
  const facilityId = 'fac-rent-gate-1';
  const grnId = 'grn-rent-gate-1';
  const userId = 'usr-operator-gate';
  const chamberId = 'ch-gate-1';
  const rackId = 'rk-gate-1';
  const levelId = 'lvl-gate-1';
  const posId = 'pos-gate-1';

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
    await SystemSettingsModel.deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('counters').deleteMany({});

    await FacilityModel.create({ id: facilityId, name: 'Gate Facility', code: 'GTF', isActive: true });
    await ChamberModel.create({ id: chamberId, facilityId, chamberNumber: 'CH-01', isActive: true });
    await RackModel.create({ id: rackId, facilityId, chamberId, code: 'R1', isActive: true });
    await LevelModel.create({ id: levelId, facilityId, chamberId, rackId, levelNumber: 1, code: 'L1', isActive: true });
    await PositionModel.create({
      id: posId,
      facilityId,
      chamberId,
      rackId,
      levelId,
      code: 'R1-L1-P1',
      capacityBags: 100,
      isActive: true,
    });
    await CustomerModel.create({
      id: 'cust-g1',
      name: 'Gate Customer',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });
    await CommodityModel.create({ id: 'cmd-g1', name: 'Potato', normalizedName: 'potato', isActive: true });
    await SystemSettingsModel.create({
      orgName: 'Gate Org',
      address: 'Gate Address',
      contact: '+91 98765 43210',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      receiptPrefix: 'RCPT',
      printFooter: 'Thanks.',
    });
    await GrnModel.create({
      id: grnId,
      facilityId,
      grnNumber: 'GRN-26-27-0091',
      inwardReceiptNumber: 'RCPT-26-27-0091',
      date: new Date(),
      customerId: 'cust-g1',
      customerName: 'Gate Customer',
      commodityId: 'cmd-g1',
      commodityName: 'Potato',
      chamberId,
      chamberNumber: 'CH-01',
      bags: 100,
      bagType: 'S',
      rentType: 'Monthly',
      rentMonths: 1,
      rentAmount: 10000,
      status: 'OPEN',
      createdBy: userId,
    });
  });

  it('blocks outward movement when nothing is paid yet', async () => {
    const attempt = assertRentAllowedForOutward(
      facilityId,
      { id: grnId, grnNumber: 'GRN-26-27-0091', rentAmount: 10000 },
    );
    await expect(attempt).rejects.toBeInstanceOf(RentPaymentRequiredError);
    await expect(attempt).rejects.toMatchObject({ code: 'RENT_PAYMENT_REQUIRED', statusCode: 402 });
  });

  it('allows outward movement after a partial payment with isPartial flag', async () => {
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 4000, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );
    const gate = await assertRentAllowedForOutward(
      facilityId,
      { id: grnId, grnNumber: 'GRN-26-27-0091', rentAmount: 10000 },
    );
    expect(gate.paymentStatus).toBe('Not Settled');
    expect(gate.totalPaid).toBe(4000);
    expect(gate.remainingBalance).toBe(6000);
    expect(gate.isPartial).toBe(true);
  });

  it('allows outward movement when fully settled', async () => {
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 10000, paymentMode: 'UPI', paymentDate: new Date() },
      userId,
    );
    const gate = await assertRentAllowedForOutward(
      facilityId,
      { id: grnId, grnNumber: 'GRN-26-27-0091', rentAmount: 10000 },
    );
    expect(gate.paymentStatus).toBe('Settled');
    expect(gate.remainingBalance).toBe(0);
    expect(gate.isPartial).toBe(false);
  });

  it('allows outward movement when no rent is due', async () => {
    const gate = await assertRentAllowedForOutward(
      facilityId,
      { id: grnId, grnNumber: 'GRN-26-27-0091', rentAmount: 0 },
    );
    expect(gate.paymentStatus).toBe('Settled');
    expect(gate.isPartial).toBe(false);
  });

  it('blocks put-away and delivery until rent is paid, then completes 100→40 flow', async () => {
    await expect(
      inventoryService.createPutAway(facilityId, grnId, { items: [{ positionId: posId, bags: 100 }] }, userId),
    ).rejects.toBeInstanceOf(RentPaymentRequiredError);

    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 10000, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );
    await inventoryService.createPutAway(
      facilityId,
      grnId,
      { items: [{ positionId: posId, bags: 100 }] },
      userId,
    );

    const res = await deliveryService.createDelivery(
      facilityId,
      { grnId, items: [{ positionId: posId, bags: 40 }] },
      userId,
    );
    expect(res.delivery.totalBags).toBe(40);
    expect(res.summary.netDeliveredBags).toBe(40);
    expect(res.summary.remainingDeliveryBalance).toBe(60);
    expect(res.summary.grnStatus).toBe('OPEN');
  });
});
