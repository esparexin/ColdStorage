import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const northFacilityId = 'fac-north-scope';
const southFacilityId = 'fac-south-scope';

describe('GRN Facility Scoping, RBAC & Child-ID Protection', () => {
  let superAdminToken: string;
  let adminNorthToken: string;
  let adminSouthToken: string;
  let operatorNorthToken: string;
  let readOnlyNorthToken: string;

  let customerNorthId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: superAdminToken } = await seedAuth({
      userId: 'usr-scope-sa',
      username: 'scope.superadmin',
      role: 'SUPER_ADMIN',
      facilityIds: [],
    }));
    ({ token: adminNorthToken } = await seedAuth({
      userId: 'usr-scope-an',
      username: 'scope.admin.north',
      role: 'ADMIN',
      facilityIds: [northFacilityId],
    }));
    ({ token: adminSouthToken } = await seedAuth({
      userId: 'usr-scope-as',
      username: 'scope.admin.south',
      role: 'ADMIN',
      facilityIds: [southFacilityId],
    }));
    ({ token: operatorNorthToken } = await seedAuth({
      userId: 'usr-scope-on',
      username: 'scope.op.north',
      role: 'OPERATOR',
      facilityIds: [northFacilityId],
    }));
    ({ token: readOnlyNorthToken } = await seedAuth({
      userId: 'usr-scope-ro',
      username: 'scope.ro.north',
      role: 'READ_ONLY',
      facilityIds: [northFacilityId],
    }));
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: northFacilityId, code: 'NORTHS', name: 'North Cold Facility' });
    await seedFacility({ id: southFacilityId, code: 'SOUTHS', name: 'South Cold Facility' });

    customerNorthId = await seedCustomer({
      id: 'cust-ramesh-scope',
      facilityId: northFacilityId,
      name: 'Ramesh Patel',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-scope',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti scope',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  function inbound(facilityId: string, token: string, overrides: Record<string, unknown> = {}) {
    return request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerNorthId,
        commodityId,
        chamber: 'CH-01',
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 500,
        ...overrides,
      });
  }

  it('enforces RBAC: Operator can create, Read-Only cannot', async () => {
    const opRes = await inbound(northFacilityId, operatorNorthToken);
    expect(opRes.status).toBe(201);

    const roRes = await inbound(northFacilityId, readOnlyNorthToken);

    expect(roRes.status).toBe(403);
    expect(roRes.body.error).toContain("Role 'READ_ONLY' lacks permission 'grn:create'");
  });

  it('enforces authenticated facility-scoped authorization: Admin North cannot create in South', async () => {
    const res = await inbound(southFacilityId, adminNorthToken);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces bidirectional child-ID scope-bypass protection on GET /api/grns/:grnId', async () => {
    const northRes = await inbound(northFacilityId, operatorNorthToken, { bags: 75 });
    expect(northRes.status).toBe(201);
    const northGrnId = northRes.body.grn.id;

    await CustomerModel.updateOne(
      { id: customerNorthId },
      { $push: { facilityIds: southFacilityId } },
    );

    const southRes = await inbound(southFacilityId, adminSouthToken, { bags: 90, bagType: 'B' });
    expect(southRes.status).toBe(201);
    const southGrnId = southRes.body.grn.id;

    const bypass1 = await request(app)
      .get(`/api/grns/${southGrnId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(bypass1.status).toBe(403);
    expect(bypass1.body.error).toContain('not authorized to access facility');

    const bypass2 = await request(app)
      .get(`/api/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${adminSouthToken}`);
    expect(bypass2.status).toBe(403);
    expect(bypass2.body.error).toContain('not authorized to access facility');

    const bypass3 = await request(app)
      .get(`/api/grns/${southGrnId}/acknowledgement`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(bypass3.status).toBe(403);
    expect(bypass3.body.error).toContain('not authorized to access facility');

    const saNorth = await request(app)
      .get(`/api/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(saNorth.status).toBe(200);

    const saSouth = await request(app)
      .get(`/api/grns/${southGrnId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(saSouth.status).toBe(200);
  });

  it('gates GRN correction on grn:correct and keeps it inside the caller facility scope', async () => {
    const north = await inbound(northFacilityId, adminNorthToken);
    expect(north.status).toBe(201);
    const northGrnId = north.body.grn.id;

    const operatorAttempt = await request(app)
      .patch(`/api/facilities/${northFacilityId}/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send({ bags: 40, reason: 'Mis-counted at inward' });
    expect(operatorAttempt.status).toBe(403);
    expect(operatorAttempt.body.error).toContain("lacks permission 'grn:correct'");

    const readOnlyAttempt = await request(app)
      .patch(`/api/facilities/${northFacilityId}/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${readOnlyNorthToken}`)
      .send({ bags: 40, reason: 'Mis-counted at inward' });
    expect(readOnlyAttempt.status).toBe(403);
    expect(readOnlyAttempt.body.error).toContain("lacks permission 'grn:correct'");

    // A North admin has no facility scope over the South tenancy, whatever GRN is in the URL.
    const wrongFacility = await request(app)
      .patch(`/api/facilities/${southFacilityId}/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${adminNorthToken}`)
      .send({ bags: 40, reason: 'Mis-counted at inward' });
    expect(wrongFacility.status).toBe(403);
    expect(wrongFacility.body.error).toContain('not authorized to access facility');

    // A SUPER_ADMIN holds the route facility but not this receipt, so the child ID is refused.
    const wrongChildId = await request(app)
      .patch(`/api/facilities/${southFacilityId}/grns/${northGrnId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ bags: 40, reason: 'Mis-counted at inward' });
    expect(wrongChildId.status).toBe(404);
    expect(wrongChildId.body.error).toContain('not found in facility');
  });
});
