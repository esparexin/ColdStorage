import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { GroupModel } from '../database/models/group.model.js';
import { UserModel } from '../database/models/user.model.js';
import { clearRateLimiterStore } from '../middleware/rate-limiter.middleware.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

describe('Group Secured API & RBAC Routes Integration', () => {
  const app = createApp();
  const FACILITY_A = 'fac-grp-route-a';
  const FACILITY_B = 'fac-grp-route-b';
  const seed = createAuthSeeder(config.jwtSecret);

  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;

  beforeAll(async () => {
    clearRateLimiterStore();
    await connectToDatabase();
    await seedFacility({ id: FACILITY_A, name: 'Route Facility A' });
    await seedFacility({ id: FACILITY_B, name: 'Route Facility B' });

    ({ token: adminToken } = await seed({
      userId: 'usr-grp-admin',
      username: 'grp_admin',
      role: 'SUPER_ADMIN',
      facilityIds: [FACILITY_A, FACILITY_B],
    }));

    ({ token: operatorToken } = await seed({
      userId: 'usr-grp-operator',
      username: 'grp_operator',
      role: 'OPERATOR',
      facilityIds: [FACILITY_A],
    }));

    ({ token: readOnlyToken } = await seed({
      userId: 'usr-grp-readonly',
      username: 'grp_readonly',
      role: 'READ_ONLY',
      facilityIds: [FACILITY_A],
    }));
  }, 30000);

  afterAll(async () => {
    await GroupModel.deleteMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } });
    await GrnModel.deleteMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } });
    await FacilityModel.deleteMany({ id: { $in: [FACILITY_A, FACILITY_B] } });
    await UserModel.deleteMany({ id: { $in: ['usr-grp-admin', 'usr-grp-operator', 'usr-grp-readonly'] } });
    clearRateLimiterStore();
    await disconnectDatabase();
  }, 30000);

  beforeEach(async () => {
    await GroupModel.deleteMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } });
    await GrnModel.updateMany({ facilityId: { $in: [FACILITY_A, FACILITY_B] } }, { $set: { groupId: null } });
  });

  it('enforces RBAC for create, update, and delete', async () => {
    // READ_ONLY cannot create group
    const roCreate = await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ name: 'Trader RO' });
    expect(roCreate.status).toBe(403);

    // OPERATOR can create group
    const opCreate = await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: 'Trader Op' });
    expect(opCreate.status).toBe(201);
    const groupId = opCreate.body.group.id;

    // READ_ONLY can view group
    const roGet = await request(app)
      .get(`/api/facilities/${FACILITY_A}/groups`)
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(roGet.status).toBe(200);
    expect(roGet.body.items).toHaveLength(1);

    // OPERATOR cannot delete group (group:delete is SUPER_ADMIN & ADMIN only)
    const opDelete = await request(app)
      .delete(`/api/facilities/${FACILITY_A}/groups/${groupId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(opDelete.status).toBe(403);

    // ADMIN can delete empty group
    const adminDelete = await request(app)
      .delete(`/api/facilities/${FACILITY_A}/groups/${groupId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDelete.status).toBe(200);
    expect(adminDelete.body.deleted).toBe(true);
  });

  it('enforces facility isolation', async () => {
    // Operator has access only to FACILITY_A, not FACILITY_B
    const res = await request(app)
      .get(`/api/facilities/${FACILITY_B}/groups`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(403);
  });

  it('handles duplicate group name with 409 Conflict', async () => {
    await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate Name' });

    const dupRes = await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'duplicate name' });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error).toMatch(/already exists/i);
  });

  it('handles member assignment, moving, and safe deletion guards over HTTP', async () => {
    const grn1 = await seedGrn({ facilityId: FACILITY_A, bags: 40, grnNumber: '5001' });

    const createRes = await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: 'Protected Group' });
    const groupId = createRes.body.group.id;

    // Assign GRN
    const assignRes = await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups/${groupId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnIds: [grn1] });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.assignedCount).toBe(1);

    // Cannot delete group with member GRN (Safe deletion guard)
    const deleteAttempt = await request(app)
      .delete(`/api/facilities/${FACILITY_A}/groups/${groupId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteAttempt.status).toBe(409);
    expect(deleteAttempt.body.error).toMatch(/cannot delete group.*assigned grn/i);

    // Create target group and move GRN
    const targetRes = await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Target Group' });
    const targetGroupId = targetRes.body.group.id;

    const moveRes = await request(app)
      .post(`/api/facilities/${FACILITY_A}/groups/${groupId}/move`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ targetGroupId, grnIds: [grn1] });
    expect(moveRes.status).toBe(200);

    // Original group is now empty, can be deleted
    const deleteSuccess = await request(app)
      .delete(`/api/facilities/${FACILITY_A}/groups/${groupId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteSuccess.status).toBe(200);
  });
});
