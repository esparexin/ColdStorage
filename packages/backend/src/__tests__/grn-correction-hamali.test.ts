import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { resolveEffectiveHamaliRate } from '../modules/common/hamali-resolution.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-hamali-correct';

describe('GRN Correction Hamali Applicability (Phase 2: Finding 1)', () => {
  let adminToken: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-hml-admin',
      username: 'hml.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedFacility({ id: facilityId, code: 'HML1', name: 'Hamali Facility 1' });
    customerId = await seedCustomer({ id: 'cust-hml-1', facilityId, name: 'Farmer Ramesh' });
  });

  it.each([
    { desc: 'true + positive rate -> applies', applicable: true, rate: 5, expected: 5 },
    { desc: 'false + positive rate -> does not apply', applicable: false, rate: 5, expected: 0 },
    { desc: 'undefined + positive rate -> applies via legacy fallback', applicable: undefined, rate: 5, expected: 5 },
    { desc: 'null + positive rate -> applies via legacy fallback', applicable: null, rate: 5, expected: 5 },
    { desc: 'undefined + zero rate -> does not apply', applicable: undefined, rate: 0, expected: 0 },
    { desc: 'undefined + null rate -> does not apply', applicable: undefined, rate: null, expected: 0 },
  ])('$desc', ({ applicable, rate, expected }) => {
    const resolved = resolveEffectiveHamaliRate(null, {
      isHamaliApplicable: applicable,
      hamaliRate: rate,
    });
    expect(resolved).toBe(expected);
  });

  it('creation and correction yield identical Hamali applicability for false + positive rate', async () => {
    const cmd = await CommodityModel.create({
      id: 'cmd-no-hamali', name: 'No Hamali Crop', normalizedName: 'no hamali crop',
      isHamaliApplicable: false, hamaliRate: 8, isActive: true,
    });
    await seedControllerRates(cmd.id);

    const createRes = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnNumber: '1001', date: new Date(), customerId, commodityId: cmd.id,
        chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.grn.hamaliRate).toBe(0);
    expect(createRes.body.grn.hamaliAmount).toBe(0);

    const correctRes = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${createRes.body.grn.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bags: 120, reason: 'Correcting lot bag count' });
    expect(correctRes.status).toBe(200);
    expect(correctRes.body.grn.hamaliRate).toBe(0);
    expect(correctRes.body.grn.hamaliAmount).toBe(0);
  });

  it('preserves existing snapshot rate on bag edit when commodity is unchanged', async () => {
    const cmd = await CommodityModel.create({
      id: 'cmd-snap-hamali', name: 'Snap Crop', normalizedName: 'snap crop',
      isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
    await seedControllerRates(cmd.id);

    const createRes = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnNumber: '1002', date: new Date(), customerId, commodityId: cmd.id,
        chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.grn.hamaliRate).toBe(4);
    expect(createRes.body.grn.hamaliAmount).toBe(400);

    await CommodityModel.updateOne({ id: cmd.id }, { $set: { hamaliRate: 10 } });

    const correctRes = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${createRes.body.grn.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bags: 150, reason: 'Adjusting bag count' });
    expect(correctRes.status).toBe(200);
    expect(correctRes.body.grn.hamaliRate).toBe(4);
    expect(correctRes.body.grn.hamaliAmount).toBe(600);
  });

  it('recalculates Hamali from new commodity config when commodity changes', async () => {
    const cmdA = await CommodityModel.create({
      id: 'cmd-crop-a', name: 'Crop A', normalizedName: 'crop a',
      isHamaliApplicable: true, hamaliRate: 3, isActive: true,
    });
    const cmdB = await CommodityModel.create({
      id: 'cmd-crop-b', name: 'Crop B', normalizedName: 'crop b',
      isHamaliApplicable: true, hamaliRate: 6, isActive: true,
    });
    await seedControllerRates(cmdA.id);
    await seedControllerRates(cmdB.id);

    const createRes = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnNumber: '1003', date: new Date(), customerId, commodityId: cmdA.id,
        chamber: 'CH-01', bags: 100, bagType: 'S', bagPrice: 10, rentType: 'Seasonal',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.grn.hamaliRate).toBe(3);
    expect(createRes.body.grn.hamaliAmount).toBe(300);

    const correctRes = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${createRes.body.grn.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ commodityId: cmdB.id, bagPrice: 10, reason: 'Mistyped commodity on intake' });
    expect(correctRes.status).toBe(200);
    expect(correctRes.body.grn.hamaliRate).toBe(6);
    expect(correctRes.body.grn.hamaliAmount).toBe(600);
  });
});
