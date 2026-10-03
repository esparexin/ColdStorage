import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { inventoryService } from '../modules/inventory/inventory.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

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

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await resetStockCollections();
    await seedFacility({ id: facilityId, name: 'Main Facility' });
    await seedFacility({ id: otherFacilityId, name: 'Other Facility' });
    const customerId = await seedCustomer({ facilityId, name: 'Kisan Traders' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-1',
      bags: 80,
      commodityName: 'Onions',
    });
    // Put-away is whole-lot, so one call makes the full 80 bags deliverable.
    await inventoryService.createPutAway(facilityId, grnId, {}, 'usr-del-op');
  });

  it('allows OPERATOR to issue outward delivery challan for a single bag count', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        bags: 30,
        vehicleNumber: 'MH12AB1234',
        driverName: 'Ramu',
        remarks: 'First partial delivery',
      });

    expect(res.status).toBe(201);
    expect(res.body.delivery.challanNumber).toMatch(/^CHL-\d{2}-\d{2}-\d{4}$/);
    expect(res.body.delivery.bags).toBe(30);
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
      .send({ grnId, bags: 20 });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("lacks permission 'delivery:create'");
  });

  it('enforces facility-scoped isolation on delivery creation', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({ grnId, bags: 20 });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized to access facility');
  });

  it('enforces child-ID protection when grnId belongs to another facility', async () => {
    const res = await request(app)
      .post(`/api/facilities/${otherFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({ grnId, bags: 10 });

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
      .send({ grnId, bags: 81 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('exceeds remaining delivery balance');
  });

  it('blocks delivery with 402 when rent is unpaid', async () => {
    const customerId = await seedCustomer({ facilityId, name: 'Unpaid Traders' });
    const unpaidGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-2',
      bags: 40,
      rentAmount: 5000,
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId: unpaidGrnId, bags: 5 });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('RENT_PAYMENT_REQUIRED');
    expect(res.body.rent.remainingBalance).toBe(5000);
  });

  it('allows SUPER_ADMIN to perform full delivery reversal', async () => {
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, bags: 25 });
    const deliveryId = delRes.body.delivery.id;

    const revRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries/${deliveryId}/reverse`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Customer rejected quality after dispatch' });

    expect(revRes.status).toBe(200);
    expect(revRes.body.reversal.deliveryId).toBe(deliveryId);
    expect(revRes.body.challan.status).toBe('REVERSED');
    expect(revRes.body.summary.netDeliveredBags).toBe(0);
    expect(revRes.body.summary.remainingDeliveryBalance).toBe(80);
    expect(revRes.body.summary.physicallyStoredBags).toBe(80);
  });

  it('rejects OPERATOR from performing delivery reversal (403 Forbidden)', async () => {
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, bags: 20 });
    const deliveryId = delRes.body.delivery.id;

    const revRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries/${deliveryId}/reverse`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reason: 'Operator attempt to reverse' });

    expect(revRes.status).toBe(403);
    expect(revRes.body.error).toContain("lacks permission 'delivery:reversal'");
  });

  it('allows querying delivery list, single delivery, and GRN delivery history', async () => {
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, bags: 15 });
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
});
