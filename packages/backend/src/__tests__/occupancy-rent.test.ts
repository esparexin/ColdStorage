import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { calculateGrnMonthlyOccupancyRent } from '../modules/common/occupancy-rent.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const userId = 'usr-operator-1';

describe('Monthly Storage Rent Occupancy Calculation Tests', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Rent Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Farmer Cooperative' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-04',
      bags: 100,
      commodityName: 'Apples',
      rentType: 'Monthly',
      rentMonths: 3,
      rentAmount: 3000, // ₹10/bag/month
      grnNumber: 'GRN-26-27-0101',
      date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    });
  });

  it('calculates initial single-period charge when no outward deliveries have occurred', async () => {
    const summary = await rentService.getMonthlyOccupancyRent(facilityId, grnId);
    expect(summary).not.toBeNull();
    expect(summary!.totalInwardBags).toBe(100);
    expect(summary!.currentRemainingBags).toBe(100);
    expect(summary!.bagRate).toBe(10);
    expect(summary!.periods.length).toBeGreaterThanOrEqual(1);

    const firstPeriod = summary!.periods[0];
    expect(firstPeriod.openingBags).toBe(100);
    expect(firstPeriod.deliveredBags).toBe(0);
    expect(firstPeriod.remainingBags).toBe(100);
    expect(firstPeriod.occupancyBags).toBe(100);
    expect(firstPeriod.calculatedCharge).toBe(1000);
  });

  it('adjusts subsequent billing period occupancy following partial outward delivery', async () => {
    // Record partial payment of ₹500 (satisfies rent gate without forcing full settlement)
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 500, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );

    const now = Date.now();
    const deliveryDate = new Date(now - 5 * 24 * 60 * 60 * 1000);

    const del = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: deliveryDate,
        bags: 40,
        remarks: 'Partial delivery of 40 bags',
      },
      userId,
    );
    expect(del.summary.remainingDeliveryBalance).toBe(60);

    const summary = await calculateGrnMonthlyOccupancyRent(facilityId, grnId);
    expect(summary).not.toBeNull();
    expect(summary!.totalInwardBags).toBe(100);
    expect(summary!.currentRemainingBags).toBe(60);
    expect(summary!.periods.length).toBeGreaterThanOrEqual(1);

    const p1 = summary!.periods[0];
    expect(p1.openingBags).toBe(100);
    expect(p1.deliveredBags).toBe(40);
    expect(p1.remainingBags).toBe(60);
    expect(p1.calculatedCharge).toBe(1000);
  });

  it('stops charging subsequent monthly storage once GRN reaches zero bags', async () => {
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3000, paymentMode: 'UPI', paymentDate: new Date() },
      userId,
    );

    const now = Date.now();
    const d1Date = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const d2Date = new Date(now - 2 * 24 * 60 * 60 * 1000);

    await deliveryService.createDelivery(facilityId, { grnId, date: d1Date, bags: 40 }, userId);
    await deliveryService.createDelivery(facilityId, { grnId, date: d2Date, bags: 60 }, userId);

    const summary = await rentService.getMonthlyOccupancyRent(facilityId, grnId);
    expect(summary).not.toBeNull();
    expect(summary!.currentRemainingBags).toBe(0);
    // Period has 0 remaining bags, so no empty future cycles are billed
    const lastPeriod = summary!.periods[summary!.periods.length - 1];
    expect(lastPeriod.remainingBags).toBe(0);
  });

  it('calculates seasonal storage occupancy reusing canonical movement history', async () => {
    const seasonalGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-05',
      bags: 200,
      commodityName: 'Potatoes',
      rentType: 'Seasonal',
      rentAmount: 20000,
      grnNumber: 'GRN-26-27-0202',
      date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
    });

    await rentService.recordPayment(
      facilityId,
      { grnId: seasonalGrnId, amountPaid: 5000, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );
    await deliveryService.createDelivery(
      facilityId,
      {
        grnId: seasonalGrnId,
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        bags: 50,
      },
      userId,
    );

    const seasonalSummary = await rentService.getSeasonalOccupancyRent(facilityId, seasonalGrnId);
    expect(seasonalSummary).not.toBeNull();
    expect(seasonalSummary!.totalInwardBags).toBe(200);
    expect(seasonalSummary!.netDeliveredBags).toBe(50);
    expect(seasonalSummary!.remainingBags).toBe(150);
    expect(seasonalSummary!.status).toBe('OPEN');
    expect(seasonalSummary!.finalOutwardDate).toBeNull();
    expect(seasonalSummary!.calculatedCharge).toBe(20000);
  });
});
