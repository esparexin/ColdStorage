import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../database/models/put-away.model.js';
import {
  RentPaymentRequiredError,
  assertRentAllowedForOutward,
} from '../modules/common/rent-gate.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

const FACILITY_ID = 'fac-rent-gate';
const CUSTOMER_ID = 'cust-rent-gate';
const GRN_NUMBER = 'GRN-26-27-0091';
const USER_ID = 'usr-operator-gate';
const RENT_AMOUNT = 10000;

/**
 * Rent gate for outward movement.
 *
 * The gate is purely a rent-ledger rule, so the GRN needs no storage hierarchy: chamber is the
 * free-text label recorded on the receipt, put-away confirms the whole lot in it, and delivery
 * withdraws a single bag count.
 */
describe('Rent gate for outward movement — rent-gate.service.test.ts', () => {
  let grnId: string;

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await CounterModel.deleteMany({});
    await PutAwayAllocationModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    // RentPayment is immutable by design, so the reset goes through the raw collection.
    await mongoose.connection.collection('rentpayments').deleteMany({});

    await seedFacility({ id: FACILITY_ID, name: 'Gate Facility', code: 'GTF' });
    await seedCustomer({ id: CUSTOMER_ID, name: 'Gate Customer', facilityId: FACILITY_ID });
    grnId = await seedGrn({
      facilityId: FACILITY_ID,
      customerId: CUSTOMER_ID,
      commodityId: 'cmd-rent-gate',
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      rentType: 'Monthly',
      rentAmount: RENT_AMOUNT,
      grnNumber: GRN_NUMBER,
    });
  });

  it('blocks outward movement when nothing is paid yet', async () => {
    const attempt = assertRentAllowedForOutward(FACILITY_ID, {
      id: grnId,
      grnNumber: GRN_NUMBER,
      rentAmount: RENT_AMOUNT,
    });

    await expect(attempt).rejects.toBeInstanceOf(RentPaymentRequiredError);
    await expect(attempt).rejects.toMatchObject({ code: 'RENT_PAYMENT_REQUIRED', statusCode: 402 });
  });

  it('allows outward movement after a partial payment and reports the balance', async () => {
    await rentService.recordPayment(
      FACILITY_ID,
      { grnId, amountPaid: 4000, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );

    const gate = await assertRentAllowedForOutward(FACILITY_ID, {
      id: grnId,
      grnNumber: GRN_NUMBER,
      rentAmount: RENT_AMOUNT,
    });

    expect(gate.paymentStatus).toBe('Not Settled');
    expect(gate.totalPaid).toBe(4000);
    expect(gate.remainingBalance).toBe(6000);
    expect(gate.isPartial).toBe(true);
  });

  it('allows outward movement when fully settled', async () => {
    await rentService.recordPayment(
      FACILITY_ID,
      { grnId, amountPaid: RENT_AMOUNT, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );

    const gate = await assertRentAllowedForOutward(FACILITY_ID, {
      id: grnId,
      grnNumber: GRN_NUMBER,
      rentAmount: RENT_AMOUNT,
    });

    expect(gate.paymentStatus).toBe('Settled');
    expect(gate.remainingBalance).toBe(0);
    expect(gate.isPartial).toBe(false);
  });

  it('allows outward movement when no rent is due', async () => {
    const gate = await assertRentAllowedForOutward(FACILITY_ID, {
      id: grnId,
      grnNumber: GRN_NUMBER,
      rentAmount: 0,
    });

    expect(gate.paymentStatus).toBe('Settled');
    expect(gate.isPartial).toBe(false);
  });

  it('blocks put-away and delivery until rent is paid, then completes the 100→40 flow', async () => {
    await expect(
      inventoryService.createPutAway(FACILITY_ID, grnId, { notes: 'Whole lot' }, USER_ID),
    ).rejects.toBeInstanceOf(RentPaymentRequiredError);
    await expect(
      deliveryService.createDelivery(FACILITY_ID, { grnId, bags: 40 }, USER_ID),
    ).rejects.toBeInstanceOf(RentPaymentRequiredError);

    await rentService.recordPayment(
      FACILITY_ID,
      { grnId, amountPaid: RENT_AMOUNT, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );

    const putAway = await inventoryService.createPutAway(
      FACILITY_ID,
      grnId,
      { notes: 'Whole lot' },
      USER_ID,
    );
    expect(putAway.putAway.bags).toBe(100);
    expect(putAway.putAway.chamber).toBe('CH-01');
    expect(putAway.summary.putAwayStatus).toBe('ALLOCATED');

    const res = await deliveryService.createDelivery(FACILITY_ID, { grnId, bags: 40 }, USER_ID);
    expect(res.delivery.totalBags).toBe(40);
    expect(res.delivery.chamber).toBe('CH-01');
    expect(res.summary.netDeliveredBags).toBe(40);
    expect(res.summary.remainingDeliveryBalance).toBe(60);
    expect(res.summary.grnStatus).toBe('OPEN');
  });
});
