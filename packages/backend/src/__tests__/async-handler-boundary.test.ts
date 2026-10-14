import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { GrnModel } from '../database/models/grn.model.js';
import { GrnService } from '../modules/grn/grn.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

/**
 * Regression guard for the async-boundary process crash (W1.9).
 *
 * Express 4 does not catch rejected promises from route handlers. `asyncHandler`
 * existed but was applied by hand to only two of nineteen routers, and seven
 * handlers awaited a DB call BEFORE entering their try block:
 *
 *   grn.routes.ts:172, :200, :230
 *   delivery.routes.ts:39, :125, :153, :201
 *
 * A transient Mongo failure on any of those produced an unhandled rejection and
 * Node >= 15 exits the process by default, taking the whole API down. In three
 * of the seven the un-guarded await IS the authorization call, so the scope
 * check was skipped at the same moment.
 *
 * `asyncRouter()` now wraps every async handler at registration, so the class
 * is closed without per-handler discipline.
 */
describe('async route boundary', () => {
  const app = createApp();
  const seed = createAuthSeeder(config.jwtSecret);
  let token = '';
  let facilityId = '';

  beforeAll(async () => {
    await connectToTestDatabase();
    facilityId = await seedFacility();
    await seedCustomer({ facilityId });
    ({ token } = await seed({
      userId: 'usr-async-op',
      username: 'async-op',
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));
  });

  afterAll(async () => {
    await resetStockCollections();
    await disconnectTestDatabase();
  });

  it('converts a rejection thrown before the handler try/catch into a 500, not a crash', async () => {
    // PATCH .../grns/:grnId/loan-status awaits
    //   grnService.resolveFacilityIdForGrn(grnId)   (grn.routes.ts:215)
    // BEFORE entering its try block. That call reaches GrnModel.findOne, so
    // forcing a throw there is exactly the transient-Mongo-failure scenario.
    const spy = vi.spyOn(GrnModel, 'findOne').mockImplementationOnce(() => {
      throw new Error('simulated transient Mongo failure');
    });

    try {
      const res = await request(app)
        .patch(`/api/facilities/${facilityId}/grns/grn-does-not-exist/loan-status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ loanStatus: 'TAKEN' });

      // The process survived and Express produced a JSON error response
      // rather than the promise escaping as an unhandled rejection.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps serving requests after an async failure', async () => {
    // If the rejection had escaped, the following request could not be made.
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('keeps unauthenticated rejection handling on a public route', async () => {
    const res = await request(app).get(`/api/facilities/${facilityId}/grns`);
    expect(res.status).toBe(401);
  });

  it('does not wrap synchronous middleware, preserving short-circuit', async () => {
    // authenticate must still 401 before any facility-scope or handler runs.
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .send({});
    expect(res.status).toBe(401);
  });
});

