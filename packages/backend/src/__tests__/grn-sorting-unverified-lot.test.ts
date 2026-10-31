import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { GrnModel } from '../database/models/grn.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-sorting-unverified';

describe('GRN Sorting - Unverified Lot Manual Confirmation', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-sort-unverified',
      username: 'sort.unverified',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'SVF', name: 'Sorting Unverified Facility' });
    customerId = await seedCustomer({ id: 'cust-svf-1', facilityId, name: 'Farmer Ravi' });
    const cmd = await CommodityModel.create({
      id: 'cmd-svf-potato',
      name: 'Potato',
      normalizedName: 'potato',
      isActive: true,
      isHamaliApplicable: true,
      hamaliRate: 4,
    });
    commodityId = cmd.id;
  });

  const createUnverifiedGrn = async (grnNumber: string) => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      customerName: 'Farmer Ravi',
      commodityId,
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S/B',
      rentType: 'Seasonal',
      rentAmount: 5000,
      grnNumber,
    });
    // Explicitly unverified inward lot
    await GrnModel.updateOne({ id: grnId }, { $set: { isCompositionVerified: false } });
    return grnId;
  };

  it('rejects confirmation when small and big bags sum does not match total', async () => {
    const grnId = await createUnverifiedGrn('GRN-26-27-0201');

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 100,
        confirmedSmallBags: 60,
        confirmedBigBags: 30, // 90 !== 100
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Validation failed');
  });

  it('allows unverified lot to confirm composition with explicit split in Step 1', async () => {
    const grnId = await createUnverifiedGrn('GRN-26-27-0202');

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 100,
        confirmedSmallBags: 65,
        confirmedBigBags: 35,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isSortingComplete).toBe(true);

    const updated = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(updated?.bagType).toBe('S/B');
    expect(updated?.smallBags).toBe(65);
    expect(updated?.bigBags).toBe(35);
    expect(updated?.isCompositionVerified).toBe(true);
    expect(updated?.isSorted).toBe(true);
  });
});
