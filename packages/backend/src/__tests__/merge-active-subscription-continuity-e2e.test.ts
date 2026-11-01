import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-merge-continuity-e2e';
const USER_ID = 'usr-merge-e2e-admin';

describe('Merge into Existing GRN - Active Subscription Continuity E2E', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: USER_ID,
      username: 'continuity.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await seedFacility({ id: facilityId, code: 'MCE', name: 'Merge Continuity Facility' });
    customerId = await seedCustomer({ id: 'cust-kalyan', facilityId, name: 'Kalyan' });

    const commodity = await CommodityModel.create({
      id: 'cmd-mirchi',
      name: 'Mirchi',
      normalizedName: 'mirchi',
      isActive: true,
      isHamaliApplicable: true,
      hamaliRate: 25,
    });
    commodityId = commodity.id;

    await CommodityRateModel.create([
      { id: 'crt-mirchi-s', commodityId, rentType: 'Seasonal', smallRate: 125, bigRate: 205, isActive: true },
      { id: 'crt-mirchi-m', commodityId, rentType: 'Monthly', smallRate: 15, bigRate: 25, isActive: true },
    ]);
  });

  it('preserves active Season 2026 subscription, charges 0 storage rent at merge, and covers repacked bags into outward delivery', async () => {
    // 1. Target GRN #0004: Inward Season 2026, 8 bags, ₹1,000 active storage rent, ₹200 Hamali
    const targetGrnId = await seedGrn({
      facilityId,
      customerId,
      customerName: 'Kalyan',
      commodityId,
      commodityName: 'Mirchi',
      chamber: 'A-01,09',
      bags: 8,
      bagType: 'S+B',
      smallBags: 4,
      bigBags: 4,
      rentType: 'Seasonal',
      rentAmount: 1000,
      date: new Date('2026-03-15T00:00:00Z'),
      grnNumber: 'GRN-0004',
    });

    // 2. Source GRNs: 30 bags total (GRN #0002, GRN #0003, GRN #0001)
    const sourceGrn1 = await seedGrn({
      facilityId, customerId, customerName: 'Kalyan', commodityId, commodityName: 'Mirchi',
      chamber: 'A-01,09', bags: 8, bagType: 'S+B', smallBags: 8, bigBags: 0,
      rentType: 'Seasonal', rentAmount: 800, date: new Date('2024-03-10T00:00:00Z'), grnNumber: 'GRN-0002',
    });
    const sourceGrn2 = await seedGrn({
      facilityId, customerId, customerName: 'Kalyan', commodityId, commodityName: 'Mirchi',
      chamber: 'A-01,09', bags: 10, bagType: 'S+B', smallBags: 2, bigBags: 8,
      rentType: 'Seasonal', rentAmount: 1200, date: new Date('2024-03-10T00:00:00Z'), grnNumber: 'GRN-0003',
    });
    const sourceGrn3 = await seedGrn({
      facilityId, customerId, customerName: 'Kalyan', commodityId, commodityName: 'Mirchi',
      chamber: 'A-01,09', bags: 12, bagType: 'S+B', smallBags: 10, bigBags: 2,
      rentType: 'Seasonal', rentAmount: 1500, date: new Date('2024-03-10T00:00:00Z'), grnNumber: 'GRN-0001',
    });

    // Verify initial rent summary for Target GRN #0004 before merge
    const targetSummaryBefore = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(targetSummaryBefore.rentAmount).toBe(1000);
    expect(targetSummaryBefore.remainingBags).toBe(8);

    // 3. Execute Merge into Target GRN #0004 with 30 repacked bags on 2026-10-31
    const moveDate = new Date('2026-10-31T00:00:00Z');
    const mergeRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrn1, sourceGrn2, sourceGrn3],
        destinationChamber: 'A-01,09',
        movementDate: moveDate,
        isRepackSelected: true,
        repackedSmallBags: 20,
        repackedBigBags: 10,
        remarks: 'Stock consolidation / Re-bagging lot',
      });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.success).toBe(true);

    // Verification 1 & 2: Season 2026 subscription remains active, rentAmount ₹1,000 preserved, ₹0 storage rent collected
    const updatedTarget = await GrnModel.findOne({ id: targetGrnId, facilityId }).lean().exec();
    expect(updatedTarget).not.toBeNull();
    expect(updatedTarget?.status).toBe('OPEN');
    expect(updatedTarget?.rentAmount).toBe(1000); // Storage rent preserved as-is
    expect(updatedTarget?.date.toISOString()).toBe(new Date('2026-03-15T00:00:00Z').toISOString()); // Original inward date preserved
    expect(updatedTarget?.mergedAt).not.toBeNull(); // Audit timestamp recorded
    expect(updatedTarget?.bags).toBe(38); // 8 initial + 30 moved = 38 total
    expect(updatedTarget?.smallBags).toBe(24); // 4 + 20
    expect(updatedTarget?.bigBags).toBe(14); // 4 + 10

    // Verification 3: Only applicable Hamali is collected for repacking (30 bags @ ₹25/bag = ₹750)
    expect(mergeRes.body.movement.hamaliCharge).toBe(750);
    expect(mergeRes.body.movement.hamaliBags).toBe(30);
    expect(mergeRes.body.movement.hamaliRate).toBe(25);

    // Verification 4: All source GRNs are closed
    const sources = await GrnModel.find({ id: { $in: [sourceGrn1, sourceGrn2, sourceGrn3] } }).lean().exec();
    expect(sources.every((s) => s.status === 'CLOSED')).toBe(true);
    expect(sources.every((s) => s.mergedIntoGrnId === targetGrnId)).toBe(true);

    // Post-merge rent summary for Target GRN #0004
    const targetSummaryAfter = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(targetSummaryAfter.rentAmount).toBe(1000);
    expect(targetSummaryAfter.remainingBags).toBe(38);

    // 5. Subsequent Outward Delivery: Deliver 10 repacked bags (6 small, 4 big) on 2026-11-01
    const { delivery } = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: targetGrnId,
        smallBags: 6,
        bigBags: 4,
        bagCategory: 'Small & Big',
        date: new Date('2026-11-01T00:00:00Z'),
        remarks: 'Partial delivery of consolidated stock',
      },
      USER_ID,
    );

    expect(delivery).not.toBeNull();
    expect(delivery.smallBags + delivery.bigBags).toBe(10);

    // Verification 5 & 6: Outward delivery calculates rent under Season 2026 terms, closing bags = 28, no duplicate bills
    const postDeliverySummary = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(postDeliverySummary.remainingBags).toBe(28);
    expect(postDeliverySummary.deliveredBags).toBe(10);
    // Base rent is preserved, delivery rent charge is integrated canonically
    expect(postDeliverySummary.rentAmount).toBe(1000);
  });
});
