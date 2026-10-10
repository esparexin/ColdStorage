import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';
import { nextTestGrnNumber } from './helpers/grn-number-fixtures.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const testFacilityId = 'fac-bond-loan-01';

describe('Bond / Loan Control Lifecycle Tests (Phase 1)', () => {
  let operatorToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: operatorToken } = await seedAuth({
      userId: 'usr-bond-loan-op',
      username: 'bond.loan.op',
      role: 'OPERATOR',
      facilityIds: [testFacilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: testFacilityId, code: 'BLFAC1', name: 'Bond Loan Test Facility' });

    customerId = await seedCustomer({
      id: 'cust-loan-01',
      facilityId: testFacilityId,
      name: 'Kalyan Farmer',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-loan',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti loan',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  function makeInwardPayload(overrides: Record<string, unknown> = {}) {
    return {
      grnNumber: nextTestGrnNumber(),
      date: new Date().toISOString(),
      customerId,
      commodityId,
      chamber: 'CH-LOAN-01',
      bags: 100,
      bagType: 'S',
      smallBagWeight: 50,
      rentType: 'Seasonal',
      rentAmount: 5000,
      bagPrice: 50,
      smallBags: 100,
      bigBags: 0,
      gpNumber: 'GP-L1',
      storageMark: 'ST-01',
      partyMark: 'KF-01',
      ...overrides,
    };
  }

  it('creates an inward receipt without bond loan (standard storage) and allows outward', async () => {
    const inwardRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: false }));

    expect(inwardRes.status).toBe(201);
    expect(inwardRes.body.grn.isBondForLoan).toBe(false);
    expect(inwardRes.body.grn.loanStatus).toBe('NONE');
    expect(inwardRes.body.grn.bondNumber).toBeNull();

    const grnId = inwardRes.body.grn.id;

    // Outward delivery is permitted
    const delRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        date: new Date().toISOString(),
        smallBags: 10,
        bigBags: 0,
      });

    expect(delRes.status).toBe(201);
    expect(delRes.body.delivery.challanNumber).toBeDefined();
  });

  it('creates a bond for loan with NOT_TAKEN initially, and allows outward', async () => {
    const inwardRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({
        isBondForLoan: true,
        loanStatus: 'NOT_TAKEN',
      }));

    expect(inwardRes.status).toBe(201);
    expect(inwardRes.body.grn.isBondForLoan).toBe(true);
    expect(inwardRes.body.grn.loanStatus).toBe('NOT_TAKEN');
    // Bond # is reference-only: no BND- number is minted, the GR Number is the business key.
    expect(inwardRes.body.grn.bondNumber).toBeNull();
    expect(inwardRes.body.grn.grnNumber).toMatch(/^\d{4}$/);

    const grnId = inwardRes.body.grn.id;

    // Outward is allowed because loan has NOT been taken yet
    const delRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        date: new Date().toISOString(),
        smallBags: 20,
        bigBags: 0,
      });

    expect(delRes.status).toBe(201);
  });

  it('blocks outward delivery when loanStatus is TAKEN, and unblocks when CLEARED', async () => {
    // 1. Create Inward Bond
    const inwardRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({
        isBondForLoan: true,
        loanStatus: 'NOT_TAKEN',
      }));

    expect(inwardRes.status).toBe(201);
    // Bond # is reference-only: no BND- number is minted, the GR Number is the business key.
    expect(inwardRes.body.grn.bondNumber).toBeNull();
    expect(inwardRes.body.grn.grnNumber).toMatch(/^\d{4}$/);
    const grnId = inwardRes.body.grn.id;

    // 2. Operator updates loan status to TAKEN (party has availed loan against this GRN).
    // The lender name / pledge account / notes trio is retired: settlement is the only
    // place loan payment details and notes are captured.
    const updateTakenRes = await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ loanStatus: 'TAKEN' });

    expect(updateTakenRes.status).toBe(200);
    expect(updateTakenRes.body.grn.loanStatus).toBe('TAKEN');
    expect(updateTakenRes.body.grn.loanTakenAt).toBeDefined();

    // Verify audit log recorded
    const auditRecord = await AuditLogModel.findOne({
      eventType: 'GRN_LOAN_STATUS_UPDATED',
      resourceId: grnId,
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.details?.newStatus).toBe('TAKEN');

    // 3. Attempt Outward Delivery while loan is outstanding -> MUST BE BLOCKED
    const blockedDelRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        date: new Date().toISOString(),
        smallBags: 10,
        bigBags: 0,
      });

    expect(blockedDelRes.status).toBe(400);
    expect(blockedDelRes.body.error).toContain('Outward blocked — Active loan hold against');
    // With no minted bond number the hold is referenced by the GR Number alone.
    expect(blockedDelRes.body.error).toContain(inwardRes.body.grn.grnNumber);

    // Check movement history passbook reflects loan hold
    const histRes = await request(app)
      .get(`/api/facilities/${testFacilityId}/grns/${grnId}/movement-history`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(histRes.status).toBe(200);
    expect(histRes.body.history.loanStatus).toBe('TAKEN');
    expect(histRes.body.history.isLoanHoldActive).toBe(true);

    // 4. Operator confirms "Loan Cleared" after loan repayment
    const updateClearedRes = await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        loanStatus: 'CLEARED',
        remarks: 'NOC received from SBI branch',
      });

    expect(updateClearedRes.status).toBe(200);
    expect(updateClearedRes.body.grn.loanStatus).toBe('CLEARED');
    expect(updateClearedRes.body.grn.loanClearedAt).toBeDefined();

    // 5. Outward Delivery is now permitted
    const unblockedDelRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        date: new Date().toISOString(),
        smallBags: 15,
        bigBags: 0,
      });

    expect(unblockedDelRes.status).toBe(201);
    expect(unblockedDelRes.body.delivery.challanNumber).toBeDefined();

    // 6. Movement passbook shows loan cleared and hold inactive
    const finalHistRes = await request(app)
      .get(`/api/facilities/${testFacilityId}/grns/${grnId}/movement-history`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(finalHistRes.status).toBe(200);
    expect(finalHistRes.body.history.loanStatus).toBe('CLEARED');
    expect(finalHistRes.body.history.isLoanHoldActive).toBe(false);
    expect(finalHistRes.body.history.bondNumber).toBe(inwardRes.body.grn.bondNumber);
  });
});
