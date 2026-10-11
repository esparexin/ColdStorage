import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { grnService } from '../modules/grn/grn.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { rentExtensionService } from '../modules/rent/rent-extension.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-historical-testing';

describe('Temporary 3-Year Historical Date Testing Allowance', () => {
  let facilityId: string;
  let customerId: string;
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    await connectToTestDatabase();
  }, 30000);

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetStockCollections();
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    facilityId = await seedFacility({ name: 'Historical Date Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Historical Produce Co' });
    await CommodityModel.create({
      id: 'cmd-potatoes',
      name: 'Potatoes',
      normalizedName: 'potatoes',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  afterEach(() => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
  });

  const makeGrn = (grnNumber: string, date: Date, extra: Record<string, unknown> = {}) => ({
    facilityId,
    customerId,
    commodityId: 'cmd-potatoes',
    chamber: 'CH-01',
    grnNumber,
    bags: 100,
    bagType: 'S/B' as const,
    smallBags: 100,
    bigBags: 0,
    bagPrice: 10,
    rentType: 'Monthly' as const,
    date,
    ...extra,
  });

  it('1. creates historical inward in FY 24-25 with correct FY-sequenced receipt number', async () => {
    const inwardDate = new Date('2024-08-15T00:00:00.000Z');
    const result = await grnService.createGrn(
      facilityId,
      makeGrn('1001', inwardDate),
      USER_ID,
      { requireRates: false },
    );

    expect(result.grn.grnNumber).toBe('1001');
    expect(result.grn.inwardReceiptNumber).toMatch(/^RCPT-24-25-\d{4}$/);
    expect(new Date(result.grn.date).toISOString()).toBe(inwardDate.toISOString());
  });

  it('2. rejects historical inward when testing flag is disabled', async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'false';
    const inwardDate = new Date('2024-08-15T00:00:00.000Z');

    await expect(
      grnService.createGrn(
        facilityId,
        makeGrn('1002', inwardDate),
        USER_ID,
        { requireRates: false },
      ),
    ).rejects.toThrow(/belongs to Financial Year '24-25', but current active FY is/);
  });

  it('3. calculates monthly rent dynamically for same-month historical delivery', async () => {
    const inwardDate = new Date('2024-08-15T00:00:00.000Z');
    const deliveryDate = new Date('2024-08-25T00:00:00.000Z');

    const { grn } = await grnService.createGrn(
      facilityId,
      makeGrn('1003', inwardDate),
      USER_ID,
      { requireRates: false },
    );

    const del = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        date: deliveryDate,
        smallBags: 40,
        bigBags: 0,
        bagCategory: 'Small',
        gpNumber: 'GP-9001',
      },
      USER_ID,
    );

    // 40 bags × ₹10/bag × 1 cycle = ₹400
    expect(del.delivery.rentCharge).toBe(400);
    expect(del.delivery.challanNumber).toMatch(/^CHL-24-25-\d{4}$/);
  });

  it('4. calculates monthly rent spanning multiple financial years (FY 24-25 to FY 26-27)', async () => {
    // Aug 15 2024 to Oct 10 2026: exactly 26 dynamic elapsed cycles
    const inwardDate = new Date('2024-08-15T00:00:00.000Z');
    const deliveryDate = new Date('2026-10-10T00:00:00.000Z');

    const { grn } = await grnService.createGrn(
      facilityId,
      makeGrn('1004', inwardDate),
      USER_ID,
      { requireRates: false },
    );

    const del = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        date: deliveryDate,
        smallBags: 50,
        bigBags: 0,
        bagCategory: 'Small',
        gpNumber: 'GP-9002',
      },
      USER_ID,
    );

    // 50 bags × ₹10/bag × 26 cycles = ₹13,000
    expect(del.delivery.rentCharge).toBe(13000);
    expect(del.delivery.challanNumber).toMatch(/^CHL-26-27-\d{4}$/);
  });

  it('5. enforces chronological invariant: delivery date before inward date is rejected', async () => {
    const inwardDate = new Date('2024-08-15T00:00:00.000Z');
    const earlierDelivery = new Date('2024-08-01T00:00:00.000Z');

    const { grn } = await grnService.createGrn(
      facilityId,
      makeGrn('1005', inwardDate),
      USER_ID,
      { requireRates: false },
    );

    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId: grn.id,
          date: earlierDelivery,
          smallBags: 20,
          bigBags: 0,
          bagCategory: 'Small',
          gpNumber: 'GP-9003',
        },
        USER_ID,
      ),
    ).rejects.toThrow('Delivery date cannot be earlier than Inward date');
  });

  it('6. preserves Seasonal rent total and supports subsequent seasonal renewals', async () => {
    const inwardDate = new Date('2024-04-10T00:00:00.000Z'); // Season 2024
    const { grn } = await grnService.createGrn(
      facilityId,
      makeGrn('1006', inwardDate, {
        bagPrice: 12,
        rentType: 'Seasonal',
        rentAmount: 1200,
      }),
      USER_ID,
      { requireRates: false },
    );

    // Initial season rent is ₹1,200 (whole-season total)
    expect(grn.rentAmount).toBe(1200);

    // Finalize Season 2025 renewal extension
    const ext = await rentExtensionService.finalizeExtension(
      facilityId,
      {
        grnId: grn.id,
        seasonYear: 2025,
        period: 'SEASON',
      },
      USER_ID,
    );
    expect(ext.period).toBe('SEASON');
    expect(ext.seasonYear).toBe(2025);

    const summary = await rentService.getRentSummary(facilityId, grn.id);
    // Season 2024 (1200) + Season 2025 renewal (100 bags × ₹12 = 1200) = 2400 total due
    expect(summary.totalDue).toBe(2400);
    expect(summary.remainingBalance).toBe(2400);
  });
});
