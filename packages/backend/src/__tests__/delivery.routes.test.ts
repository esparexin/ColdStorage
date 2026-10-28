import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seed = createAuthSeeder(config.jwtSecret);

const facilityId = 'fac-del-routes-1';
const otherFacilityId = 'fac-del-routes-2';

describe('P6 Delivery Routes & RBAC Integration Tests', () => {
  let superAdminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let otherFacilityOperatorToken: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: superAdminToken } = await seed({
      userId: 'usr-del-admin',
      username: 'superadmin_main',
      role: 'SUPER_ADMIN',
      facilityIds: [],
    }));
    ({ token: operatorToken } = await seed({
      userId: 'usr-del-op',
      username: 'operator_del',
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));
    ({ token: readOnlyToken } = await seed({
      userId: 'usr-del-ro',
      username: 'readonly_del',
      role: 'READ_ONLY',
      facilityIds: [facilityId],
    }));
    ({ token: otherFacilityOperatorToken } = await seed({
      userId: 'usr-del-op-other',
      username: 'operator_other_del',
      role: 'OPERATOR',
      facilityIds: [otherFacilityId],
    }));
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityModel.findOneAndUpdate({ id: 'cmd-del-routes' }, { $set: { name: 'Test Commodity', normalizedName: 'test commodity', isActive: true } }, { upsert: true, new: true }).exec();
    await CommodityRateModel.deleteMany({ commodityId: 'cmd-del-routes' }).exec();
    await CommodityRateModel.create([{ id: 'crt-cmddelroutes-s', commodityId: 'cmd-del-routes', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmddelroutes-m', commodityId: 'cmd-del-routes', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
    await seedFacility({ id: facilityId, name: 'Main Facility' });
    await seedFacility({ id: otherFacilityId, name: 'Other Facility' });
    const customerId = await seedCustomer({ facilityId, name: 'Kisan Traders' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-del-routes',
      chamber: 'CH-1',
      bags: 80,
      commodityName: 'Onions',
    });
  });

  it('allows OPERATOR to issue outward delivery challan for a single bag count', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        smallBags: 30,
        bigBags: 0,
        vehicleNumber: 'MH12AB1234',
        driverName: 'Ramu',
        remarks: 'First partial delivery',
      });

    expect(res.status).toBe(201);
    expect(res.body.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-\d{4}$/);
    expect(res.body.delivery.smallBags).toBe(30);
    expect(res.body.delivery.bigBags).toBe(0);
    expect(res.body.delivery.totalBags).toBe(30);
    expect(res.body.delivery.chamber).toBe('CH-1');
    expect(res.body.delivery.status).toBe('ISSUED');
    expect(res.body.summary.netDeliveredBags).toBe(30);
    expect(res.body.summary.remainingDeliveryBalance).toBe(50);
    expect(res.body.summary.physicallyStoredBags).toBe(50);
    expect(res.body.summary.grnStatus).toBe('OPEN');
  });

  it('rejects READ_ONLY user from creating delivery (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ grnId, smallBags: 20, bigBags: 0 });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("lacks permission 'delivery:create'");
  });

  it('enforces facility-scoped isolation on delivery creation', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({ grnId, smallBags: 20, bigBags: 0 });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces child-ID protection when grnId belongs to another facility', async () => {
    const res = await request(app)
      .post(`/api/facilities/${otherFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({ grnId, smallBags: 10, bigBags: 0 });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found in facility');
  });

  it('rejects a legacy position-item delivery payload (400 Bad Request)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, items: [{ positionId: 'pos-del-routes-1', bags: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects over-delivery beyond the remaining balance (400 Bad Request)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, smallBags: 81, bigBags: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('exceeds the available balance of 80 small and 0 big bags');
  });

  it('allows delivery when rent is unpaid and returns 201', async () => {
    const customerId = await seedCustomer({ facilityId, name: 'Unpaid Traders' });
    const unpaidGrnId = await seedGrn({
      facilityId,
      customerId,
      commodityId: 'cmd-del-routes',
      chamber: 'CH-2',
      bags: 40,
      rentAmount: 5000,
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId: unpaidGrnId, smallBags: 5, bigBags: 0 });

    expect(res.status).toBe(201);
    expect(res.body.delivery.totalBags).toBe(5);
    expect(res.body.summary.remainingDeliveryBalance).toBe(35);
  });

  it('confirms delivery reversal endpoint is permanently decommissioned (404 Not Found)', async () => {
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, smallBags: 20, bigBags: 0 });
    const deliveryId = delRes.body.delivery.id;

    const revRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries/${deliveryId}/reverse`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Attempt to call decommissioned reversal endpoint' });

    expect(revRes.status).toBe(404);
  });

  it('allows querying delivery list, single delivery, and GRN delivery history', async () => {
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, smallBags: 15, bigBags: 0 });
    const deliveryId = delRes.body.delivery.id;

    const listRes = await request(app)
      .get(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.total).toBe(1);

    const singleRes = await request(app)
      .get(`/api/facilities/${facilityId}/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.delivery.id).toBe(deliveryId);
    expect(singleRes.body.delivery.chamber).toBe('CH-1');

    const grnDelRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grnId}/deliveries`)
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(grnDelRes.status).toBe(200);
    expect(grnDelRes.body.deliveries).toHaveLength(1);
  });

  it('previews next sequential Gate Pass number for facility', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/deliveries/next-gp-number`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.nextGpNumber).toMatch(/^GP-\d{4}$/);
  });
});
