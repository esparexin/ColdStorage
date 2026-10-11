import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-monthly-rent-cycles';

describe('Outward Delivery Monthly Rent Dynamic Cycle Calculation', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Dynamic Cycles Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Fresh Produce Traders' });
    await CommodityModel.create({
      id: 'cmd-onions',
      name: 'Onions',
      normalizedName: 'onions',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  it('1. charges at least one full month for one-day storage', async () => {
    const deliveryDate = new Date();
    const inwardDate = new Date(deliveryDate.getTime() - 24 * 60 * 60 * 1000);

    const grnId = await seedGrn({
      facilityId, customerId, commodityId: 'cmd-onions', commodityName: 'Onions',
      chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0,
      bagPrice: 10, rentType: 'Monthly', date: inwardDate,
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId, date: deliveryDate, smallBags: 40, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // 40 bags × ₹10/bag × 1 full month = ₹400
    expect(del.delivery.rentCharge).toBe(400);
    expect(del.summary.remainingDeliveryBalance).toBe(60);
  });

  it('2. charges 1 full month for withdrawal within first monthly billing cycle', async () => {
    const deliveryDate = new Date();
    const inwardDate = new Date(deliveryDate.getTime() - 15 * 24 * 60 * 60 * 1000);

    const grnId = await seedGrn({
      facilityId, customerId, commodityId: 'cmd-onions', commodityName: 'Onions',
      chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0,
      bagPrice: 10, rentType: 'Monthly', date: inwardDate,
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId, date: deliveryDate, smallBags: 50, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // 50 bags × ₹10/bag × 1 month = ₹500
    expect(del.delivery.rentCharge).toBe(500);
    expect(del.summary.remainingDeliveryBalance).toBe(50);
  });

  it('3. charges multiple elapsed cycles dynamically across storage duration', async () => {
    const deliveryDate = new Date();
    // Inward ~3.2 months earlier (enters Cycle 4)
    const inwardDate = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth() - 3, deliveryDate.getDate() - 5);

    const grnId = await seedGrn({
      facilityId, customerId, commodityId: 'cmd-onions', commodityName: 'Onions',
      chamber: 'CH-01', bags: 100, bagType: 'S', smallBags: 100, bigBags: 0,
      bagPrice: 10, rentType: 'Monthly', date: inwardDate,
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId, date: deliveryDate, smallBags: 50, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // 50 bags × ₹10/bag × 4 cycles = ₹2,000
    expect(del.delivery.rentCharge).toBe(2000);
    expect(del.summary.remainingDeliveryBalance).toBe(50);

    // Verify rent summary reflects the outward charges on unbilled monthly lot
    const summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalPaid).toBe(0);
    expect(summary.totalDue).toBe(2000);
    expect(summary.remainingBalance).toBe(2000);
  });

  it('4. preserves Seasonal rent as flat whole-season rate (never multiplied by months or 10)', async () => {
    const deliveryDate = new Date();
    const inwardDate = new Date(
      deliveryDate.getFullYear(),
      deliveryDate.getMonth() - 3,
      deliveryDate.getDate() - 5,
    );

    const grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-onions',
      commodityName: 'Onions',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S',
      smallBags: 100,
      bigBags: 0,
      bagPrice: 25,
      rentType: 'Seasonal',
      rentAmount: 2500,
      date: inwardDate,
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: deliveryDate,
        smallBags: 50,
        bigBags: 0,
        bagCategory: 'Small',
      },
      USER_ID,
    );

    // 50 bags × ₹25 seasonal rate flat = ₹1,250
    expect(del.delivery.rentCharge).toBe(1250);
  });

  it('5. payment integrity: uncollected rent remains pending, recording payment reduces balance', async () => {
    const deliveryDate = new Date();
    const inwardDate = new Date(deliveryDate.getTime() - 24 * 60 * 60 * 1000);

    const grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-onions',
      commodityName: 'Onions',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S',
      smallBags: 100,
      bigBags: 0,
      bagPrice: 10,
      rentType: 'Monthly',
      date: inwardDate,
    });

    await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: deliveryDate,
        smallBags: 100,
        bigBags: 0,
        bagCategory: 'Small',
      },
      USER_ID,
    );

    // Stock reached 0, but rent is unpaid!
    const grnDocAfterDel = await GrnModel.findOne({ id: grnId }).exec();
    expect(grnDocAfterDel?.status).toBe('OPEN'); // Closure invariant: unpaid balance prevents close

    let summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalPaid).toBe(0);
    expect(summary.totalDue).toBe(1000);
    expect(summary.remainingBalance).toBe(1000);

    // Now collect payment of ₹1,000
    await rentService.recordPayment(
      facilityId,
      {
        grnId,
        amountPaid: 1000,
        paymentMode: 'Cash',
        paymentDate: new Date(),
      },
      USER_ID,
    );

    summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalPaid).toBe(1000);
    expect(summary.remainingBalance).toBe(0);
    expect(summary.paymentStatus).toBe('Settled');

    // GRN should now be CLOSED since bags === 0 and balance === 0
    const grnDocAfterPayment = await GrnModel.findOne({ id: grnId }).exec();
    expect(grnDocAfterPayment?.status).toBe('CLOSED');
  });
});
