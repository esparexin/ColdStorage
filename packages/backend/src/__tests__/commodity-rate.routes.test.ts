import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';

const app = createApp();

/**
 * Price Controller routes: managed rates are restricted to commodity managers;
 * lookups are readable by every authenticated role. History is never repriced.
 */
describe('Commodity rate routes — commodity-rate.routes.test.ts', () => {
  const seedUser = createAuthSeeder(config.jwtSecret);

  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;

  beforeAll(async () => {
    await connectToDatabase();
    [
      { token: adminToken },
      { token: operatorToken },
      { token: readOnlyToken },
    ] = await Promise.all([
      seedUser({ userId: 'usr-cr-admin', username: 'p2.cr.admin', role: 'ADMIN', facilityIds: [] }),
      seedUser({ userId: 'usr-cr-op', username: 'p2.cr.operator', role: 'OPERATOR', facilityIds: [] }),
      seedUser({ userId: 'usr-cr-ro', username: 'p2.cr.readonly', role: 'READ_ONLY', facilityIds: [] }),
    ]);
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await CommodityModel.create({
      id: 'cmd-route-1',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti',
      isActive: true,
    });
  });

  it('lets managers upsert rates and everyone read them', async () => {
    const putRes = await request(app)
      .put('/api/commodities/cmd-route-1/rates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rentType: 'Seasonal', smallRate: 12, bigRate: 18 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.rate).toMatchObject({ smallRate: 12, bigRate: 18 });

    const getRes = await request(app)
      .get('/api/commodities/cmd-route-1/rates?rentType=Seasonal')
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.rate).toMatchObject({ smallRate: 12, bigRate: 18 });

    const listRes = await request(app)
      .get('/api/commodities/cmd-route-1/rates')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
  });

  it('rejects manager writes from operators and invalid payloads', async () => {
    const forbidden = await request(app)
      .put('/api/commodities/cmd-route-1/rates')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ rentType: 'Seasonal', smallRate: 12, bigRate: 18 });
    expect(forbidden.status).toBe(403);

    const invalid = await request(app)
      .put('/api/commodities/cmd-route-1/rates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rentType: 'Seasonal', smallRate: 0, bigRate: 18 });
    expect(invalid.status).toBe(400);
  });

  it('returns 404 for unconfigured pairs and unknown rent types', async () => {
    const missing = await request(app)
      .get('/api/commodities/cmd-route-1/rates?rentType=Monthly')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);

    const badType = await request(app)
      .get('/api/commodities/cmd-route-1/rates?rentType=Yearly')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(badType.status).toBe(400);
  });
});
