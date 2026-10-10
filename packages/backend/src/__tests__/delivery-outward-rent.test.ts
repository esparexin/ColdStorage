import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-outward-rent-tester';

describe('Outward Rent Calculation & Boundary Flow (delivery-outward-rent.test.ts)', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Outward Rent Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Agro Farms Ltd' });
    await CommodityModel.create({
      id: 'cmd-wheat',
      name: 'Wheat',
      normalizedName: 'wheat',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  it('Seasonal Outward: calculates rent for Small bags (rate ₹10 × 10 months)', async () => {
    // 1. Inward records storage and rent type only — rentAmount is 0
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1001',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S',
        rentType: 'Seasonal',
      },
      USER_ID,
    );
    expect(grn.rentType).toBe('Seasonal');

    // 2. Outward delivery of 40 small bags
    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 40, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // 40 bags × ₹10/bag × 10 months = ₹4,000
    expect(del.delivery.rentCharge).toBe(4000);
    const challanDoc = await DeliveryChallanModel.findOne({ id: del.delivery.id }).exec();
    expect(challanDoc?.rentCharge).toBe(4000);
  });

  it('Seasonal Outward: calculates rent for Big bags (rate ₹15 × 10 months)', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1002',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'B',
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 0, bigBags: 30, bagCategory: 'Big' },
      USER_ID,
    );

    // 30 bags × ₹15/bag × 10 months = ₹4,500
    expect(del.delivery.rentCharge).toBe(4500);
  });

  it('Seasonal Outward: calculates rent for Small & Big split bags', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1003',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S+B',
        smallBags: 50,
        bigBags: 50,
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 20, bigBags: 30, bagCategory: 'Small & Big' },
      USER_ID,
    );

    // (20 × ₹10 + 30 × ₹15) × 10 months = (200 + 450) × 10 = ₹6,500
    expect(del.delivery.rentCharge).toBe(6500);
  });

  it('Monthly Outward: calculates rent using canonical rates and rentMonths', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1004',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 80,
        bagType: 'S',
        rentType: 'Monthly',
        rentMonths: 3,
      },
      USER_ID,
    );
    expect(grn.rentType).toBe('Monthly');

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 25, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // 25 bags × ₹10/bag × 3 months = ₹750
    expect(del.delivery.rentCharge).toBe(750);
  });

  it('preserves partial delivery and full delivery balance lifecycle', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1005',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S',
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // First partial delivery
    const d1 = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 40, bigBags: 0 },
      USER_ID,
    );
    expect(d1.summary.remainingDeliveryBalance).toBe(60);
    expect(d1.summary.grnStatus).toBe('OPEN');
    expect(d1.delivery.rentCharge).toBe(4000);

    // Second delivery of remaining bags
    const d2 = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 60, bigBags: 0 },
      USER_ID,
    );
    expect(d2.summary.remainingDeliveryBalance).toBe(0);
    expect(d2.delivery.rentCharge).toBe(6000);
  });

  it('accepts explicitly provided rentCharge when it matches recomputed rent', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1006',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // 20 bags × ₹10/bag × 10 months = ₹2,000 (matches server recomputation)
    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 20, bigBags: 0, rentCharge: 2000 },
      USER_ID,
    );

    expect(del.delivery.rentCharge).toBe(2000);
  });

  it('Seasonal Outward: calculates rent using agreed smallBagPrice from GRN', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '1007',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S',
        rentType: 'Seasonal',
        smallBagPrice: 12,
        bigBagPrice: 18,
      },
      USER_ID,
    );

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, smallBags: 40, bigBags: 0, bagCategory: 'Small' },
      USER_ID,
    );

    // 40 bags × ₹12/bag × 10 months = ₹4,800
    expect(del.delivery.rentCharge).toBe(4800);
  });
});
