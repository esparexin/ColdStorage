import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { computeExpectedDeliveryRent } from '../modules/delivery/handlers/delivery-rent.helper.js';

describe('Inward stores no Hamali & Seasonal_3M Delivery Rent Engine', () => {
  const facilityId = 'fac-test-1';
  const customerId = 'cust-test-1';
  const commodityId = 'cmd-test-1';
  const userId = 'usr-test-1';

  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToDatabase();
  });

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await GrnModel.deleteMany({});

    await FacilityModel.create({
      id: facilityId,
      name: 'Main Facility',
      code: 'FAC-01',
      isActive: true,
    });

    await CustomerModel.create({
      id: customerId,
      name: 'Farmer Ramesh',
      facilityIds: [facilityId],
      isActive: true,
    });

    await CommodityModel.create({
      id: commodityId,
      name: 'Cold Potato 3M',
      normalizedName: 'cold potato 3m',
      seasonDuration: 'Seasonal_3M',
      hamaliRate: 4,
      isActive: true,
    });

    await CommodityRateModel.create({
      id: 'crt-s',
      commodityId,
      rentType: 'Seasonal',
      smallRate: 30,
      bigRate: 35,
      isActive: true,
    });

    await CommodityRateModel.create({
      id: 'crt-m',
      commodityId,
      rentType: 'Monthly',
      smallRate: 10,
      bigRate: 12,
      isActive: true,
    });
  });

  it('stores no hamali on Inward GRN: hamali is internal-only rent input', async () => {
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: '5001',
        date: new Date('2026-01-05'),
        customerId,
        commodityId,
        chamber: 'CH-1',
        bags: 100,
        bagType: 'S/B',
        rentType: 'Seasonal_3M',
        bagPrice: 30,
        rentAmount: 3000,
      },
      userId,
    );

    expect('hamaliRate' in grn).toBe(false);
    expect('hamaliAmount' in grn).toBe(false);
    expect(grn.rentType).toBe('Seasonal_3M');

    const persisted = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(persisted).not.toBeNull();
    expect('hamaliRate' in persisted!).toBe(false);
    expect('hamaliAmount' in persisted!).toBe(false);
  });

  it('ignores legacy hamaliRate input on Inward GRN', async () => {
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: '5002',
        date: new Date('2026-01-05'),
        customerId,
        commodityId,
        chamber: 'CH-1',
        bags: 200,
        bagType: 'S/B',
        rentType: 'Seasonal_3M',
        bagPrice: 30,
        rentAmount: 6000,
      } as Parameters<typeof createGrn>[1],
      userId,
    );

    expect('hamaliRate' in grn).toBe(false);
    expect('hamaliAmount' in grn).toBe(false);
  });

  it('computes outward delivery rent within 3-month term with zero extra months', async () => {
    const session = await mongoose.startSession();
    try {
      const result = await computeExpectedDeliveryRent({
        grn: {
          id: 'grn-mock-1',
          date: new Date('2026-01-05'),
          rentType: 'Seasonal_3M',
          commodityId,
          smallBagPrice: 30,
          bigBagPrice: 35,
        },
        withdrawal: { smallBags: 50, bigBags: 0 },
        deliveryDate: new Date('2026-03-20'), // ~2.5 months elapsed -> cycles <= 3
        session,
      });

      // 50 bags * ₹30 seasonal rate, 0 extra months
      expect(result.expectedRentCharge).toBe(1500);
    } finally {
      await session.endSession();
    }
  });

  it('computes outward delivery rent beyond 3-month term adding monthly rent for (N - 3) cycles', async () => {
    const session = await mongoose.startSession();
    try {
      const result = await computeExpectedDeliveryRent({
        grn: {
          id: 'grn-mock-2',
          date: new Date('2026-01-05'),
          rentType: 'Seasonal_3M',
          commodityId,
          smallBagPrice: 30,
          bigBagPrice: 35,
        },
        withdrawal: { smallBags: 50, bigBags: 0 },
        deliveryDate: new Date('2026-05-10'), // Jan 5 -> May 10 = 5 elapsed cycles (extra = 5 - 3 = 2 months)
        session,
      });

      // Base 3M season: 50 bags * ₹30 = ₹1500
      // 2 extra months: 50 bags * (2 months * ₹10 monthly rate) = ₹1000
      // Total: ₹1500 + ₹1000 = ₹2500
      expect(result.expectedRentCharge).toBe(2500);
    } finally {
      await session.endSession();
    }
  });
});
