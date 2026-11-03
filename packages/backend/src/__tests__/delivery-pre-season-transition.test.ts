import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { computeExpectedDeliveryRent } from '../modules/delivery/handlers/delivery-rent.helper.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

describe('Pre-Season Monthly to Seasonal Transition (GRN 0005 Audit)', () => {
  const commodityId = 'cmd-mirchi-0005';

  beforeAll(async () => {
    await connectToTestDatabase();
  }, 30000);

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});

    // Seed Seasonal rates (gross 125/205, hamali 25 -> net 100/180)
    await CommodityRateModel.create({
      id: 'rate-seasonal-0005',
      commodityId,
      rentType: 'Seasonal',
      smallRate: 100,
      bigRate: 180,
      isActive: true,
    });

    // Seed Monthly rates (45/65)
    await CommodityRateModel.create({
      id: 'rate-monthly-0005',
      commodityId,
      rentType: 'Monthly',
      smallRate: 45,
      bigRate: 65,
      isActive: true,
    });
  });

  it('Monthly lot inwarded in Jan and delivered in Jan stays purely Monthly (1 cycle)', async () => {
    const session = await mongoose.startSession();
    try {
      const res = await computeExpectedDeliveryRent({
        grn: {
          id: 'grn-0005-jan',
          grnNumber: '0005-JAN',
          date: new Date('2026-01-01T00:00:00Z'),
          rentType: 'Monthly',
          commodityId,
        },
        withdrawal: { smallBags: 1, bigBags: 1 },
        deliveryDate: new Date('2026-01-20T00:00:00Z'),
        session,
      });

      // 1 small * 45 + 1 big * 65 = 110 (1 cycle)
      expect(res.expectedRentCharge).toBe(110);
    } finally {
      await session.endSession();
    }
  });

  it('Monthly lot inwarded in Jan and delivered in Feb stays purely Monthly (2 cycles)', async () => {
    const session = await mongoose.startSession();
    try {
      const res = await computeExpectedDeliveryRent({
        grn: {
          id: 'grn-0005-feb',
          grnNumber: '0005-FEB',
          date: new Date('2026-01-01T00:00:00Z'),
          rentType: 'Monthly',
          commodityId,
        },
        withdrawal: { smallBags: 1, bigBags: 1 },
        deliveryDate: new Date('2026-02-20T00:00:00Z'),
        session,
      });

      // (1 small * 45 + 1 big * 65) * 2 = 220 (2 cycles)
      expect(res.expectedRentCharge).toBe(220);
    } finally {
      await session.endSession();
    }
  });

  it('GRN 0005: Monthly lot crossing into Nov 2026 transitions to Jan-Feb (2mo) + Mar-Dec Seasonal (₹500)', async () => {
    const session = await mongoose.startSession();
    try {
      const res = await computeExpectedDeliveryRent({
        grn: {
          id: 'grn-0005-nov',
          grnNumber: '0005',
          date: new Date('2026-01-01T00:00:00Z'),
          rentType: 'Monthly',
          commodityId,
        },
        withdrawal: { smallBags: 1, bigBags: 1 },
        deliveryDate: new Date('2026-11-02T00:00:00Z'),
        session,
      });

      // Jan-Feb = (1 * 45 + 1 * 65) * 2 = 220
      // Mar-Dec Season 2026 = 1 * 100 + 1 * 180 = 280
      // Expected total storage rent: 220 + 280 = 500 (NOT 11 cycles * 110 = 1,210)
      expect(res.expectedRentCharge).toBe(500);
      expect(res.effectiveRates).toEqual({ small: 100, big: 180 });
    } finally {
      await session.endSession();
    }
  });

  it('GRN 0005 Hybrid: transitions Jan inward delivery to Jan-Feb (2mo) + Mar-Dec Seasonal (₹950)', async () => {
    const session = await mongoose.startSession();
    try {
      const res = await computeExpectedDeliveryRent({
        grn: {
          id: 'grn-0005-hybrid',
          grnNumber: '0005-H',
          date: new Date('2026-01-01T00:00:00Z'),
          rentType: 'Monthly',
          commodityId,
        },
        withdrawal: { smallBags: 0, bigBags: 0 },
        bagType: 'Hybrid',
        bagCategory: 'Hybrid',
        quantity: 5,
        deliveryDate: new Date('2026-11-02T00:00:00Z'),
        session,
      });

      // Jan-Feb = 5 bags * 45 * 2 = 450
      // Mar-Dec = 5 bags * 100 = 500
      // Total = 950 (NOT 5 * 45 * 11 = 2,475)
      expect(res.expectedRentCharge).toBe(950);
      expect(res.effectiveRates).toEqual({ small: 100, big: 100 });
    } finally {
      await session.endSession();
    }
  });
});

