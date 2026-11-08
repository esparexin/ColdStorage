import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
} from './helpers/stock-reset.js';
import { resetAllFinancialCollections } from './helpers/lifecycle-testkit.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-mov-order';

describe('Internal Movement Service & Route Same-Day Execution Ordering', () => {
  let adminToken: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-order-admin',
      username: 'order.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetAllFinancialCollections();
    await seedFacility({ id: facilityId, code: 'ORD', name: 'Ordering Facility' });

    grnId = await seedGrn({
      facilityId,
      customerId: 'cust-ord',
      customerName: 'Order Farmer',
      commodityId: 'cmd-chilli',
      commodityName: 'Chilli',
      chamber: 'C-01',
      bags: 100,
      bagType: 'S/B',
      smallBags: 50,
      bigBags: 50,
      date: new Date('2026-11-01'),
      status: 'OPEN',
      grnNumber: 'ORD-0001',
    });
  });

  it('orders same-day movements by execution time (createdAt descending) even when movementDate has midnight UTC', async () => {
    // 1. Earlier event (10:37 AM repack) with timestamped movementDate
    await InternalMovementModel.create({
      id: 'mov-morning-repack',
      facilityId,
      movementType: 'REPACK',
      movementDate: new Date('2026-11-07T10:37:32.542Z'),
      createdAt: new Date('2026-11-07T10:37:33.324Z'),
      targetGrnId: grnId,
      targetGrnNumber: 'ORD-0001',
      sourceGrnIds: [grnId],
      sourceGrnNumbers: ['ORD-0001'],
      totalBagsMoved: 50,
      smallBagsMoved: 25,
      bigBagsMoved: 25,
      hamaliBags: 50,
      hamaliRate: 25,
      hamaliCharge: 1250,
      financialSnapshot: { rentAmount: 1000, totalPaid: 0, remainingBalance: 1000, paymentStatus: 'NOT_SETTLED' },
      remarks: 'Morning repack',
      performedBy: 'usr-order-admin',
    });

    // 2. Later event (15:53 PM merge) with midnight-UTC movementDate from date-picker
    await InternalMovementModel.create({
      id: 'mov-afternoon-merge',
      facilityId,
      movementType: 'MERGE',
      movementDate: new Date('2026-11-07T00:00:00.000Z'),
      createdAt: new Date('2026-11-07T15:53:34.131Z'),
      targetGrnId: grnId,
      targetGrnNumber: 'ORD-0001',
      sourceGrnIds: ['grn-source-x'],
      sourceGrnNumbers: ['SRC-0099'],
      totalBagsMoved: 40,
      smallBagsMoved: 20,
      bigBagsMoved: 20,
      hamaliBags: 40,
      hamaliRate: 25,
      hamaliCharge: 1000,
      financialSnapshot: { rentAmount: 800, totalPaid: 0, remainingBalance: 800, paymentStatus: 'NOT_SETTLED' },
      remarks: 'Afternoon merge',
      performedBy: 'usr-order-admin',
    });

    // Test service layer
    const movements = await internalMovementService.getMovementsForGrn(facilityId, grnId);
    expect(movements).toHaveLength(2);
    expect(movements[0].id).toBe('mov-afternoon-merge');
    expect(movements[0].movementType).toBe('MERGE');
    expect(movements[1].id).toBe('mov-morning-repack');
    expect(movements[1].movementType).toBe('REPACK');

    // Test HTTP endpoint
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/internal-movements/grn/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.movements).toHaveLength(2);
    expect(res.body.movements[0].id).toBe('mov-afternoon-merge');
    expect(res.body.movements[1].id).toBe('mov-morning-repack');
  });
});
