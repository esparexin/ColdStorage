import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { useHistoricalTestingDates } from './helpers/historical-dates-env.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-merge-rent-xs';

/**
 * Cross-season merge rent accrual. Every fixture here is anchored to a fixed past season,
 * so the suite runs under the hermetic historical-dates allowance rather than inheriting it
 * from a developer's `.env.local` — production guardrails reject these dates outright.
 */
describe('Merge GRN: multi-year cross-season rent accrual', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  useHistoricalTestingDates();

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-xs',
      username: 'merge.xs',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedControllerRates('cmd-wheat-xs');
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'MXG', name: 'Merge Cross-Season Facility' });
    customerId = await seedCustomer({ id: 'cust-mrg-xs', facilityId, name: 'Farmer Ramesh' });
    const cmd = await CommodityModel.create({ id: 'cmd-wheat-xs', name: 'Wheat', normalizedName: 'wheat', isActive: true });
    commodityId = cmd.id;
  });

  it('calculates multi-year seasonal cycles and carries forward dynamic accrued rent when historical lot is merged', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId,
      commodityName: 'Wheat', chamber: 'CH-01', bags: 600, bagType: 'S+B', smallBags: 300,
      bigBags: 300, rentType: 'Seasonal', rentAmount: 60000, grnNumber: 'GRN-26-27-0200',
      date: new Date('2026-04-01'),
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Ramesh', commodityId,
      commodityName: 'Wheat', chamber: 'CH-01', bags: 300, bagType: 'S+B', smallBags: 150,
      bigBags: 150, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-23-24-0050',
      date: new Date('2023-04-01'),
    });
    await GrnModel.updateOne({ id: sourceGrnId }, { $set: { bagPrice: 10 } });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date('2026-05-15'),
        remarks: 'Merge 2023 lot into 2026 lot with elapsed seasonal cycles',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Under independent billing, target GRN retains strictly its own obligation (60,000)
    // Source elapsed multi-year rent charge is maintained on the source GRN account
    expect(res.body.targetGrn.rentAmount).toBe(60000);
    const updatedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(updatedSource?.rentAmount).toBeGreaterThan(3000);
  });
});