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

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const testFacilityId = 'fac-loan-settle-01';

describe('Bond Loan Payment Modes & Settlement Lifecycle (Phase 5)', () => {
  let operatorToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: operatorToken } = await seedAuth({
      userId: 'usr-loan-settle-op',
      username: 'loan.settle.op',
      role: 'OPERATOR',
      facilityIds: [testFacilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedFacility({ id: testFacilityId, code: 'LSFAC1', name: 'Loan Settle Facility' });
    customerId = await seedCustomer({ id: 'cust-loan-settle-01', facilityId: testFacilityId, name: 'Ramesh Patel' });
    const commodity = await CommodityModel.create({
      id: 'cmd-apple-loan',
      name: 'Shimla Apple',
      normalizedName: 'shimla apple',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  async function createPledgedGrn() {
    const inwardRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        date: new Date().toISOString(),
        customerId,
        commodityId,
        chamber: 'CH-APPLE-01',
        bags: 100,
        bagType: 'S',
        smallBagWeight: 20,
        rentType: 'Seasonal',
        rentAmount: 3000,
        bagPrice: 30,
        smallBags: 100,
        bigBags: 0,
        gpNumber: 'GP-APL-01',
        storageMark: 'APL-01',
        partyMark: 'RP-01',
        isBondForLoan: true,
        loanStatus: 'NOT_TAKEN',
      });
    const grnId = inwardRes.body.grn.id;
    await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ loanStatus: 'TAKEN', bankName: 'Punjab National Bank', referenceNumber: 'PNB-LN-2026-44' });
    return grnId;
  }

  it('settles loan with CASH mode, receiver details, and optional Aadhaar', async () => {
    const grnId = await createPledgedGrn();
    const settleRes = await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        loanStatus: 'CLEARED',
        settlement: {
          paymentMode: 'Cash',
          amountPaid: 45000,
          receiverName: 'Harish Chandra',
          receiverAadhaar: '987654321098',
          remarks: 'Cash received at office counter',
        },
      });

    expect(settleRes.status).toBe(200);
    const grn = settleRes.body.grn;
    expect(grn.loanStatus).toBe('CLEARED');
    expect(grn.loanSettlementMode).toBe('Cash');
    expect(grn.loanSettlementAmount).toBe(45000);
    expect(grn.loanSettlementReceiverName).toBe('Harish Chandra');
    expect(grn.loanSettlementReceiverAadhaar).toBe('987654321098');
    expect(grn.loanClearedAt).toBeDefined();

    const auditRecord = await AuditLogModel.findOne({
      eventType: 'GRN_LOAN_STATUS_UPDATED',
      resourceId: grnId,
      'details.newStatus': 'CLEARED',
    });
    expect(auditRecord).toBeDefined();
    const details = auditRecord?.details as
      | { settlement?: { paymentMode?: string; amountPaid?: number; receiverName?: string } }
      | undefined;
    expect(details?.settlement?.paymentMode).toBe('Cash');
    expect(details?.settlement?.amountPaid).toBe(45000);
    expect(details?.settlement?.receiverName).toBe('Harish Chandra');
  });

  it('settles loan with UPI mode requiring reference/UTR number', async () => {
    const grnId = await createPledgedGrn();

    // Missing reference should fail validation
    const invalidRes = await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        loanStatus: 'CLEARED',
        settlement: { paymentMode: 'UPI', amountPaid: 60000, receiverName: 'Harish Chandra' },
      });
    expect(invalidRes.status).toBe(400);

    // Valid UPI settlement
    const settleRes = await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        loanStatus: 'CLEARED',
        settlement: {
          paymentMode: 'UPI',
          amountPaid: 60000,
          utrNumber: 'UTR-UPI-2026-887766',
          upiId: 'ramesh@upi',
          receiverName: 'Harish Chandra',
          remarks: 'Direct UPI transfer',
        },
      });

    expect(settleRes.status).toBe(200);
    expect(settleRes.body.grn.loanSettlementMode).toBe('UPI');
    expect(settleRes.body.grn.loanSettlementUtr).toBe('UTR-UPI-2026-887766');
  });

  it('settles loan with BANK_TRANSFER mode requiring Bank, Account, IFSC, UTR', async () => {
    const grnId = await createPledgedGrn();

    // Invalid IFSC should fail validation
    const badIfscRes = await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        loanStatus: 'CLEARED',
        settlement: {
          paymentMode: 'Bank Transfer',
          amountPaid: 80000,
          utrNumber: 'UTR-NEFT-991122',
          bankName: 'ICICI Bank',
          accountNumber: '123456789012',
          ifscCode: 'INVALID_IFSC',
          receiverName: 'Accountant Ramesh',
        },
      });
    expect(badIfscRes.status).toBe(400);

    // Valid bank transfer settlement
    const settleRes = await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        loanStatus: 'CLEARED',
        settlement: {
          paymentMode: 'Bank Transfer',
          amountPaid: 80000,
          utrNumber: 'UTR-NEFT-991122',
          bankName: 'ICICI Bank',
          accountNumber: '123456789012',
          ifscCode: 'ICIC0001234',
          branchName: 'Main Branch',
          receiverName: 'Accountant Ramesh',
        },
      });

    expect(settleRes.status).toBe(200);
    expect(settleRes.body.grn.loanSettlementMode).toBe('Bank Transfer');
    expect(settleRes.body.grn.loanSettlementBankName).toBe('ICICI Bank');
    expect(settleRes.body.grn.loanSettlementIfsc).toBe('ICIC0001234');
    expect(settleRes.body.grn.loanSettlementReceiverName).toBe('Accountant Ramesh');
  });

  it('unblocks outward delivery gate immediately upon loan payment settlement', async () => {
    const grnId = await createPledgedGrn();

    // Delivery is blocked while TAKEN
    const blockedRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, date: new Date().toISOString(), smallBags: 25, bigBags: 0 });
    expect(blockedRes.status).toBe(400);
    expect(blockedRes.body.error).toContain('Outward blocked');

    // Settle loan
    await request(app)
      .patch(`/api/facilities/${testFacilityId}/grns/${grnId}/loan-status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        loanStatus: 'CLEARED',
        settlement: {
          paymentMode: 'UPI',
          amountPaid: 30000,
          utrNumber: 'UTR-RELEASE-5544',
          receiverName: 'Duty Cashier',
        },
      });

    // Delivery succeeds immediately
    const successRes = await request(app)
      .post(`/api/facilities/${testFacilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId, date: new Date().toISOString(), smallBags: 25, bigBags: 0 });
    expect(successRes.status).toBe(201);
    expect(successRes.body.delivery.challanNumber).toBeDefined();
  });
});
